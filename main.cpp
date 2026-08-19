// ================================================================
//  main.cpp  —  IoT Multi-Node Seismic Detection System
//  Board  : LilyGO T3-S3  (ESP32-S3 + SX1262 on-board)
//
//  Flash sensor nodes : pio run -e sensor_node  -t upload
//    (change -DNODE_ID=1/2/3/4 in platformio.ini before each flash)
//  Flash gateway      : pio run -e gateway_node -t upload
//
//  Architecture:
//    Core 0 (highest priority) — 250 Hz sensor acquisition loop
//    Core 1                    — LoRa TX/RX, WiFi, SD logging
// ================================================================

#include <Arduino.h>
#include <esp_task_wdt.h>
#include "config.h"
#include "types.h"
#include "ADXL355_Driver.h"
#include "MPU6050_Driver.h"
#include "SignalProcessor.h"
#include "LoRaComm.h"
#include "VotingManager.h"
#include "DataLogger.h"

// ── Global module instances ────────────────────────────────────
static ADXL355_Driver  adxl;
static MPU6050_Driver  mpu;
static SignalProcessor dsp;
static LoRaComm        lora;
static VotingManager   voter;
static DataLogger      sdLog;
static WiFiCloud       cloud;

// ── Inter-core shared state ────────────────────────────────────
static volatile bool     g_eqDetected  = false;
static volatile float    g_detectedPGA = 0.0f;
static volatile uint32_t g_detectedTs  = 0;
static volatile uint8_t  g_confirmCnt  = 0;
static SemaphoreHandle_t g_alertSem    = nullptr;  // binary semaphore

// ================================================================
//  CORE 0 TASK — 250 Hz Sensor Acquisition  (HIGHEST PRIORITY)
//
//  Reads ADXL355 + MPU6050 → signal processing pipeline →
//  threshold detection → signals Core 1 via semaphore
// ================================================================
static void taskSensorCore0(void* /*arg*/) {
    esp_task_wdt_add(nullptr);

    TickType_t wake   = xTaskGetTickCount();
    const TickType_t period = pdMS_TO_TICKS(4);   // 250 Hz = 4 ms

    while (true) {
        // ── 1. Read raw sensors ────────────────────────────────
        AccelData rawAccel;
        GyroData  rawGyro;
        adxl.read(rawAccel);
        mpu.read(rawGyro);

        // ── 2. Signal processing pipeline ─────────────────────
        //    Complementary fusion → gravity removal → HPF → LPF
        AccelData earthAccel = dsp.process(rawAccel, rawGyro);

        // ── 3. Threshold detection (multi-sample confirm) ──────
        DetectionResult det = dsp.detect(earthAccel);

        if (det.detected && !g_eqDetected) {
            g_eqDetected  = true;
            g_detectedPGA = det.pga;
            g_detectedTs  = det.timestamp_ms;
            g_confirmCnt  = CONFIRM_SAMPLES;
            // Wake Core 1 LoRa TX task immediately
            xSemaphoreGiveFromISR(g_alertSem, nullptr);
        }

        // ── 4. Queue sample for SD + cloud upload (non-blocking) ─
        sdLog.writeSample(earthAccel);
        cloud.queueSample(earthAccel);

        esp_task_wdt_reset();
        vTaskDelayUntil(&wake, period);   // precise 4 ms period
    }
}

// ================================================================
//  CORE 1 TASK A — LoRa TX  [SENSOR NODE ONLY]
//
//  Wakes when Core 0 detects earthquake, broadcasts P2P alert
// ================================================================
static void taskLoRaTx(void* /*arg*/) {
    while (true) {
        // Block until earthquake semaphore from Core 0
        if (xSemaphoreTake(g_alertSem, portMAX_DELAY) == pdTRUE) {
            float    pga = g_detectedPGA;
            uint32_t ts  = g_detectedTs;
            uint8_t  cnt = g_confirmCnt;

            bool ok = lora.sendAlert(NODE_ID, ts, pga, cnt);

            // Log event to SD card
            char msg[80];
            snprintf(msg, sizeof(msg),
                     "ALERT Node%d PGA=%.4fg @%lums TX=%s",
                     NODE_ID, pga, ts, ok ? "OK" : "FAIL");
            sdLog.writeEvent(msg);

            // 2-second dead-band before re-arming detection
            vTaskDelay(pdMS_TO_TICKS(2000));
            g_eqDetected = false;
        }
    }
}

// ================================================================
//  CORE 1 TASK B — LoRa RX + M-of-N Voting  [GATEWAY ONLY]
//
//  Listens for P2P alerts, applies 3-of-4 consensus, sends
//  confirmed earthquake to Vercel API
// ================================================================
static void taskGatewayVoting(void* /*arg*/) {
    lora.startListening();

    // Callback fires inside lora.poll() when a valid packet arrives
    lora.onReceive([](const LoRaPacket& pkt, int rssi, float snr) {
        ConsensusResult res = voter.addVote(pkt);

        if (res.alert) {
            // ── EARTHQUAKE CONFIRMED ──────────────────────────
            log_w("=== EARTHQUAKE ALERT  PGA=%.4fg  %d/%d nodes ===",
                  res.network_pga, res.votes, TOTAL_NODES);

            // Push to Vercel dashboard
            cloud.sendAlert(res, NODE_ID);

            // Log to SD
            char msg[128];
            snprintf(msg, sizeof(msg),
                     "CONSENSUS PGA=%.4fg votes=%d ts=%lu",
                     res.network_pga, res.votes, res.alert_timestamp_ms);
            sdLog.writeEvent(msg);

            // 5-second quiet window before re-arming voter
            vTaskDelay(pdMS_TO_TICKS(5000));
            voter.reset();
        }
    });

    while (true) {
        lora.poll();     // check _rxFlag, process packet if ready
        voter.tick();    // expire stale windows
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

// ================================================================
//  CORE 1 TASK C — WiFi Cloud Upload  (both roles)
//
//  Reconnects WiFi if dropped, then drains sample queue every 5 s
// ================================================================
static void taskCloudUpload(void* /*arg*/) {
    // Retry WiFi connection with 10-second back-off
    while (!cloud.begin()) {
        log_w("[WiFi] Connection failed — retrying in 10 s...");
        vTaskDelay(pdMS_TO_TICKS(10000));
    }

    // Sync system clock via NTP — required for TLS certificate validation
    configTime(0, 0, "pool.ntp.org", "time.google.com");
    log_i("[NTP] Clock synced");

    while (true) {
        if (!cloud.isConnected()) {
            log_w("[WiFi] Lost connection — reconnecting...");
            cloud.begin();
            configTime(0, 0, "pool.ntp.org", "time.google.com");
        }
        cloud.uploadPending();
        vTaskDelay(pdMS_TO_TICKS(5000));
    }
}

// ================================================================
//  setup() — hardware initialisation + FreeRTOS task creation
// ================================================================
void setup() {
    Serial.begin(BAUD_RATE);
    delay(500);

    log_i("============================================");
    log_i(" Seismic Detection System  v%s", FW_VERSION);
    log_i(" Role   : %s", NODE_ROLE == 0 ? "SENSOR NODE" : "GATEWAY");
    log_i(" Node ID: %d", NODE_ID);
    log_i("============================================");

    // Watchdog: reboot if any subscribed task stalls for > 10 s
    esp_task_wdt_init(10, true);

    // Binary semaphore for earthquake alert signalling Core0 → Core1
    g_alertSem = xSemaphoreCreateBinary();

    // ── Hardware init ──────────────────────────────────────────
    bool adxl_ok = adxl.begin();
    bool mpu_ok  = mpu.begin();
    bool lora_ok = lora.begin();
    bool sd_ok   = sdLog.begin();

    if (!adxl_ok) log_e("ADXL355 FAILED — check FSPI wiring (GPIO 35/36/37/10)");
    if (!mpu_ok)  log_e("MPU6050 FAILED — check I2C wiring (GPIO 18/17)");
    if (!lora_ok) log_e("SX1262  FAILED — check LilyGO T3-S3 board variant");
    if (!sd_ok)   log_w("MicroSD FAILED — logging to cloud only");

    adxl.selfTest();
    mpu.selfTest();

    // ── Core 0 task — runs on BOTH node types ─────────────────
    xTaskCreatePinnedToCore(
        taskSensorCore0, "SensorAcq",
        8192,                           // stack bytes
        nullptr,
        configMAX_PRIORITIES - 1,       // highest priority
        nullptr,
        0                               // pinned to Core 0
    );

    // ── Core 1 tasks — role dependent ─────────────────────────
    if (NODE_ROLE == 0) {
        // SENSOR NODE: broadcasts alert via LoRa
        xTaskCreatePinnedToCore(
            taskLoRaTx, "LoRaTX",
            6144, nullptr,
            configMAX_PRIORITIES - 2,
            nullptr, 1
        );
    } else {
        // GATEWAY: receives alerts, applies M-of-N voting
        xTaskCreatePinnedToCore(
            taskGatewayVoting, "GWVoting",
            8192, nullptr,
            configMAX_PRIORITIES - 2,
            nullptr, 1
        );
    }

    // Cloud upload task runs on both sensor nodes and gateway
    xTaskCreatePinnedToCore(
        taskCloudUpload, "CloudUp",
        8192, nullptr,
        configMAX_PRIORITIES - 3,
        nullptr, 1
    );

    log_i("[BOOT] All tasks created. 250 Hz acquisition active.");
}

// loop() is unused — FreeRTOS tasks own execution
void loop() {
    vTaskDelay(pdMS_TO_TICKS(60000));
}

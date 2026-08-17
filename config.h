#pragma once
// ================================================================
// config.h  —  Hardware & System Configuration
// Board   : LilyGO T3-S3  (ESP32-S3 + SX1262 on-board)
//
// BEFORE FLASHING:
//   1. Set WIFI_SSID / WIFI_PASS
//   2. Set VERCEL_HOST to your deployed Vercel project URL
//   3. Set VERCEL_API_KEY to a shared secret string (same in Vercel env vars)
//   4. In platformio.ini change -DNODE_ID= to 1/2/3/4 per sensor board
// ================================================================

// ── LilyGO T3-S3 SX1262 on-board LoRa SPI bus ─────────────────
#define PIN_LORA_SCK      5
#define PIN_LORA_MISO     3
#define PIN_LORA_MOSI     6
#define PIN_LORA_CS       7
#define PIN_LORA_RST      8
#define PIN_LORA_DIO1    33   // RxDone / IRQ
#define PIN_LORA_BUSY    34   // BUSY line (SX1262 specific, no SX1276)
#define PIN_LORA_ANT     38   // Antenna switch enable

// ── ADXL355 Accelerometer (external, wire to FSPI bus) ─────────
#define PIN_ADXL_SCK     36
#define PIN_ADXL_MISO    37
#define PIN_ADXL_MOSI    35
#define PIN_ADXL_CS      10

// ── MPU6050 Gyroscope (I2C) ────────────────────────────────────
#define PIN_I2C_SDA      18
#define PIN_I2C_SCL      17

// ── On-board microSD card ──────────────────────────────────────
#define PIN_SD_CS        13
#define PIN_SD_SCK       14
#define PIN_SD_MISO       2
#define PIN_SD_MOSI      11

// ── Misc ───────────────────────────────────────────────────────
#define PIN_BATTERY_ADC   4   // 12-bit battery voltage sense
#define PIN_SW420         9   // SW-420 vibration sensor (digital)

// ── Sampling & Detection ───────────────────────────────────────
#define SAMPLE_RATE_HZ        250
#define SAMPLE_PERIOD_US      4000         // 1,000,000 / 250
#define ADXL355_SENSITIVITY   125000.0f    // LSB/g (±4 g mode)
#define DETECT_THRESHOLD_G    0.02f        // 20 mg primary trigger
#define CONFIRM_SAMPLES       3            // Consecutive samples required
#define HPF_CUTOFF_HZ         0.5f         // High-pass corner frequency
#define LPF_CUTOFF_HZ         20.0f        // Low-pass corner frequency
#define COMP_ALPHA            0.98f        // Complementary filter weight

// ── SX1262 LoRa (RadioLib) ────────────────────────────────────
#define LORA_FREQ_MHZ         915.0        // 915 MHz ISM band
#define LORA_BW_KHZ           125.0        // 125 kHz bandwidth
#define LORA_SF               7            // Spreading factor 7
#define LORA_CR               5            // Coding rate 4/5
#define LORA_SYNC_WORD        0x34         // Private network
#define LORA_TX_DBM           22           // +22 dBm max for SX1262
#define LORA_PREAMBLE         8            // 8 preamble symbols

// ── M-of-N Consensus Voting ────────────────────────────────────
#define TOTAL_NODES           4
#define VOTES_REQUIRED        3            // 3-of-4 confirms earthquake
#define VOTE_WINDOW_MS        500          // Temporal coincidence window

// ── WiFi ───────────────────────────────────────────────────────
#define WIFI_SSID        "YOUR_WIFI_SSID"
#define WIFI_PASS        "YOUR_WIFI_PASSWORD"
#define WIFI_TIMEOUT_MS  15000

// ── Vercel Dashboard API ────────────────────────────────────────
// After deploying the Next.js dashboard set VERCEL_HOST to your URL
// e.g. "seismic-dashboard-abc123.vercel.app"
#define VERCEL_HOST          "your-project.vercel.app"
#define VERCEL_API_KEY       "YOUR_SECRET_KEY_HERE"
#define VERCEL_SAMPLES_PATH  "/api/ingest/samples"
#define VERCEL_ALERT_PATH    "/api/ingest/alert"
#define UPLOAD_INTERVAL_MS   5000          // Push batch every 5 seconds

// ── MicroSD ────────────────────────────────────────────────────
#define SD_LOG_DIR       "/seismic"

// ── System ─────────────────────────────────────────────────────
#define FW_VERSION       "1.0.0"
#define BAUD_RATE        115200

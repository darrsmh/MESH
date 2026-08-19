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

// 32-byte key shared by the deployed nodes and gateway. Replace before flashing.
#define LORA_AUTH_KEY \
		{ 0x8d, 0x42, 0x17, 0xa9, 0x63, 0xf0, 0x2c, 0x71, \
			0x5b, 0xe6, 0x39, 0x84, 0xd2, 0x0f, 0xac, 0x58, \
			0x96, 0x31, 0xc7, 0x4e, 0x02, 0xb8, 0x7a, 0xed, \
			0x15, 0x60, 0xf3, 0x29, 0x4b, 0x8c, 0xd5, 0x77 }
#define LORA_AUTH_TAG_BYTES    8

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

// ── TLS Root CA (ISRG Root X1 — Let's Encrypt) ────────────────
// Used by WiFiClientSecure to verify Vercel's TLS certificate.
static const char* ROOT_CA_PEM = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
)EOF";

// ── System ─────────────────────────────────────────────────────
#define FW_VERSION       "1.0.0"
#define BAUD_RATE        115200

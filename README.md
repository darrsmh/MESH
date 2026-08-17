# IoT Multi-Node Seismic Detection System
## LilyGO T3-S3 (ESP32-S3 + SX1262) + Vercel Live Dashboard

---

## Project Overview

A 4-node earthquake early warning system. Each node runs on a LilyGO T3-S3
board (ESP32-S3 + SX1262 LoRa), reads an ADXL355 accelerometer and MPU6050
gyroscope at 250 Hz, applies signal processing, and broadcasts P2P LoRa
alerts on earthquake detection. A gateway node collects votes from all sensor
nodes, applies 3-of-4 M-of-N consensus, and pushes the confirmed alert and
raw data to a live Vercel seismogram dashboard.

---

## Repository Structure

```
seismic_project/
├── firmware/                  ← PlatformIO project (flash to ESP32)
│   ├── platformio.ini
│   ├── include/
│   │   ├── config.h           ← EDIT: WiFi, Vercel URL, API key
│   │   └── types.h
│   ├── src/
│   │   └── main.cpp           ← FreeRTOS entry point (dual-core)
│   └── lib/
│       ├── ADXL355_Driver/    ← SPI accelerometer (FSPI bus)
│       ├── MPU6050_Driver/    ← I2C gyroscope
│       ├── SignalProcessor/   ← HPF, LPF, complementary filter
│       ├── LoRaComm/          ← SX1262 via RadioLib
│       ├── VotingManager/     ← 3-of-4 M-of-N consensus
│       └── DataLogger/        ← MicroSD + Vercel HTTPS POST
│
└── dashboard/                 ← Next.js 14 App Router (deploy to Vercel)
    ├── package.json
    ├── next.config.js
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx           ← Live seismogram UI
    │   └── api/
    │       ├── dashboard/route.ts      ← GET: serve live data to UI
    │       └── ingest/
    │           ├── samples/route.ts    ← POST: receive accel data
    │           └── alert/route.ts     ← POST: receive earthquake alert
    └── lib/
        └── store.ts           ← Vercel KV data access layer
```

---

## Part 1 — Firmware Setup

### Hardware Required (×4 sensor nodes + ×1 gateway)

| Component | Notes |
|-----------|-------|
| LilyGO T3-S3 | ESP32-S3 + SX1262 on-board LoRa |
| ADXL355 breakout | Wire to FSPI: SCK=36, MISO=37, MOSI=35, CS=10 |
| MPU6050 breakout | Wire to I2C: SDA=18, SCL=17 |
| MicroSD module | On-board SD slot (CS=13, SCK=14, MISO=2, MOSI=11) |
| 915 MHz antenna | Connect to SMA on LilyGO board |

### Step 1 — Edit config.h

Open `firmware/include/config.h` and update:

```cpp
#define WIFI_SSID       "your_network_name"
#define WIFI_PASS       "your_password"
#define VERCEL_HOST     "seismic-dashboard-abc123.vercel.app"
#define VERCEL_API_KEY  "any_long_random_secret_string"
```

### Step 2 — Flash Sensor Nodes

In `platformio.ini`, change `-DNODE_ID=1` to the node number (1, 2, 3, or 4).
Flash each board:

```bash
cd firmware
pio run -e sensor_node -t upload
```

Repeat with NODE_ID=2, 3, 4 for each sensor board.

### Step 3 — Flash Gateway

```bash
pio run -e gateway_node -t upload
```

### Step 4 — Monitor (optional)

```bash
pio device monitor -e sensor_node -b 115200
```

Expected boot output:
```
=== Seismic Detection System v1.0.0 ===
Role   : SENSOR NODE
Node ID: 1
[ADXL355] OK — ±4 g, 250 Hz, ID=0xAD
[MPU6050] OK — ±250 °/s, 250 Hz
[LoRa]    SX1262 OK — 915.0 MHz SF7 BW125 kHz +22 dBm
[SD]      OK — 14832 MB free
[BOOT]    All tasks created. 250 Hz acquisition active.
```

---

## Part 2 — Vercel Dashboard Deployment

### Step 1 — Deploy to Vercel

```bash
cd dashboard
npm install
```

Push the `dashboard/` folder to a GitHub repository.
In Vercel → "New Project" → import from GitHub → deploy.

### Step 2 — Add Vercel KV Storage

In Vercel dashboard: **Storage → Create Database → KV (Redis)**.
Link it to your project. This auto-sets `KV_REST_API_URL` and
`KV_REST_API_TOKEN` environment variables.

### Step 3 — Set Environment Variables

In Vercel → Settings → Environment Variables, add:

| Variable | Value |
|----------|-------|
| `VERCEL_API_KEY` | Same secret string as in `config.h` |
| `ALERT_WEBHOOK_URL` | (Optional) ntfy.sh or Twilio webhook URL |

### Step 4 — Update config.h

Copy your Vercel deployment URL (e.g. `seismic-dashboard-abc123.vercel.app`)
into `VERCEL_HOST` in `config.h`, then re-flash all boards.

### Dashboard URL

Visit `https://your-project.vercel.app` to see the live seismogram.

---

## Signal Processing Pipeline

```
ADXL355 (250 Hz)  ──┐
                     ├─→ Complementary Filter (α=0.98)
MPU6050 Gyro (250 Hz)─┘     └─→ Gravity removal (rotation matrix)
                                       └─→ High-Pass Filter (0.5 Hz HPF)
                                               └─→ Low-Pass Butterworth (20 Hz LPF)
                                                       └─→ PGA threshold (0.02 g)
                                                               └─→ Multi-sample confirm (3×)
                                                                       └─→ LoRa P2P TX
                                                                               └─→ M-of-N 3/4 voting
                                                                                       └─→ Vercel API POST
```

---

## LoRa P2P Packet Format

```
Byte  Field           Type     Notes
────────────────────────────────────
0     pkt_type        uint8    0x01 = earthquake alert
1     node_id         uint8    1–4
2–5   timestamp_ms    uint32   millis() at detection
6–9   pga             float    Peak Ground Acceleration (g)
10    confirm_count   uint8    Number of consecutive samples above threshold
11    checksum        uint8    XOR of bytes 0–10
────────────────────────────────────
Total: 12 bytes  (air time SF7 BW125: ~45 ms)
```

---

## Vercel API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/ingest/samples` | X-Api-Key | Receive batch of AccelData from node |
| `POST` | `/api/ingest/alert` | X-Api-Key | Receive earthquake consensus alert from gateway |
| `GET`  | `/api/dashboard` | None | Serve latest data to the UI (polled every 2 s) |

---

## Detection Thresholds

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Detection threshold | 0.02 g | ≈ MMI III (felt by humans) |
| Confirmation samples | 3 consecutive | Reduces single-spike false alarms |
| M-of-N votes required | 3 of 4 | Eliminates local single-node noise |
| Voting window | 500 ms | P-waves travel ≈5 km in 500 ms |
| LoRa air time (SF7) | ~45 ms | Well within 87–92 ms target latency |

---

## FreeRTOS Task Architecture

```
Core 0 (highest priority)    Core 1
─────────────────────────    ──────────────────────────────
taskSensorCore0 (250 Hz)     taskLoRaTx    [sensor nodes]
  → ADXL355 read             taskGateway   [gateway]
  → MPU6050 read             taskCloudUpload (both roles)
  → SignalProcessor
  → EQ detection
  → queue to SD + cloud
  → semaphore → Core 1
```

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `ADXL355 FAILED` | Wrong SPI pins | Check FSPI wiring: SCK=36, MISO=37, MOSI=35, CS=10 |
| `SX1262 FAILED` | Wrong board variant | Confirm LilyGO **T3-S3** (not T3 v1.6 which uses SX1276) |
| Cloud upload FAIL | Wrong VERCEL_HOST | Copy exact URL from Vercel (no `https://` prefix) |
| No votes at gateway | LoRa antenna | Attach 915 MHz antenna before powering on |
| `MPU6050 Not found` | I2C address | Confirm AD0 pin is GND (address 0x68) |

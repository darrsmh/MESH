# Complete Setup Guide — IoT Seismic Detection System

This guide walks through every step: hardware assembly, dashboard deployment,
Upstash Redis configuration, firmware build, and first end-to-end test.

---

## Prerequisites

### Hardware (5 boards total)

| Qty | Component | Notes |
|-----|-----------|-------|
| 4 | LilyGO T3-S3 | ESP32-S3 + SX1262 LoRa on-board |
| 1 | LilyGO T3-S3 | Gateway board |
| 4 | ADXL355 breakout | Accelerometer (±4 g, SPI) |
| 4 | MPU6050 breakout | Gyroscope (I2C) |
| 5 | 915 MHz antenna | SMA antenna for each board |
| 5 | USB data cable | Must support data (not charge-only) |
| 4 | MicroSD card | Optional — local binary logging |

### Software

| Tool | Version | Install |
|------|---------|---------|
| Python 3.8+ | 3.x | https://python.org |
| PlatformIO CLI | 6.x | `pip install platformio` |
| Node.js 18+ | 18.x+ | https://nodejs.org |
| Git | latest | https://git-scm.com |

---

## Part 1 — Vercel Dashboard Deployment

### 1.1 Fork / Clone the Repository

```bash
git clone https://github.com/darrsmh/MESH.git
cd MESH
```

### 1.2 Install Dependencies

```bash
npm install
```

### 1.3 Create Upstash Redis Database

1. Go to https://upstash.com → sign up or log in
2. Click **"Create Database"**
   - Type: **Redis**
   - Region: Choose closest to your Vercel deployment region
3. Once created, copy the **REST URL** and **REST Token**

### 1.4 Deploy to Vercel

**Option A — Vercel CLI**

```bash
npm i -g vercel
vercel login
vercel
```

**Option B — GitHub integration**

1. Push this repo to your GitHub account
2. Go to https://vercel.com/new → **Import Git Repository**
3. Select your repo → click **Deploy**

### 1.5 Set Environment Variables

In the Vercel dashboard → **Settings → Environment Variables**, add:

| Variable | Value | Environment |
|----------|-------|-------------|
| `UPSTASH_REDIS_REST_URL` | From step 1.3 | All |
| `UPSTASH_REDIS_REST_TOKEN` | From step 1.3 | All |
| `VERCEL_API_KEY` | Any secret string (e.g. `my_seismic_secret_2024`) | All |
| `ALERT_WEBHOOK_URL` | (Optional) ntfy.sh URL for push alerts | All |

> **Important:** Set all variables to **All Environments** (Production, Preview, Development).

### 1.6 Redeploy

After setting env vars, redeploy:

1. Vercel → **Deployments** tab
2. Click **⋮** on latest → **Redeploy**

### 1.7 Verify Dashboard

Visit `https://your-project.vercel.app`. You should see the live seismogram
dashboard with 4 node panels.

### 1.8 Test CSV Export

Visit these URLs to verify CSV download works:

```
https://your-project.vercel.app/api/export/samples
https://your-project.vercel.app/api/export/alerts
```

---

## Part 2 — Firmware Configuration

### 2.1 Open config.h

Edit `config.h` in the project root. Fill in your values:

```cpp
// ── WiFi ───────────────────────────────────────────────────────
#define WIFI_SSID        "YOUR_WIFI_SSID"      // ← your WiFi name
#define WIFI_PASS        "YOUR_WIFI_PASSWORD"   // ← your WiFi password

// ── Vercel Dashboard API ────────────────────────────────────────
#define VERCEL_HOST      "your-project.vercel.app"  // ← no https:// prefix
#define VERCEL_API_KEY   "my_seismic_secret_2024"   // ← same as in Vercel env
```

### 2.2 Generate a Secure LoRa Auth Key

Replace the placeholder `LORA_AUTH_KEY` with a random 32-byte key:

```bash
python3 -c "import secrets; print(', '.join(f'0x{b:02x}' for b in secrets.token_bytes(32)))"
```

Paste the output into `config.h`:

```cpp
#define LORA_AUTH_KEY \
    { 0xNN, 0xNN, 0xNN, ... }   // ← your 32 random bytes
```

> All 5 boards (4 sensors + 1 gateway) must use the **same** key.

### 2.3 Set Node IDs in platformio.ini

For each sensor board, change `-DNODE_ID=` before flashing:

| Board | File edit | Value |
|-------|-----------|-------|
| Sensor 1 | `platformio.ini` line 38 | `-DNODE_ID=1` |
| Sensor 2 | `platformio.ini` line 38 | `-DNODE_ID=2` |
| Sensor 3 | `platformio.ini` line 38 | `-DNODE_ID=3` |
| Sensor 4 | `platformio.ini` line 38 | `-DNODE_ID=4` |
| Gateway | Already set | `-DNODE_ROLE=1 -DNODE_ID=0` |

---

## Part 3 — Hardware Wiring

### ADXL355 Accelerometer → LilyGO T3-S3

| ADXL355 Pin | LilyGO GPIO |
|-------------|-------------|
| SCK | 36 |
| MISO | 37 |
| MOSI | 35 |
| CS | 10 |
| VCC | 3.3V |
| GND | GND |

### MPU6050 Gyroscope → LilyGO T3-S3

| MPU6050 Pin | LilyGO GPIO |
|-------------|-------------|
| SDA | 18 |
| SCL | 17 |
| VCC | 3.3V |
| GND | GND |

> **Warning:** Use 3.3V logic only. Do not connect 5V signals to ESP32 GPIO.

### On-board LoRa (SX1262)

Already wired on the LilyGO T3-S3. No external wiring needed.

| Function | GPIO |
|----------|------|
| SCK | 5 |
| MISO | 3 |
| MOSI | 6 |
| CS | 7 |
| RESET | 8 |
| DIO1/IRQ | 33 |
| BUSY | 34 |
| Antenna switch | 38 |

> **Critical:** Connect the 915 MHz antenna to the SMA connector **before**
> powering on. Transmiting without an antenna can damage the radio.

### MicroSD Card (Optional)

| SD Pin | LilyGO GPIO |
|--------|-------------|
| CS | 13 |
| SCK | 14 |
| MISO | 2 |
| MOSI | 11 |

---

## Part 4 — Build and Flash Firmware

### 4.1 Verify PlatformIO

```bash
pio --version
```

Should show `PlatformIO, version 6.x.x`.

### 4.2 Build Sensor Node

```bash
pio run -e sensor_node
```

Expected output: `SUCCESS`

### 4.3 Flash Sensor Node 1

1. Connect Sensor Board 1 via USB
2. Verify connection:

```bash
pio device list
```

3. Flash:

```bash
pio run -e sensor_node -t upload
```

4. If no port detected:
   - Try a different USB cable (some are power-only)
   - Hold **BOOT** button → press **RESET** → release **BOOT**
   - Try a different USB port
   - Close any serial monitor using the port

5. Repeat for Sensors 2, 3, 4 — change `-DNODE_ID=` in `platformio.ini` before each flash.

### 4.4 Flash Gateway

```bash
pio run -e gateway_node -t upload
```

### 4.5 Verify — Serial Monitor

```bash
pio device monitor -b 115200
```

Expected boot output:

```
============================================
 Seismic Detection System  v1.0.0
 Role   : SENSOR NODE
 Node ID: 1
============================================
[ADXL355] OK
[MPU6050] OK
[LoRa]    SX1262 OK — 915.0 MHz SF7 BW125 kHz
[SD]      OK — XXXX MB free
[WiFi]    Connected — IP: 192.168.1.xxx
[NTP]     Clock synced
[BOOT]    All tasks created. 250 Hz acquisition active.
```

---

## Part 5 — End-to-End Test

### 5.1 Confirm Dashboard Shows Nodes

Open `https://your-project.vercel.app`. You should see 4 node panels.
After ~10 seconds, the nodes should appear as **online** (green badge).

### 5.2 Test Sample Upload

The sensor nodes upload samples every 5 seconds. Check the dashboard
seismograms — you should see live waveforms on each node's canvas.

### 5.3 Test Earthquake Alert

To simulate an earthquake (without real shaking):

1. Open the serial monitor for a sensor node
2. Physically tap/shake the board to create acceleration > 0.02 g
3. The sensor should log: `ALERT Node1 PGA=0.XXXXg @XXXXXms TX=OK`
4. The gateway should log: `EARTHQUAKE ALERT PGA=... 3/4 nodes`
5. The dashboard should flash the red earthquake banner
6. The alert should appear in the **Earthquake Alert Log** table

### 5.4 Test CSV Export

On the dashboard, click the **Export CSV** buttons (1 min, 5 min, etc.).
A CSV file should download with columns: `node_id,t,x,y,z,pga`.

---

## Part 6 — Security Checklist

| Item | Status | Location |
|------|--------|----------|
| TLS certificate validation | ISRG Root X1 CA embedded | `config.h:92-126` |
| NTP time sync | `configTime()` after WiFi connect | `main.cpp:168-170` |
| LoRa packet auth | HMAC-SHA256 (8-byte tag) | `LoRaComm.cpp` |
| LoRa replay protection | Monotonic sequence numbers | `VotingManager.cpp` |
| API key authentication | `X-Api-Key` header check | `app/api/ingest/*/route.ts` |
| CORS | Allows ESP32 cross-origin | `next.config.js` |

### Before Production Deployment

1. **Rotate** the LoRa auth key from the example value in `config.h`
2. **Set a strong** `VERCEL_API_KEY` — not the placeholder
3. **Never commit** real WiFi passwords or API keys to GitHub
4. **Add rate limiting** to API endpoints (e.g. `@upstash/ratelimit`)
5. **Restrict CORS** to your specific domain in `next.config.js`

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ADXL355 FAILED` | Wrong SPI pins | Check wiring: SCK=36, MISO=37, MOSI=35, CS=10 |
| `SX1262 FAILED` | Wrong board | Confirm LilyGO **T3-S3** (not T3 v1.6) |
| `MPU6050 FAILED` | I2C issue | Confirm SDA=18, SCL=17; AD0 pin to GND (addr 0x68) |
| Cloud upload FAIL | Wrong `VERCEL_HOST` | No `https://` prefix; exact hostname only |
| TLS handshake fail | Clock not synced | Check `[NTP] Clock synced` in serial output |
| No votes at gateway | No antenna | Attach 915 MHz antenna before power-on |
| Dashboard "Offline" | Nodes not uploading | Check WiFi credentials; check `VERCEL_API_KEY` matches |
| 500 on `/api/export/*` | Redis not configured | Verify `UPSTASH_REDIS_REST_URL` and `TOKEN` in Vercel |
| CSV download empty | No data yet | Wait for sensor nodes to upload samples (5+ seconds) |
| `pio: command not found` | PlatformIO not installed | Run `pip install platformio` |

---

## Architecture Summary

```
┌─────────────────┐     LoRa 915 MHz      ┌──────────────────┐
│  Sensor Node 1  │ ──────────────────────► │                  │
│  (ADXL355+MPU)  │                        │                  │
├─────────────────┤     HMAC-SHA256        │   Gateway Node   │
│  Sensor Node 2  │ ──────────────────────► │   (ESP32-S3 +    │
│  (ADXL355+MPU)  │     + sequence #       │    SX1262)       │
├─────────────────┤                        │                  │
│  Sensor Node 3  │ ──────────────────────► │  M-of-N 3/4     │
│  (ADXL355+MPU)  │                        │  Voting Manager  │
├─────────────────┤                        │                  │
│  Sensor Node 4  │ ──────────────────────► │                  │
│  (ADXL355+MPU)  │                        └────────┬─────────┘
└─────────────────┘                                  │
                                                     │ HTTPS POST
                                                     │ (TLS verified)
                                                     ▼
                                          ┌──────────────────┐
                                          │  Vercel API      │
                                          │  /api/ingest/*   │
                                          │       │          │
                                          │       ▼          │
                                          │  Upstash Redis   │
                                          └────────┬─────────┘
                                                   │
                                          ┌────────▼─────────┐
                                          │  Dashboard UI    │
                                          │  /api/dashboard  │
                                          │  (polled every   │
                                          │   2 seconds)     │
                                          └──────────────────┘
```

# Sensor and LoRa Setup Guide

This guide explains how to assemble the LilyGO T3-S3 sensor nodes and gateway for the seismic monitoring system.

## 1. Hardware Per Board

Each board should have:

- LilyGO T3-S3 with onboard SX1262 LoRa radio
- Compatible 915 MHz antenna
- ADXL355 accelerometer breakout
- MPU6050 gyroscope breakout
- USB data cable for programming
- Optional microSD card for local logging

The LilyGO T3-S3 already contains the SX1262 radio. No separate LoRa module or LoRa SPI wiring is required.

## 2. Sensor Wiring

### ADXL355 to LilyGO T3-S3

| ADXL355 | LilyGO T3-S3 |
|---|---|
| SCK | GPIO 36 |
| MISO | GPIO 37 |
| MOSI | GPIO 35 |
| CS | GPIO 10 |
| VCC | Compatible 3.3 V |
| GND | GND |

### MPU6050 to LilyGO T3-S3

| MPU6050 | LilyGO T3-S3 |
|---|---|
| SDA | GPIO 18 |
| SCL | GPIO 17 |
| VCC | Compatible 3.3 V |
| GND | GND |

Use 3.3 V-compatible logic. Do not connect 5 V signals directly to ESP32 GPIO pins.

## 3. Onboard LoRa Configuration

The onboard SX1262 uses these pins internally:

| SX1262 Function | GPIO |
|---|---:|
| SCK | 5 |
| MISO | 3 |
| MOSI | 6 |
| CS | 7 |
| RESET | 8 |
| DIO1 | 33 |
| BUSY | 34 |
| Antenna switch | 38 |

These assignments are already defined in `config.h`.

### Antenna

Connect a suitable 915 MHz antenna to the SMA connector before powering or transmitting. Operating without an antenna can damage the radio amplifier.

Confirm that 915 MHz operation is legal in your country and follows local power and duty-cycle rules.

## 4. System Roles

Use four sensor nodes and one gateway:

| Board | Role | Node ID |
|---|---|---:|
| Board 1 | Sensor | 1 |
| Board 2 | Sensor | 2 |
| Board 3 | Sensor | 3 |
| Board 4 | Sensor | 4 |
| Board 5 | Gateway | 0 |

Sensor nodes measure acceleration and broadcast authenticated earthquake alerts. The gateway receives those alerts and triggers an event after the configured 3-of-4 consensus.

## 5. Configure `config.h`

Before flashing, update the Wi-Fi and dashboard settings in `config.h`:

```cpp
#define WIFI_SSID        "your_wifi_name"
#define WIFI_PASS        "your_wifi_password"
#define VERCEL_HOST      "your-project.vercel.app"
#define VERCEL_API_KEY   "your_api_key"
```

For LoRa authentication, replace the example `LORA_AUTH_KEY` with a strong random key. Every board participating in the same LoRa network must use the same key.

Do not commit real Wi-Fi passwords, API keys, or authentication keys to GitHub. Keep production secrets in an ignored local configuration file or another secure provisioning method.

## 6. Configure PlatformIO

The firmware sources are stored in the project root. `platformio.ini` is already configured to use that layout and ignore the Next.js `node_modules` directory.

For sensor boards, set the node ID in the `sensor_node` environment:

```ini
-DNODE_ROLE=0
-DNODE_ID=1
```

Change `-DNODE_ID=1` to `2`, `3`, or `4` before flashing the other sensor boards.

The gateway uses:

```ini
-DNODE_ROLE=1
-DNODE_ID=0
```

## 7. Build Firmware

PlatformIO is installed at this location on Windows:

```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run -e sensor_node
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run -e gateway_node
```

A build does not require a board to be connected.

## 8. Flash a Sensor Board

Connect one ESP32-S3 board with a USB data cable. Check for a detected port:

```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" device list
```

Then upload:

```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run -e sensor_node -t upload
```

Repeat for each sensor, changing the node ID before each upload.

If no port appears:

1. Try a different USB cable; some cables provide power only.
2. Try another USB port.
3. Hold the board's `BOOT` button.
4. Press and release `RESET` or `EN`.
5. Release `BOOT` and run the device-list command again.
6. Close any serial monitor using the port.

To select a port explicitly:

```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run -e sensor_node -t upload --upload-port COM5
```

Replace `COM5` with the detected port.

## 9. Flash the Gateway

Connect the gateway board and run:

```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run -e gateway_node -t upload
```

The gateway must use the same LoRa settings and authentication key as the sensor nodes.

## 10. Monitor Serial Output

Open the serial monitor at 115200 baud:

```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" device monitor -b 115200
```

Expected startup messages include:

```text
[LoRa] SX1262 OK
[BOOT] All tasks created
```

Sensor nodes should report successful LoRa transmission when an alert is detected. The gateway should report received packets and vote counts.

## 11. LoRa Settings Must Match

Every sensor and the gateway must use the same values:

- Frequency: `915.0 MHz`
- Bandwidth: `125 kHz`
- Spreading factor: `7`
- Coding rate: `4/5`
- Sync word: `0x34`
- Authentication key: same `LORA_AUTH_KEY`

The antenna and regional radio requirements must also be correct.

## 12. Basic Test Sequence

1. Build the sensor firmware.
2. Build the gateway firmware.
3. Flash one sensor with node ID 1.
4. Flash the gateway.
5. Open serial monitors for both boards.
6. Confirm both report the SX1262 initialization successfully.
7. Trigger a controlled sensor event or use the project test procedure.
8. Confirm the sensor transmits an alert.
9. Confirm the gateway receives and authenticates the packet.
10. Repeat with enough sensor nodes to verify the 3-of-4 consensus.
11. Confirm the gateway sends the resulting alert to the dashboard API.

## 13. Security Notes

The LoRa packet uses an authentication tag and sequence number. The gateway rejects:

- Unknown node IDs
- Invalid authentication tags
- Replayed sequence numbers
- Invalid PGA values

Flash all boards with the updated firmware. Old firmware using the previous packet format will not communicate correctly with the updated firmware.

For production deployment, use unique authentication keys per node or a secure per-device provisioning process. Persist sequence counters across reboot if replay protection must survive power loss.

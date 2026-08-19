# LoRa Setup Guide

With this project, the LilyGO T3-S3 already contains the SX1262 LoRa radio, so no separate LoRa wiring is needed.

## Hardware

For each board:

1. Connect a compatible **915 MHz antenna** to the SMA connector before transmitting.
2. Connect the ADXL355:
   - SCK: GPIO 36
   - MISO: GPIO 37
   - MOSI: GPIO 35
   - CS: GPIO 10
3. Connect the MPU6050:
   - SDA: GPIO 18
   - SCL: GPIO 17
4. Power sensors with compatible 3.3 V logic.

The onboard SX1262 uses:

- SCK: GPIO 5
- MISO: GPIO 3
- MOSI: GPIO 6
- CS: GPIO 7
- Reset: GPIO 8
- DIO1: GPIO 33
- Busy: GPIO 34
- Antenna switch: GPIO 38

These pins are already defined in `config.h`.

## Board Roles

Use four sensor boards and one gateway:

- Sensor 1: `-DNODE_ID=1`
- Sensor 2: `-DNODE_ID=2`
- Sensor 3: `-DNODE_ID=3`
- Sensor 4: `-DNODE_ID=4`
- Gateway: `-DNODE_ROLE=1` and `-DNODE_ID=0`

### Flash Sensor Nodes

Run this command for each sensor:

```text
pio run -e sensor_node -t upload
```

Change `-DNODE_ID` in `platformio.ini` before flashing each sensor.

### Flash the Gateway

```text
pio run -e gateway_node -t upload
```

The sensors transmit alerts; the gateway listens and applies the 3-of-4 vote.

## Required Radio Settings

All boards must use the same:

- Frequency: `915.0 MHz`
- Bandwidth: `125 kHz`
- Spreading factor: `7`
- Coding rate: `4/5`
- Sync word: `0x34`
- `LORA_AUTH_KEY`

These settings are defined in `config.h`.

## Security and Regulatory Notes

- Replace the example authentication key in `config.h` before deployment.
- Keep the authentication key identical on all nodes and the gateway.
- Use a unique key per node for stronger compromise isolation where supported.
- Check that 915 MHz is legal for your country.
- Use an antenna designed for the selected frequency.
- Connect the antenna before transmitting to avoid damaging the radio.

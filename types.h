#pragma once
#include <Arduino.h>
#include "config.h"

// ── Raw sensor readings ────────────────────────────────────────
struct AccelData {
    float    x, y, z;         // Acceleration (g)
    uint32_t timestamp_ms;    // millis() at time of read
};

struct GyroData {
    float    x, y, z;         // Angular rate (°/s)
    uint32_t timestamp_ms;
};

// ── Complementary filter output ────────────────────────────────
struct Orientation {
    float roll, pitch, yaw;   // Euler angles (radians)
};

// ── Detection result from SignalProcessor ──────────────────────
struct DetectionResult {
    bool     detected;
    float    pga;             // Peak Ground Acceleration (g)
    uint32_t timestamp_ms;
};

// ── LoRa P2P packet (packed = 23 bytes on wire) ────────────────
struct __attribute__((packed)) LoRaPacket {
    uint8_t  pkt_type;        // 0x01 = seismic alert
    uint8_t  node_id;         // 1–4
    uint32_t timestamp_ms;
    float    pga;
    uint8_t  confirm_count;   // consecutive samples that triggered
    uint32_t sequence;         // monotonic per-node message number
    uint8_t  auth_tag[LORA_AUTH_TAG_BYTES];
};

// ── Vote received at gateway ───────────────────────────────────
struct NodeVote {
    uint8_t  node_id;
    uint32_t timestamp_ms;
    float    pga;
    bool     valid;
};

// ── Gateway consensus result ───────────────────────────────────
struct ConsensusResult {
    bool     alert;
    uint8_t  votes;
    float    network_pga;     // RMS average PGA across voting nodes
    uint32_t alert_timestamp_ms;
};

// ── System health snapshot ─────────────────────────────────────
struct SystemStatus {
    bool  adxl355_ok;
    bool  mpu6050_ok;
    bool  lora_ok;
    bool  sd_ok;
    bool  wifi_ok;
    float battery_mv;
    float uptime_h;
};

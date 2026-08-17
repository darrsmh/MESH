#pragma once
#include <Arduino.h>
#include <SD.h>
#include <SPI.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "config.h"
#include "types.h"

// ================================================================
// DataLogger  —  binary MicroSD logging at 250 Hz
// Binary record: 4B timestamp_ms + 4B X + 4B Y + 4B Z = 16 bytes
// ================================================================
class DataLogger {
public:
    bool begin();
    void writeSample(const AccelData& d);
    void writeEvent(const char* msg);
    void flush();
    bool isOk() const { return _ok; }

private:
    bool     _ok = false;
    File     _data;
    File     _events;
    uint32_t _samples = 0;
    void     openNewFile();
};

// ================================================================
// WiFiCloud  —  HTTPS POST to Vercel API routes
//
// POST /api/ingest/samples — batch of AccelData (every 5 seconds)
// POST /api/ingest/alert   — earthquake consensus result
//
// Authentication: shared secret in X-Api-Key header
// ================================================================
class WiFiCloud {
public:
    bool begin();
    bool isConnected() const;

    // Non-blocking enqueue from Core 0 (sensor task)
    void queueSample(const AccelData& d);

    // Drain queue and POST to Vercel (call from Core 1 every 5 s)
    void uploadPending();

    // Immediate alert POST from gateway
    bool sendAlert(const ConsensusResult& r, uint8_t gw_id);

private:
    static const int Q = 2000;    // ~8 s buffer at 250 Hz
    AccelData    _q[Q];
    volatile int _head = 0, _tail = 0;
    uint32_t     _lastUpMs = 0;

    bool httpsPost(const char* path, const String& body);
};

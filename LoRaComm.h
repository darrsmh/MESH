#pragma once
// ================================================================
// LoRaComm.h  —  SX1262 P2P communication via RadioLib
// LilyGO T3-S3 has the SX1262 wired to its own HSPI bus.
// SX1262 requires a BUSY pin that SX1276/LoRa.h does not have.
// ================================================================
#include <Arduino.h>
#include <RadioLib.h>
#include "config.h"
#include "types.h"

using LoRaRxCallback = std::function<void(const LoRaPacket&, int rssi, float snr)>;

class LoRaComm {
public:
    bool  begin();
    bool  sendAlert(uint8_t node_id, uint32_t ts_ms,
                    float pga, uint8_t confirms);
    void  onReceive(LoRaRxCallback cb);
    void  startListening();
    void  poll();              // Call from gateway task loop

    int   lastRSSI() const { return _rssi; }
    float lastSNR()  const { return _snr;  }

private:
    // RadioLib SX1262: (CS, DIO1, RST, BUSY)
    SX1262 _radio = new Module(PIN_LORA_CS,
                               PIN_LORA_DIO1,
                               PIN_LORA_RST,
                               PIN_LORA_BUSY);
    LoRaRxCallback   _rxCb   = nullptr;
    volatile bool    _rxFlag = false;
    int   _rssi = 0;
    float _snr  = 0.0f;

    uint32_t _txSequence = 0;
    void authenticate(const uint8_t* data, size_t length,
                      uint8_t* tag) const;
    bool    parseRx(LoRaPacket& out);

    static void IRAM_ATTR _isrRx();
    static LoRaComm*      _instance;
};

#include "LoRaComm.h"
#include <esp_system.h>
#include <mbedtls/md.h>
static const char* T = "LoRa";
LoRaComm* LoRaComm::_instance = nullptr;

bool LoRaComm::begin() {
    _instance = this;
    _txSequence = esp_random();

    // RadioLib uses the board's default SPI bus for the on-board SX1262.
    SPI.begin(PIN_LORA_SCK, PIN_LORA_MISO, PIN_LORA_MOSI, PIN_LORA_CS);

    int state = _radio.begin(
        LORA_FREQ_MHZ,    // 915.0 MHz
        LORA_BW_KHZ,      // 125.0 kHz
        LORA_SF,          // 7
        LORA_CR,          // 4/5
        LORA_SYNC_WORD,   // 0x34
        LORA_TX_DBM,      // 22 dBm
        LORA_PREAMBLE     // 8 symbols
    );

    if (state != RADIOLIB_ERR_NONE) {
        log_e("[%s] Init failed, code=%d", T, state);
        return false;
    }

    // Antenna switch (active HIGH on LilyGO T3-S3)
    pinMode(PIN_LORA_ANT, OUTPUT);
    digitalWrite(PIN_LORA_ANT, HIGH);

    // Attach DIO1 ISR for receive notifications
    _radio.setDio1Action(_isrRx);

    log_i("[%s] SX1262 OK — %.1f MHz  SF%d  BW%.0f kHz  +%d dBm",
          T, LORA_FREQ_MHZ, LORA_SF, LORA_BW_KHZ, LORA_TX_DBM);
    return true;
}

bool LoRaComm::sendAlert(uint8_t node_id, uint32_t ts_ms,
                          float pga, uint8_t confirms) {
    LoRaPacket pkt{};
    pkt.pkt_type      = 0x01;
    pkt.node_id       = node_id;
    pkt.timestamp_ms  = ts_ms;
    pkt.pga           = pga;
    pkt.confirm_count = confirms;
    pkt.sequence      = ++_txSequence;
    authenticate((uint8_t*)&pkt, offsetof(LoRaPacket, auth_tag), pkt.auth_tag);

    // Blocking transmit (~50 ms air time for SF7 BW125)
    int state = _radio.transmit((uint8_t*)&pkt, sizeof(pkt));

    if (state == RADIOLIB_ERR_NONE) {
        log_i("[%s] TX → Node%d  PGA=%.4f g  @%lu ms", T, node_id, pga, ts_ms);
        return true;
    }
    log_e("[%s] TX failed, state=%d", T, state);
    return false;
}

void LoRaComm::onReceive(LoRaRxCallback cb) { _rxCb = cb; }

void LoRaComm::startListening() {
    _radio.startReceive();
    log_i("[%s] Continuous RX mode", T);
}

void LoRaComm::poll() {
    if (!_rxFlag) return;
    _rxFlag = false;

    LoRaPacket pkt{};
    if (!parseRx(pkt)) {
        log_w("[%s] RX parse failed (checksum or size)", T);
        _radio.startReceive();
        return;
    }

    _rssi = _radio.getRSSI();
    _snr  = _radio.getSNR();
    log_i("[%s] RX ← Node%d  PGA=%.4f g  RSSI=%d  SNR=%.1f",
          T, pkt.node_id, pkt.pga, _rssi, _snr);

    if (_rxCb) _rxCb(pkt, _rssi, _snr);
    _radio.startReceive();
}

// ── Private helpers ────────────────────────────────────────────

void IRAM_ATTR LoRaComm::_isrRx() {
    if (_instance) _instance->_rxFlag = true;
}

void LoRaComm::authenticate(const uint8_t* data, size_t length,
                            uint8_t* tag) const {
    static const uint8_t key[32] = LORA_AUTH_KEY;
    uint8_t digest[32];
    const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    mbedtls_md_hmac(info, key, sizeof(key), data, length, digest);
    memcpy(tag, digest, LORA_AUTH_TAG_BYTES);
}

bool LoRaComm::parseRx(LoRaPacket& out) {
    uint8_t buf[sizeof(LoRaPacket)];
    int state = _radio.readData(buf, sizeof(buf));
    if (state != RADIOLIB_ERR_NONE) return false;
    memcpy(&out, buf, sizeof(out));
    if (out.pkt_type != 0x01)                            return false;
    if (out.node_id == 0 || out.node_id > TOTAL_NODES)   return false;
    if (!isfinite(out.pga) || out.pga < 0.0f || out.pga > 16.0f) return false;
    uint8_t expected[LORA_AUTH_TAG_BYTES];
    authenticate(buf, offsetof(LoRaPacket, auth_tag), expected);
    if (memcmp(expected, out.auth_tag, LORA_AUTH_TAG_BYTES) != 0) return false;
    return true;
}

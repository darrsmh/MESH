#include "ADXL355_Driver.h"
static const char* T = "ADXL355";

bool ADXL355_Driver::begin() {
    _spi.begin(PIN_ADXL_SCK, PIN_ADXL_MISO, PIN_ADXL_MOSI, PIN_ADXL_CS);
    pinMode(PIN_ADXL_CS, OUTPUT);
    digitalWrite(PIN_ADXL_CS, HIGH);
    delay(5);

    reg_w(ADXL355_REG_RESET, 0x52);   // software reset
    delay(20);

    uint8_t id = reg_r(ADXL355_REG_DEVID_AD);
    if (id != ADXL355_DEVID) {
        log_e("[%s] Wrong device ID 0x%02X (expected 0xAD)", T, id);
        return false;
    }

    reg_w(ADXL355_REG_RANGE,     ADXL355_RANGE_4G);    // ±4 g
    reg_w(ADXL355_REG_FILTER,    ADXL355_ODR_250HZ);   // 250 Hz
    reg_w(ADXL355_REG_POWER_CTL, 0x00);                // start measurement
    delay(10);

    log_i("[%s] OK — ±4 g, 250 Hz, ID=0x%02X", T, id);
    return true;
}

bool ADXL355_Driver::isDataReady() {
    return (reg_r(ADXL355_REG_STATUS) & 0x01) != 0;
}

void ADXL355_Driver::read(AccelData& out) {
    uint8_t buf[9];
    // Burst-read 9 bytes starting at XDATA3: X(3), Y(3), Z(3)
    burst_r(ADXL355_REG_XDATA3, buf, 9);

    int32_t rx = to_signed20(buf[0], buf[1], buf[2]);
    int32_t ry = to_signed20(buf[3], buf[4], buf[5]);
    int32_t rz = to_signed20(buf[6], buf[7], buf[8]);

    out.x = (rx - (int32_t)offset[0]) / scale[0];
    out.y = (ry - (int32_t)offset[1]) / scale[1];
    out.z = (rz - (int32_t)offset[2]) / scale[2];
    out.timestamp_ms = millis();
}

bool ADXL355_Driver::selfTest() {
    AccelData d;
    read(d);
    float gm = sqrtf(d.x*d.x + d.y*d.y + d.z*d.z);
    bool ok   = (gm > 0.80f && gm < 1.20f);   // gravity ≈ 1 g
    log_i("[%s] SelfTest %s  g_mag=%.3f g", T, ok ? "PASS" : "FAIL", gm);
    return ok;
}

// ── Private SPI helpers ────────────────────────────────────────

uint8_t ADXL355_Driver::reg_r(uint8_t r) {
    uint8_t v;
    _spi.beginTransaction(_cfg);
    digitalWrite(PIN_ADXL_CS, LOW);
    _spi.transfer((r << 1) | 0x01);   // read: bit0 = 1
    v = _spi.transfer(0x00);
    digitalWrite(PIN_ADXL_CS, HIGH);
    _spi.endTransaction();
    return v;
}

void ADXL355_Driver::reg_w(uint8_t r, uint8_t v) {
    _spi.beginTransaction(_cfg);
    digitalWrite(PIN_ADXL_CS, LOW);
    _spi.transfer((r << 1) & 0xFE);   // write: bit0 = 0
    _spi.transfer(v);
    digitalWrite(PIN_ADXL_CS, HIGH);
    _spi.endTransaction();
}

void ADXL355_Driver::burst_r(uint8_t r, uint8_t* buf, uint8_t n) {
    _spi.beginTransaction(_cfg);
    digitalWrite(PIN_ADXL_CS, LOW);
    _spi.transfer((r << 1) | 0x01);
    for (uint8_t i = 0; i < n; i++) buf[i] = _spi.transfer(0x00);
    digitalWrite(PIN_ADXL_CS, HIGH);
    _spi.endTransaction();
}

// 20-bit two's complement from 3 raw bytes (MSB, MID, LSB)
int32_t ADXL355_Driver::to_signed20(uint8_t a, uint8_t b, uint8_t c) {
    int32_t v = ((int32_t)a << 12) | ((int32_t)b << 4) | (c >> 4);
    if (v & 0x80000) v |= 0xFFF00000;  // sign extend
    return v;
}

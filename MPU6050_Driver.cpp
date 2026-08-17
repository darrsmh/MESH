#include "MPU6050_Driver.h"
#define MPU_ADDR 0x68
static const char* T = "MPU6050";

bool MPU6050_Driver::begin() {
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, 400000UL);
    reg_w(0x6B, 0x80); delay(100);   // DEVICE_RESET
    reg_w(0x6B, 0x00); delay(10);    // wake
    reg_w(0x1B, 0x00);               // GYRO_CONFIG: ±250 °/s → 131 LSB/(°/s)
    reg_w(0x19, 0x03);               // SMPLRT_DIV=3 → 250 Hz effective rate
    if (reg_r(0x75) != MPU_ADDR) {
        log_e("[%s] Not found on I2C", T);
        return false;
    }
    calibrate();
    log_i("[%s] OK — ±250 °/s, 250 Hz", T);
    return true;
}

void MPU6050_Driver::calibrate() {
    // Collect 500 stationary samples → compute zero-rate offset
    const int N = 500;
    double sx = 0, sy = 0, sz = 0;
    for (int i = 0; i < N; i++) {
        Wire.beginTransmission(MPU_ADDR);
        Wire.write(0x43);                        // GYRO_XOUT_H
        Wire.endTransmission(false);
        Wire.requestFrom(MPU_ADDR, 6);
        int16_t gx = (Wire.read() << 8) | Wire.read();
        int16_t gy = (Wire.read() << 8) | Wire.read();
        int16_t gz = (Wire.read() << 8) | Wire.read();
        sx += gx; sy += gy; sz += gz;
        delay(4);
    }
    _gyro_offset[0] = (float)(sx / N) / 131.0f;
    _gyro_offset[1] = (float)(sy / N) / 131.0f;
    _gyro_offset[2] = (float)(sz / N) / 131.0f;
    log_i("[%s] Gyro bias X=%.3f Y=%.3f Z=%.3f °/s",
          T, _gyro_offset[0], _gyro_offset[1], _gyro_offset[2]);
}

void MPU6050_Driver::read(GyroData& out) {
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(0x43);
    Wire.endTransmission(false);
    Wire.requestFrom(MPU_ADDR, 6);
    int16_t gx = (Wire.read() << 8) | Wire.read();
    int16_t gy = (Wire.read() << 8) | Wire.read();
    int16_t gz = (Wire.read() << 8) | Wire.read();
    out.x = gx / 131.0f - _gyro_offset[0];
    out.y = gy / 131.0f - _gyro_offset[1];
    out.z = gz / 131.0f - _gyro_offset[2];
    out.timestamp_ms = millis();
}

bool MPU6050_Driver::selfTest() { return reg_r(0x75) == MPU_ADDR; }

uint8_t MPU6050_Driver::reg_r(uint8_t r) {
    Wire.beginTransmission(MPU_ADDR); Wire.write(r);
    Wire.endTransmission(false);
    Wire.requestFrom(MPU_ADDR, 1);
    return Wire.read();
}
void MPU6050_Driver::reg_w(uint8_t r, uint8_t v) {
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(r); Wire.write(v);
    Wire.endTransmission();
}

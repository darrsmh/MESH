#pragma once
#include <Arduino.h>
#include <Wire.h>
#include "config.h"
#include "types.h"

class MPU6050_Driver {
public:
    bool begin();
    void read(GyroData& out);
    bool selfTest();
private:
    float   _gyro_offset[3] = {0, 0, 0};
    uint8_t reg_r(uint8_t r);
    void    reg_w(uint8_t r, uint8_t v);
    void    calibrate();
};

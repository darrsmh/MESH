#pragma once
#include <Arduino.h>
#include <SPI.h>
#include "config.h"
#include "types.h"

// ADXL355 register map (abridged)
#define ADXL355_REG_DEVID_AD   0x00
#define ADXL355_REG_STATUS     0x04
#define ADXL355_REG_XDATA3     0x08   // Burst start: X(3) Y(3) Z(3)
#define ADXL355_REG_FILTER     0x28   // ODR + LPF
#define ADXL355_REG_RANGE      0x2C
#define ADXL355_REG_POWER_CTL  0x2D
#define ADXL355_REG_RESET      0x2F

#define ADXL355_DEVID          0xAD
#define ADXL355_RANGE_4G       0x02   // ±4 g (125,000 LSB/g)
#define ADXL355_ODR_250HZ      0x04   // 250 Hz ODR

class ADXL355_Driver {
public:
    // Calibration — populated by selfTest() or external routine
    float offset[3] = {0.0f, 0.0f, 0.0f};
    float scale[3]  = {ADXL355_SENSITIVITY,
                       ADXL355_SENSITIVITY,
                       ADXL355_SENSITIVITY};

    bool begin();
    bool isDataReady();
    void read(AccelData& out);
    bool selfTest();            // Returns true if gravity vector ≈ 1g

private:
    SPIClass    _spi{FSPI};    // FSPI = second SPI bus on ESP32-S3
    SPISettings _cfg{5000000, MSBFIRST, SPI_MODE0};

    uint8_t  reg_r(uint8_t r);
    void     reg_w(uint8_t r, uint8_t v);
    void     burst_r(uint8_t r, uint8_t* buf, uint8_t n);
    int32_t  to_signed20(uint8_t a, uint8_t b, uint8_t c);
};

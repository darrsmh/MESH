#pragma once
#include <Arduino.h>
#include "config.h"
#include "types.h"

// ── 1st-order IIR High-Pass Filter ────────────────────────────
class HighPassFilter {
public:
    HighPassFilter(float fc, float fs);
    float update(float x);
    void  reset();
private:
    float _alpha, _prevIn = 0, _prevOut = 0;
};

// ── 2nd-order Butterworth Low-Pass Filter ─────────────────────
class LowPassFilter {
public:
    LowPassFilter(float fc, float fs);
    float update(float x);
    void  reset();
private:
    float _b0, _b1, _b2, _a1, _a2;
    float _x1 = 0, _x2 = 0, _y1 = 0, _y2 = 0;
};

// ── Complementary Filter (ADXL355 + MPU6050 fusion) ───────────
class ComplementaryFilter {
public:
    ComplementaryFilter(float alpha = COMP_ALPHA,
                        float dt    = 1.0f / SAMPLE_RATE_HZ);
    void update(const AccelData& a, const GyroData& g, Orientation& out);
    void reset();
private:
    float _alpha, _dt;
    float _roll = 0, _pitch = 0, _yaw = 0;
};

// ── Main Processing Pipeline ───────────────────────────────────
class SignalProcessor {
public:
    SignalProcessor();
    AccelData       process(const AccelData& raw, const GyroData& gyro);
    DetectionResult detect(const AccelData& earth);
    void            reset();
private:
    HighPassFilter      _hpf[3]{
        {HPF_CUTOFF_HZ, (float)SAMPLE_RATE_HZ},
        {HPF_CUTOFF_HZ, (float)SAMPLE_RATE_HZ},
        {HPF_CUTOFF_HZ, (float)SAMPLE_RATE_HZ}};
    LowPassFilter       _lpf[3]{
        {LPF_CUTOFF_HZ, (float)SAMPLE_RATE_HZ},
        {LPF_CUTOFF_HZ, (float)SAMPLE_RATE_HZ},
        {LPF_CUTOFF_HZ, (float)SAMPLE_RATE_HZ}};
    ComplementaryFilter _cf;
    uint8_t             _cnt = 0;
};

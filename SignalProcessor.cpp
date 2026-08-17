#include "SignalProcessor.h"
#include <math.h>

// ── HighPassFilter ─────────────────────────────────────────────
// y[n] = alpha * (y[n-1] + x[n] - x[n-1])
// alpha = wc / (wc + 2*pi*fs)
HighPassFilter::HighPassFilter(float fc, float fs) {
    float wc = 2.0f * M_PI * fc;
    _alpha = wc / (wc + 2.0f * M_PI * fs);
}
float HighPassFilter::update(float x) {
    float y = _alpha * (_prevOut + x - _prevIn);
    _prevIn = x; _prevOut = y;
    return y;
}
void HighPassFilter::reset() { _prevIn = _prevOut = 0.0f; }

// ── LowPassFilter (Butterworth 2nd order via bilinear transform) ─
LowPassFilter::LowPassFilter(float fc, float fs) {
    float wc = 2.0f * tanf(M_PI * fc / fs);   // pre-warped
    float d  = wc * wc + wc * M_SQRT2 + 1.0f;
    _b0 = (wc * wc) / d;
    _b1 = 2.0f * _b0;
    _b2 = _b0;
    _a1 = (2.0f * (wc * wc - 1.0f)) / d;
    _a2 = (wc * wc - wc * M_SQRT2 + 1.0f) / d;
}
float LowPassFilter::update(float x) {
    float y = _b0*x + _b1*_x1 + _b2*_x2 - _a1*_y1 - _a2*_y2;
    _x2 = _x1; _x1 = x;
    _y2 = _y1; _y1 = y;
    return y;
}
void LowPassFilter::reset() { _x1 = _x2 = _y1 = _y2 = 0.0f; }

// ── ComplementaryFilter ────────────────────────────────────────
ComplementaryFilter::ComplementaryFilter(float alpha, float dt)
    : _alpha(alpha), _dt(dt) {}

void ComplementaryFilter::update(const AccelData& a,
                                  const GyroData&  g,
                                  Orientation&     out) {
    // Tilt estimate from accelerometer (long-term stable, noisy short-term)
    float roll_a  = atan2f(a.y, sqrtf(a.x*a.x + a.z*a.z));
    float pitch_a = atan2f(-a.x, sqrtf(a.y*a.y + a.z*a.z));

    // Gyro integration (accurate short-term, drifts long-term)
    _roll  = _alpha * (_roll  + (g.x * DEG_TO_RAD) * _dt)
           + (1.0f - _alpha) * roll_a;
    _pitch = _alpha * (_pitch + (g.y * DEG_TO_RAD) * _dt)
           + (1.0f - _alpha) * pitch_a;
    _yaw  += (g.z * DEG_TO_RAD) * _dt;

    out.roll = _roll; out.pitch = _pitch; out.yaw = _yaw;
}
void ComplementaryFilter::reset() { _roll = _pitch = _yaw = 0.0f; }

// ── SignalProcessor ────────────────────────────────────────────
SignalProcessor::SignalProcessor() {}

AccelData SignalProcessor::process(const AccelData& raw, const GyroData& gyro) {
    Orientation o;
    _cf.update(raw, gyro, o);

    // Rotate sensor frame to Earth frame, then remove static gravity
    float cr = cosf(o.roll),  sr = sinf(o.roll);
    float cp = cosf(o.pitch), sp = sinf(o.pitch);

    float ax = cp*raw.x  + sr*sp*raw.y + cr*sp*raw.z;
    float ay =             cr*raw.y     - sr*raw.z;
    float az = -sp*raw.x + sr*cp*raw.y + cr*cp*raw.z - 1.0f; // remove 1g

    ax = _lpf[0].update(_hpf[0].update(ax));
    ay = _lpf[1].update(_hpf[1].update(ay));
    az = _lpf[2].update(_hpf[2].update(az));

    return {ax, ay, az, raw.timestamp_ms};
}

DetectionResult SignalProcessor::detect(const AccelData& earth) {
    float pga = sqrtf(earth.x*earth.x + earth.y*earth.y + earth.z*earth.z);

    if (pga >= DETECT_THRESHOLD_G) _cnt++;
    else                           _cnt = 0;

    if (_cnt >= CONFIRM_SAMPLES) {
        _cnt = 0;
        log_i("[DSP] EARTHQUAKE DETECTED  PGA=%.4f g  @%lu ms", pga, earth.timestamp_ms);
        return {true, pga, earth.timestamp_ms};
    }
    return {false, pga, earth.timestamp_ms};
}

void SignalProcessor::reset() {
    for (int i = 0; i < 3; i++) { _hpf[i].reset(); _lpf[i].reset(); }
    _cf.reset(); _cnt = 0;
}

#include "DataLogger.h"
static const char* TS  = "SD";
static const char* TC  = "Cloud";

// ================================================================
//  DataLogger — MicroSD binary logging
// ================================================================
bool DataLogger::begin() {
    SPIClass spi(FSPI);
    spi.begin(PIN_SD_SCK, PIN_SD_MISO, PIN_SD_MOSI, PIN_SD_CS);
    if (!SD.begin(PIN_SD_CS, spi)) {
        log_e("[%s] Mount failed — check wiring", TS);
        _ok = false;
        return false;
    }
    if (!SD.exists(SD_LOG_DIR)) SD.mkdir(SD_LOG_DIR);
    openNewFile();
    _ok = true;
    uint64_t freeMB = (SD.cardSize() - SD.usedBytes()) / (1024 * 1024);
    log_i("[%s] OK — %llu MB free", TS, freeMB);
    return true;
}

void DataLogger::openNewFile() {
    if (_data)   _data.close();
    if (_events) _events.close();

    char name[64], ename[64];
    uint32_t now = millis();
    snprintf(name,  sizeof(name),  "%s/data_%lu.bin",   SD_LOG_DIR, now);
    snprintf(ename, sizeof(ename), "%s/events_%lu.txt", SD_LOG_DIR, now);

    _data   = SD.open(name,  FILE_WRITE);
    _events = SD.open(ename, FILE_WRITE);
    _samples = 0;

    log_i("[%s] New file: %s", TS, name);
}

void DataLogger::writeSample(const AccelData& d) {
    if (!_ok || !_data) return;
    _data.write((uint8_t*)&d.timestamp_ms, 4);
    _data.write((uint8_t*)&d.x,            4);
    _data.write((uint8_t*)&d.y,            4);
    _data.write((uint8_t*)&d.z,            4);
    _samples++;
    // Flush every 1 second worth of data
    if (_samples % SAMPLE_RATE_HZ == 0) _data.flush();
    // Rotate file every 24 hours of data
    if (_samples >= (uint32_t)SAMPLE_RATE_HZ * 86400) openNewFile();
}

void DataLogger::writeEvent(const char* msg) {
    if (!_ok || !_events) return;
    _events.printf("[%lu] %s\n", millis(), msg);
    _events.flush();
}

void DataLogger::flush() {
    if (_data)   _data.flush();
    if (_events) _events.flush();
}

// ================================================================
//  WiFiCloud — HTTPS POST to Vercel
// ================================================================
bool WiFiCloud::begin() {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    log_i("[%s] Connecting to %s ...", TC, WIFI_SSID);

    uint32_t t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < WIFI_TIMEOUT_MS)
        delay(300);

    if (WiFi.status() != WL_CONNECTED) {
        log_e("[%s] WiFi timeout", TC);
        return false;
    }
    log_i("[%s] Connected — IP: %s", TC, WiFi.localIP().toString().c_str());
    return true;
}

bool WiFiCloud::isConnected() const {
    return WiFi.status() == WL_CONNECTED;
}

void WiFiCloud::queueSample(const AccelData& d) {
    int next = (_head + 1) % Q;
    if (next == _tail) return;   // full — drop oldest implicitly
    _q[_head] = d;
    _head = next;
}

void WiFiCloud::uploadPending() {
    if (!isConnected()) return;
    if (millis() - _lastUpMs < UPLOAD_INTERVAL_MS) return;
    _lastUpMs = millis();

    // Drain up to 500 samples from ring buffer
    DynamicJsonDocument doc(16384);
    doc["node_id"]    = NODE_ID;
    doc["fw_version"] = FW_VERSION;
    JsonArray arr = doc.createNestedArray("samples");

    int cnt = 0;
    while (_tail != _head && cnt < 500) {
        AccelData& d = _q[_tail];
        JsonObject o = arr.createNestedObject();
        o["t"] = d.timestamp_ms;
        o["x"] = serialized(String(d.x, 5));
        o["y"] = serialized(String(d.y, 5));
        o["z"] = serialized(String(d.z, 5));
        _tail = (_tail + 1) % Q;
        cnt++;
    }
    if (cnt == 0) return;

    String body;
    serializeJson(doc, body);
    bool ok = httpsPost(VERCEL_SAMPLES_PATH, body);
    log_i("[%s] Uploaded %d samples → %s", TC, cnt, ok ? "OK" : "FAIL");
}

bool WiFiCloud::sendAlert(const ConsensusResult& r, uint8_t gw_id) {
    DynamicJsonDocument doc(512);
    doc["gateway_id"]   = gw_id;
    doc["votes"]        = r.votes;
    doc["network_pga"]  = serialized(String(r.network_pga, 5));
    doc["alert_ts_ms"]  = r.alert_timestamp_ms;
    doc["total_nodes"]  = TOTAL_NODES;
    doc["threshold_g"]  = DETECT_THRESHOLD_G;

    String body;
    serializeJson(doc, body);
    bool ok = httpsPost(VERCEL_ALERT_PATH, body);
    log_w("[%s] Alert POST → %s  PGA=%.4f g  votes=%d",
          TC, ok ? "OK" : "FAIL", r.network_pga, r.votes);
    return ok;
}

bool WiFiCloud::httpsPost(const char* path, const String& body) {
    if (!isConnected()) return false;

    WiFiClientSecure client;
    client.setCACert(ROOT_CA_PEM);

    HTTPClient http;
    String url = String("https://") + VERCEL_HOST + path;
    if (!http.begin(client, url)) return false;

    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Api-Key",    VERCEL_API_KEY);
    http.setTimeout(8000);

    int code = http.POST(body);
    http.end();

    return (code == 200 || code == 201);
}

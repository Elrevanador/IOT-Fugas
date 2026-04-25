#ifndef CONFIG_H
#define CONFIG_H

// ---------------- WiFi / Backend ----------------
extern const char* ssid;
extern const char* password;

enum BackendMode {
  BACKEND_LOCAL = 0,
  BACKEND_PUBLIC = 1
};

extern const BackendMode BACKEND_MODE;
extern const char* BACKEND_BASE_URL_LOCAL;
extern const char* BACKEND_BASE_URL_PUBLIC;
extern const char* DEVICE_NAME;
extern const char* INGEST_API_KEY;
extern const unsigned long SENSOR_READ_INTERVAL_MS;
extern const unsigned long BACKEND_SEND_INTERVAL_MS;
extern const unsigned long BACKEND_TIMEOUT_MS;

// ---------------- Pines ----------------
extern const int flowPin;
extern const int ledVerde;
extern const int ledNaranja;
extern const int ledRojo;
extern const int buzzerPin;

#endif

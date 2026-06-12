#ifndef CONFIG_H
#define CONFIG_H

#ifndef DEMO_SENSIBLE
#define DEMO_SENSIBLE 1
#endif

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
extern const char* DEVICE_TYPE;
extern const char* DEVICE_FIRMWARE_VERSION;
extern const char* DEVICE_HARDWARE_UID;
extern const int DEVICE_ID;
extern const int HOUSE_ID;
extern const int SENSOR_ID;
extern const char* INGEST_API_KEY;
extern const unsigned long SENSOR_READ_INTERVAL_MS;
extern const unsigned long BACKEND_SEND_INTERVAL_MS;
extern const unsigned long BACKEND_COMMAND_POLL_INTERVAL_MS;
extern const unsigned long BACKEND_TIMEOUT_MS;

// ---------------- Pines ----------------
extern const int flowPin;
extern const int flowControlPin;
extern const int pressurePin;
extern const int ledAzul;
extern const int ledVerde;
extern const int ledNaranja;
extern const int ledRojo;
extern const int buzzerPin;
extern const int relayPin;
extern const int valveIndicatorPin;
extern const int buttonPin;

extern const float PRESSURE_SENSOR_MAX_PSI;
extern const float PRESSURE_SENSOR_MIN_V;
extern const float PRESSURE_SENSOR_MAX_V;
extern const float PRESSURE_DIVIDER_FACTOR;
extern const float PRESSURE_DEAD_ZONE_PSI;
extern const bool DEMO_PRESION_VIRTUAL_DESDE_FLUJO;
extern const float DEMO_PRESION_VIRTUAL_MAX_KPA;
extern const float DEMO_PRESION_VIRTUAL_MIN_KPA;
extern const float DEMO_FLUJO_NORMAL_LMIN;
extern const float DEMO_FLUJO_FUGA_LMIN;

#endif

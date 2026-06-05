#include "modulos/config.h"

#ifndef WIFI_SSID_VALUE
#define WIFI_SSID_VALUE "MONTOYA_MA2.4G"
#endif

#ifndef WIFI_PASSWORD_VALUE
#define WIFI_PASSWORD_VALUE "CAMBIA_ESTA_CLAVE_WIFI"
#endif

const char* ssid     = WIFI_SSID_VALUE;
const char* password = WIFI_PASSWORD_VALUE;

#ifndef BACKEND_MODE_VALUE
#define BACKEND_MODE_VALUE BACKEND_PUBLIC
#endif

#ifndef BACKEND_BASE_URL_LOCAL_VALUE
#define BACKEND_BASE_URL_LOCAL_VALUE "http://host.wokwi.internal:3000"
#endif

#ifndef BACKEND_BASE_URL_PUBLIC_VALUE
#define BACKEND_BASE_URL_PUBLIC_VALUE "https://sistemas-de-deteccion-de-fugas.up.railway.app"
#endif

#ifndef DEVICE_NAME_VALUE
#define DEVICE_NAME_VALUE "ESP32-FISICO-01"
#endif

#ifndef DEVICE_TYPE_VALUE
#define DEVICE_TYPE_VALUE "ESP32-FISICO"
#endif

#ifndef DEVICE_FIRMWARE_VERSION_VALUE
#define DEVICE_FIRMWARE_VERSION_VALUE "fisico-1.0.0"
#endif

#ifndef DEVICE_HARDWARE_UID_VALUE
#define DEVICE_HARDWARE_UID_VALUE "HW-ESP32-FISICO-01"
#endif

#ifndef DEVICE_ID_VALUE
#define DEVICE_ID_VALUE 0
#endif

#ifndef HOUSE_ID_VALUE
#define HOUSE_ID_VALUE 0
#endif

#ifndef SENSOR_ID_VALUE
#define SENSOR_ID_VALUE 0
#endif

#ifndef INGEST_API_KEY_VALUE
#define INGEST_API_KEY_VALUE "pon_una_clave_larga_y_nueva"
#endif

// El despliegue principal usa Railway. Para probar contra un backend local,
// compila con BACKEND_MODE_VALUE=BACKEND_LOCAL.
const BackendMode BACKEND_MODE = static_cast<BackendMode>(BACKEND_MODE_VALUE);
const char* BACKEND_BASE_URL_LOCAL  = BACKEND_BASE_URL_LOCAL_VALUE;
const char* BACKEND_BASE_URL_PUBLIC = BACKEND_BASE_URL_PUBLIC_VALUE;
const char* DEVICE_NAME = DEVICE_NAME_VALUE;
const char* DEVICE_TYPE = DEVICE_TYPE_VALUE;
const char* DEVICE_FIRMWARE_VERSION = DEVICE_FIRMWARE_VERSION_VALUE;
const char* DEVICE_HARDWARE_UID = DEVICE_HARDWARE_UID_VALUE;
const int DEVICE_ID = DEVICE_ID_VALUE;
const int HOUSE_ID = HOUSE_ID_VALUE;
const int SENSOR_ID = SENSOR_ID_VALUE;
// Esta clave debe ser EXACTAMENTE la misma que la variable INGEST_API_KEY del
// backend activo. Inyectala por build con INGEST_API_KEY_VALUE.
const char* INGEST_API_KEY = INGEST_API_KEY_VALUE;
// Sensor cada 0.5 segundos, envios cada 2 segundos, comandos cada 5 segundos.
// Railway por HTTPS puede tardar mas en hardware real que en simulacion.
const unsigned long SENSOR_READ_INTERVAL_MS = 500;
const unsigned long BACKEND_SEND_INTERVAL_MS = 2000;
const unsigned long BACKEND_COMMAND_POLL_INTERVAL_MS = 5000;
const unsigned long BACKEND_TIMEOUT_MS = 5000;

const int flowPin    = 27;
const int flowControlPin = 35;
const int pressurePin = 34;
const int ledVerde   = 2;
const int ledNaranja = 15;
const int ledRojo    = 4;
const int buzzerPin  = 16;
const int relayPin   = 17;
const int valveIndicatorPin = 5;
const int buttonPin  = 13;

// Calibracion comprobada en hardware real.
// El transductor entrega aprox. 0.27V a 0 PSI y 2.46V a 100 PSI
// despues de reconstruir el voltaje con el divisor usado en el PCB.
const float PRESSURE_SENSOR_MAX_PSI = 100.0f;
const float PRESSURE_SENSOR_MIN_V = 0.27f;
const float PRESSURE_SENSOR_MAX_V = 2.46f;
const float PRESSURE_DIVIDER_FACTOR = 1.5f;
const float PRESSURE_DEAD_ZONE_PSI = 0.5f;

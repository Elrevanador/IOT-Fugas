#include "modulos/config.h"

const char* ssid     = "Wokwi-GUEST";
const char* password = "";

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
#define DEVICE_NAME_VALUE "ESP32-WOKWI-01"
#endif

#ifndef DEVICE_TYPE_VALUE
#define DEVICE_TYPE_VALUE "ESP32-WOKWI"
#endif

#ifndef DEVICE_FIRMWARE_VERSION_VALUE
#define DEVICE_FIRMWARE_VERSION_VALUE "sim-1.0.0"
#endif

#ifndef DEVICE_HARDWARE_UID_VALUE
#define DEVICE_HARDWARE_UID_VALUE "HW-WOKWI-ESP32-01"
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
#define INGEST_API_KEY_VALUE "CAMBIA_ESTA_CLAVE_POR_UNA_NUEVA"
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
// Intervalos optimizados para una demo reactiva en Wokwi.
// Sensor cada 0.5 segundos, envios cada 2 segundos, comandos cada 5 segundos.
// Timeout reducido para no bloquear en conexiones lentas.
const unsigned long SENSOR_READ_INTERVAL_MS = 500;
const unsigned long BACKEND_SEND_INTERVAL_MS = 2000;
const unsigned long BACKEND_COMMAND_POLL_INTERVAL_MS = 5000;
const unsigned long BACKEND_TIMEOUT_MS = 500;

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

// En Wokwi el potenciometro de presion entra directo al ADC: 0V-3.3V = 0-100 PSI.
// En hardware real, el transductor 0.5V-4.5V debe pasar por el divisor 10k/20k.
const float PRESSURE_SENSOR_MAX_PSI = 100.0f;
const float PRESSURE_SENSOR_MIN_V = 0.0f;
const float PRESSURE_SENSOR_MAX_V = 3.3f;
const float PRESSURE_DIVIDER_FACTOR = 1.0f;

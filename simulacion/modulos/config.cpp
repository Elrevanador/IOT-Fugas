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
#define BACKEND_BASE_URL_PUBLIC_VALUE "https://backend-production-bd4c6.up.railway.app"
#endif

#ifndef DEVICE_NAME_VALUE
#define DEVICE_NAME_VALUE "ESP32-WOKWI-01"
#endif

#ifndef INGEST_API_KEY_VALUE
#define INGEST_API_KEY_VALUE "wokwi-dev-ingest-key"
#endif

// En este repo dejamos Railway como destino por defecto para evitar que Wokwi
// siga apuntando a host.wokwi.internal cuando ya estas probando el despliegue.
// Si quieres volver a local, cambia BACKEND_MODE a BACKEND_LOCAL.
const BackendMode BACKEND_MODE = static_cast<BackendMode>(BACKEND_MODE_VALUE);
const char* BACKEND_BASE_URL_LOCAL  = BACKEND_BASE_URL_LOCAL_VALUE;
const char* BACKEND_BASE_URL_PUBLIC = BACKEND_BASE_URL_PUBLIC_VALUE;
const char* DEVICE_NAME = DEVICE_NAME_VALUE;
// Esta clave debe ser EXACTAMENTE la misma que la variable INGEST_API_KEY del
// servicio backend en Railway. Inyectala por build con INGEST_API_KEY_VALUE.
const char* INGEST_API_KEY = INGEST_API_KEY_VALUE;
// Enviamos con la misma cadencia de medicion para que el dashboard refleje
// los cambios casi al instante sin esperar 15 segundos entre publicaciones.
const unsigned long BACKEND_SEND_INTERVAL_MS = 2000;

const int flowPin    = 27;
const int ledVerde   = 2;
const int ledNaranja = 15;
const int ledRojo    = 4;
const int buzzerPin  = 16;

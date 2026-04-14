#include "modulos/config.h"

const char* ssid     = "Wokwi-GUEST";
const char* password = "";

// En desarrollo local / Wokwi, usar BACKEND_LOCAL para enviar datos al backend local.
// Cambia a BACKEND_PUBLIC y actualiza BACKEND_BASE_URL_PUBLIC para tu despliegue en Railway.
const BackendMode BACKEND_MODE = BACKEND_LOCAL;
const char* BACKEND_BASE_URL_LOCAL  = "http://host.wokwi.internal:3000";
const char* BACKEND_BASE_URL_PUBLIC = "https://tu-app.railway.app";
const char* DEVICE_NAME = "ESP32-WOKWI-01";
const char* INGEST_API_KEY = "wokwi-dev-ingest-key";
const unsigned long BACKEND_SEND_INTERVAL_MS = 15000;

const int flowPin    = 27;
const int ledVerde   = 2;
const int ledNaranja = 15;
const int ledRojo    = 4;
const int buzzerPin  = 16;

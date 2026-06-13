#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Preferences.h>
#include <mbedtls/md.h>
#include <esp_task_wdt.h>

// ===================== CONFIGURACION =====================
#define DEBUG_SERIAL

// ===================== CLAVES DE SEGURIDAD =====================
const char* HMAC_SECRET_KEY = "c0ntraclave-hmac-muy-segura-2024!";

// ===================== TLS =====================
#ifndef BACKEND_ROOT_CA_PEM
#define BACKEND_ROOT_CA_PEM ""
#endif

#ifndef BACKEND_ALLOW_INSECURE_TLS
#define BACKEND_ALLOW_INSECURE_TLS 1
#endif

// ===================== PARÁMETROS POR DEFECTO =====================
#ifndef WIFI_SSID_VALUE
#define WIFI_SSID_VALUE "Redmi"
#endif
#ifndef WIFI_PASSWORD_VALUE
#define WIFI_PASSWORD_VALUE "12345678"
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
#ifndef INGEST_API_KEY_VALUE
#define INGEST_API_KEY_VALUE "pon_una_clave_larga_y_nueva"
#endif

const char* DEFAULT_SSID             = WIFI_SSID_VALUE;
const char* DEFAULT_PASSWORD         = WIFI_PASSWORD_VALUE;
const char* DEFAULT_INGEST_API_KEY   = INGEST_API_KEY_VALUE;
const char* DEVICE_NAME              = DEVICE_NAME_VALUE;
const char* DEVICE_TYPE              = DEVICE_TYPE_VALUE;
const char* DEVICE_FIRMWARE_VERSION  = DEVICE_FIRMWARE_VERSION_VALUE;
const char* DEVICE_HARDWARE_UID      = DEVICE_HARDWARE_UID_VALUE;

enum BackendMode { BACKEND_LOCAL = 0, BACKEND_PUBLIC = 1 };
const BackendMode BACKEND_MODE = BACKEND_PUBLIC;
const char* BACKEND_BASE_URL_LOCAL  = "http://host.wokwi.internal:3000";
const char* BACKEND_BASE_URL_PUBLIC = "https://sistemas-de-deteccion-de-fugas.up.railway.app";

const int DEVICE_ID = 0;
const int HOUSE_ID  = 0;
const int SENSOR_ID = 0;

const int SCREEN_WIDTH  = 128;
const int SCREEN_HEIGHT = 64;
const int OLED_ADDR     = 0x3C;
const int OLED_RESET    = -1;

const unsigned long SENSOR_READ_INTERVAL_MS        = 500;
const unsigned long BACKEND_SEND_INTERVAL_MS       = 2000;
const unsigned long BACKEND_COMMAND_POLL_INTERVAL_MS = 5000;
const unsigned long BACKEND_TIMEOUT_MS             = 5000;
const unsigned long ALERTA_A_FUGA_TIMEOUT_MS       = 30000;

// ---- Pines (actualizados según tu asignación) ----
const int flowPin    = 27;
const int pressurePin = 34;
const int ledAzul    = 5;   // D5
const int ledVerde   = 4;   // D4
const int ledNaranja = 15;  // D15
const int ledRojo    = 2;   // D2
const int buzzerPin  = 16;
const int relayPin   = 17;
const int valveIndicatorPin = ledAzul;
const int buttonPin  = 13;

#ifndef DEMO_SENSIBLE
#define DEMO_SENSIBLE 1
#endif

const float PRESSURE_SENSOR_MAX_PSI      = 100.0f;
const float PRESSURE_SENSOR_MIN_V        = 0.27f;
const float PRESSURE_SENSOR_MAX_V        = 2.46f;
const float PRESSURE_DIVIDER_FACTOR      = 1.5f;
const float PRESSURE_DEAD_ZONE_PSI       = 0.5f;
const bool  DEMO_ESTIMAR_FLUJO_SIN_PULSOS            = DEMO_SENSIBLE;
const float DEMO_PRESION_MIN_FLUJO_ESTIMADO_KPA      = 10.0f;
const float DEMO_PRESION_MAX_FLUJO_ESTIMADO_KPA      = 180.0f;
const float DEMO_FLUJO_ESTIMADO_MIN_LMIN             = 0.60f;
const float DEMO_FLUJO_ESTIMADO_MAX_LMIN             = 1.80f;

// Demo fisica con bomba PF338:
// La bomba puede generar flujo real aunque el transductor de presion este en
// cero, sin agua suficiente en la linea o desconectado. Para la presentacion
// no marcamos ERROR solo por P=0 si el YF-S201 esta midiendo caudal real.
const bool  PF338_SIMULAR_PRESION_EN_DEMO             = true;
const bool  PF338_PRESION_OPCIONAL_EN_DEMO            = true;
const float PF338_FLUJO_REAL_MIN_LMIN                 = 0.25f;
const float PF338_FUGA_FLUJO_BAJO_LMIN                = 0.90f;
const float PF338_FLUJO_NORMAL_MIN_LMIN               = 1.20f;
const unsigned long PF338_ALERTA_A_FUGA_MS            = 8000;
const float PF338_PRESION_VIRTUAL_REPOSO_KPA          = 28.0f;
const float PF338_PRESION_VIRTUAL_NORMAL_ALTA_KPA     = 24.0f;
const float PF338_PRESION_VIRTUAL_NORMAL_BAJA_KPA     = 20.0f;
const float PF338_PRESION_VIRTUAL_ALERTA_KPA          = 16.0f;
const float PF338_PRESION_VIRTUAL_FUGA_KPA            = 9.0f;

// ===================== ESTADO Y LÓGICA =====================
enum EstadoSistema {
  ESTADO_NORMAL = 0,
  ESTADO_ALERTA = 1,
  ESTADO_FUGA   = 2,
  ESTADO_ERROR  = 3
};

const float UMBRAL_ALERTA_FLUJO_IN       = DEMO_SENSIBLE ? 4.5 : 1.0;
const float UMBRAL_ALERTA_PRES_IN        = DEMO_SENSIBLE ? 18.0 : 250.0;
const float UMBRAL_CRITICO_FLUJO         = DEMO_SENSIBLE ? 7.0 : 2.2;
const float UMBRAL_CRITICO_PRES          = DEMO_SENSIBLE ? 12.0 : 180.0;
const float UMBRAL_NORMAL_FLUJO_OUT      = DEMO_SENSIBLE ? 3.8  : 0.85;
const float UMBRAL_NORMAL_PRES_OUT       = DEMO_SENSIBLE ? 20.0 : 280.0;
const float PRESION_RECUPERACION_NORMAL  = DEMO_SENSIBLE ? 20.0 : 290.0;
const float UMBRAL_REPOSO_FLUJO_DEMO_MAX = DEMO_SENSIBLE ? 1.2 : 0.0;
const float UMBRAL_REPOSO_PRES_DEMO_MIN  = DEMO_SENSIBLE ? 15.0 : 0.0;
const float UMBRAL_SIN_PASO_FLUJO_MAX    = DEMO_SENSIBLE ? 0.15 : 0.05;
const float UMBRAL_SIN_PASO_PRES_MIN     = DEMO_SENSIBLE ? 20.0 : 320.0;
const int   LECTURAS_SIN_FLUJO_REQUERIDAS = DEMO_SENSIBLE ? 3 : 6;
const int   LECTURAS_ALERTA_REQUERIDAS    = 1;
const int   LECTURAS_CRITICAS_REQUERIDAS  = DEMO_SENSIBLE ? 6 : 3;
const int   LECTURAS_RECUPERACION_FUGA_REQUERIDAS = 3;

// ===================== STRUCT ESTADO =====================
// FIX #1: contadorSinFlujo y demoSistemaPresurizado ahora son parte del
//         struct para que se reinicien correctamente en cada boot, en lugar
//         de ser variables static locales dentro de evaluarEstado que
//         sobreviven al reset del struct tras un watchdog reboot.
struct SystemState {
  volatile uint32_t pulseCount = 0;
  float flujoLmin   = 0.0;
  float presionKPa  = 0.0;
  bool sensorOK              = true;
  bool ledBlinkState         = false;
  bool primeraLectura        = true;
  // FIX #3: flujoRealDetectado ahora se gestiona con un contador de
  //         lecturas sin pulsos para evitar que quede en true permanentemente
  //         tras un solo pulso espurio.
  bool flujoRealDetectado    = false;
  int  sinPulsosConsecutivos = 0;
  uint32_t backendEnvios = 0;
  int backendLastCode = 0;
  bool backendOnline = false;
  String backendLastMsg = "Sin intentos";
  bool valvulaAbierta = true;
  uint32_t comandosBackend = 0;
  String ultimoComandoBackend = "Sin comandos";
  int contadorAlerta  = 0;
  int contadorCritico = 0;
  int contadorRecuperacionFuga = 0;
  int nivelRiesgo     = 20;
  bool alertaPersistenteActiva = false;
  unsigned long alertaInicioMs = 0;
  EstadoSistema estadoSistema = ESTADO_NORMAL;
  // FIX #1: movidos desde static local en evaluarEstado
  int  contadorSinFlujo      = 0;
  bool demoSistemaPresurizado = false;
  // FIX #4: suprimir ALERTA por presión baja durante arranque.
  //         presionBaja = (presionKPa <= 35) es SIEMPRE true con P=0 kPa,
  //         lo que dispara ALERTA en las primeras lecturas aunque no haya fuga.
  //         Se ignora presionBaja hasta que el sistema haya tenido al menos
  //         LECTURAS_ARRANQUE lecturas estables o haya visto presión real.
  int  lecturasArranque      = 0;
  bool sistemaCalibrado      = false;
  unsigned long lastBackoffAttempt        = 0;
  unsigned long lastCommandBackoffAttempt = 0;
};

static String wifiSSID;
static String wifiPass;
static String ingestApiKey;

const char* WIFI_MANAGER_AP_NAME     = "ESP32-FUGAS-SETUP";
const char* WIFI_MANAGER_AP_PASSWORD = "12345678";
static const unsigned long WIFI_CONNECT_TIMEOUT_MS = 45000;

// ===================== UTILIDADES =====================
static float limitarFloat(float valor, float minimo, float maximo) {
  if (valor < minimo) return minimo;
  if (valor > maximo) return maximo;
  return valor;
}

String estadoTexto(EstadoSistema estado) {
  switch (estado) {
    case ESTADO_NORMAL: return "NORMAL";
    case ESTADO_ALERTA: return "ALERTA";
    case ESTADO_FUGA:   return "FUGA";
    case ESTADO_ERROR:  return "ERROR";
    default:            return "DESCONOCIDO";
  }
}

int calcularRiesgoContinuo(float flujo, float presion, bool sensorOK) {
  float scoreFlujo;
  float scorePres;
#if DEMO_SENSIBLE
  scoreFlujo = limitarFloat((flujo  - 3.8)  / (7.5 - 3.8),   0.0, 1.0);
  scorePres  = limitarFloat((20.0 - presion) / (20.0 - 12.0),  0.0, 1.0);
#else
  scoreFlujo = limitarFloat((flujo  - 0.6)  / (2.8 - 0.6),    0.0, 1.0);
  scorePres  = limitarFloat((300.0 - presion) / (300.0 - 170.0), 0.0, 1.0);
#endif
  float riesgo = (scoreFlujo * 0.55 + scorePres * 0.45) * 100.0;
  if (!sensorOK) return 5;
  return (int)limitarFloat(riesgo, 0.0, 100.0);
}

// FIX #1: la función recibe state completo para usar/modificar
//         contadorSinFlujo y demoSistemaPresurizado sin variables static locales.
EstadoSistema evaluarEstado(SystemState &state) {
  float flujoLmin   = state.flujoLmin;
  float presionKPa  = state.presionKPa;
  bool  sensorOK    = state.sensorOK;
  bool  estabaEnAlerta = state.estadoSistema == ESTADO_ALERTA;

  state.nivelRiesgo = calcularRiesgoContinuo(flujoLmin, presionKPa, sensorOK);

  // Una fuga confirmada queda estable, pero puede recuperarse si el flujo
  // vuelve al rango normal durante varias lecturas seguidas.
  if (state.estadoSistema == ESTADO_FUGA) {
    bool fugaRecuperadaPF338 =
      PF338_SIMULAR_PRESION_EN_DEMO &&
      flujoLmin >= PF338_FLUJO_NORMAL_MIN_LMIN;

    if (fugaRecuperadaPF338) {
      state.contadorRecuperacionFuga = min(state.contadorRecuperacionFuga + 1, 10);
      if (state.contadorRecuperacionFuga >= LECTURAS_RECUPERACION_FUGA_REQUERIDAS) {
        state.contadorAlerta = 0;
        state.contadorCritico = 0;
        state.contadorRecuperacionFuga = 0;
        state.nivelRiesgo = min(state.nivelRiesgo, 15);
        state.valvulaAbierta = true;
        state.alertaPersistenteActiva = false;
        state.alertaInicioMs = 0;
        return ESTADO_NORMAL;
      }
    } else {
      state.contadorRecuperacionFuga = 0;
    }

    state.contadorAlerta  = max(state.contadorAlerta, LECTURAS_ALERTA_REQUERIDAS);
    state.contadorCritico = max(state.contadorCritico, LECTURAS_CRITICAS_REQUERIDAS);
    state.nivelRiesgo     = max(state.nivelRiesgo, 90);
    state.valvulaAbierta  = false;
    state.alertaPersistenteActiva = false;
    state.alertaInicioMs = 0;
    return ESTADO_FUGA;
  }

  if (!sensorOK) {
    state.contadorAlerta  = 0;
    state.contadorCritico = 0;
    state.nivelRiesgo     = 5;
    return ESTADO_ERROR;
  }

  bool flujoAnomalo  = flujoLmin >= UMBRAL_ALERTA_FLUJO_IN;
  bool flujoCritico  = flujoLmin >= UMBRAL_CRITICO_FLUJO;
  bool presionCritica= presionKPa <= UMBRAL_CRITICO_PRES;

  if (PF338_SIMULAR_PRESION_EN_DEMO) {
    bool flujoNormalPF338 = flujoLmin >= PF338_FLUJO_NORMAL_MIN_LMIN;
    bool flujoBajoAnormal = flujoLmin >= PF338_FLUJO_REAL_MIN_LMIN &&
                            flujoLmin < PF338_FLUJO_NORMAL_MIN_LMIN;

    if (flujoNormalPF338 || flujoLmin < PF338_FLUJO_REAL_MIN_LMIN) {
      state.contadorAlerta = 0;
      state.contadorCritico = 0;
      state.contadorSinFlujo = 0;
      state.nivelRiesgo = min(state.nivelRiesgo, 15);
      state.alertaPersistenteActiva = false;
      state.alertaInicioMs = 0;
      return ESTADO_NORMAL;
    }

    if (flujoBajoAnormal) {
      if (!state.alertaPersistenteActiva) {
        state.alertaPersistenteActiva = true;
        state.alertaInicioMs = millis();
      }

      unsigned long alertaMs = millis() - state.alertaInicioMs;
      state.contadorAlerta = min(state.contadorAlerta + 1, 10);
      state.nivelRiesgo = max(state.nivelRiesgo, 60);

      if (alertaMs >= PF338_ALERTA_A_FUGA_MS) {
        state.contadorCritico = min(state.contadorCritico + 1, 10);
        state.contadorRecuperacionFuga = 0;
        state.nivelRiesgo = max(state.nivelRiesgo, 90);
        state.valvulaAbierta = false;
        state.alertaPersistenteActiva = false;
        state.alertaInicioMs = 0;
        return ESTADO_FUGA;
      }

      state.contadorCritico = 0;
      return ESTADO_ALERTA;
    }
  }

  // FIX #4: el sistema se considera "calibrado" cuando ha acumulado
  //         8 lecturas sin flujo ni presión anómalos, O cuando detecta
  //         presión real (sistema presurizado). Antes de calibrarse,
  //         presionBaja se ignora para no disparar ALERTA con P=0 kPa al boot.
  state.lecturasArranque++;
  if (!state.sistemaCalibrado) {
    if (presionKPa >= PRESION_RECUPERACION_NORMAL || flujoLmin > 0.20f) {
      state.sistemaCalibrado = true;
    } else if (state.lecturasArranque >= 8) {
      state.sistemaCalibrado = true;
    }
  }
  // FIX #4 reforzado: presionBaja solo es válida si:
  //   1) el sistema ya se calibró (>8 lecturas o presión real vista), Y
  //   2) no estamos en la condición de "nada conectado" (P=0 y Q=0)
  //      que siempre sería presionBaja=true aunque no haya fuga.
  bool presionBaja = state.sistemaCalibrado &&
                     (presionKPa <= UMBRAL_ALERTA_PRES_IN) &&
                     !(flujoLmin == 0.0f && presionKPa == 0.0f);

  if (DEMO_SENSIBLE &&
      flujoLmin <= UMBRAL_REPOSO_FLUJO_DEMO_MAX &&
      presionKPa >= UMBRAL_REPOSO_PRES_DEMO_MIN) {
    state.contadorAlerta = 0;
    state.contadorCritico = 0;
    state.contadorSinFlujo = 0;
    state.nivelRiesgo = 0;
    state.alertaPersistenteActiva = false;
    state.alertaInicioMs = 0;
    return ESTADO_NORMAL;
  }

  // Usa contadores del struct (no static locales)
  if (presionKPa >= PRESION_RECUPERACION_NORMAL || flujoLmin > 0.20) {
    state.demoSistemaPresurizado = true;
  }

  if (DEMO_SENSIBLE && flujoLmin <= UMBRAL_SIN_PASO_FLUJO_MAX) {
    state.contadorSinFlujo = min(state.contadorSinFlujo + 1, 20);
  } else {
    state.contadorSinFlujo = 0;
  }

  bool sinPasoDemo = DEMO_SENSIBLE && state.contadorSinFlujo >= LECTURAS_SIN_FLUJO_REQUERIDAS;
  bool sinPasoConPresion =
    sinPasoDemo ||
    (DEMO_SENSIBLE &&
     flujoLmin <= UMBRAL_SIN_PASO_FLUJO_MAX &&
     presionKPa >= UMBRAL_SIN_PASO_PRES_MIN);

  if (sinPasoConPresion) {
    state.contadorAlerta  = 0;
    state.contadorCritico = 0;
    state.nivelRiesgo = min(state.nivelRiesgo, 15);
    return ESTADO_NORMAL;
  }

  if (presionKPa >= PRESION_RECUPERACION_NORMAL && flujoLmin <= UMBRAL_NORMAL_FLUJO_OUT) {
    state.contadorAlerta  = 0;
    state.contadorCritico = 0;
    state.nivelRiesgo = min(state.nivelRiesgo, 15);
    return ESTADO_NORMAL;
  }

  bool condicionCritica =
    (flujoCritico && presionBaja) ||
    (flujoAnomalo && presionCritica) ||
    (DEMO_SENSIBLE && state.demoSistemaPresurizado && presionCritica);

  bool condicionAlerta =
    flujoAnomalo ||
    presionBaja  ||
    (state.nivelRiesgo >= 35);

  bool condicionNormal =
    (flujoLmin  <= UMBRAL_NORMAL_FLUJO_OUT &&
     presionKPa >= UMBRAL_NORMAL_PRES_OUT &&
     state.nivelRiesgo < 35);

  if (condicionCritica) {
    state.contadorCritico = min(state.contadorCritico + 1, 10);
    state.contadorAlerta  = min(state.contadorAlerta  + 1, 10);
    if (estabaEnAlerta && state.contadorCritico >= LECTURAS_CRITICAS_REQUERIDAS) return ESTADO_FUGA;
    return ESTADO_ALERTA;
  }
  if (condicionAlerta) {
    state.contadorAlerta  = min(state.contadorAlerta  + 1, 10);
    state.contadorCritico = max(state.contadorCritico - 1, 0);
    if (state.contadorAlerta >= LECTURAS_ALERTA_REQUERIDAS) return ESTADO_ALERTA;
    return ESTADO_NORMAL;
  }
  if (condicionNormal) {
    state.contadorAlerta  = 0;
    state.contadorCritico = 0;
    state.nivelRiesgo = min(state.nivelRiesgo, 20);
    return ESTADO_NORMAL;
  }

  state.contadorAlerta  = max(state.contadorAlerta  - 1, 0);
  state.contadorCritico = max(state.contadorCritico - 1, 0);
  if (estabaEnAlerta && state.contadorCritico >= LECTURAS_CRITICAS_REQUERIDAS) return ESTADO_FUGA;
  if (state.contadorAlerta  >= 1)                             return ESTADO_ALERTA;
  return ESTADO_NORMAL;
}

void aplicarFugaPorAlertaPersistente(SystemState &state, unsigned long now) {
  if (PF338_SIMULAR_PRESION_EN_DEMO) {
    return;
  }

  if (state.estadoSistema == ESTADO_ALERTA) {
    if (!state.alertaPersistenteActiva) {
      state.alertaPersistenteActiva = true;
      state.alertaInicioMs = now;
    }
    if (now - state.alertaInicioMs >= ALERTA_A_FUGA_TIMEOUT_MS) {
      state.estadoSistema   = ESTADO_FUGA;
      state.contadorCritico = max(state.contadorCritico, LECTURAS_CRITICAS_REQUERIDAS);
      state.nivelRiesgo     = max(state.nivelRiesgo, 90);
      state.valvulaAbierta  = false;
      state.alertaPersistenteActiva = false;
      state.alertaInicioMs = 0;
      return;
    }
  } else if (state.estadoSistema == ESTADO_NORMAL || state.estadoSistema == ESTADO_ERROR) {
    state.alertaPersistenteActiva = false;
    state.alertaInicioMs = 0;
  }
  if (state.estadoSistema == ESTADO_FUGA) {
    state.alertaPersistenteActiva = false;
    state.alertaInicioMs = 0;
  }
}

// ===================== OBJETOS Y TEMPORIZADORES =====================
Adafruit_SSD1306 oled(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
SystemState state;

unsigned long lastMeasure     = 0;
unsigned long lastSend        = 0;
unsigned long lastCommandPoll = 0;
unsigned long lastBlink       = 0;
unsigned long lastLCDUpdate   = 0;

// ===================== WIFI / BACKEND =====================
static unsigned long s_backoffMs        = 0;
static unsigned long s_commandBackoffMs = 0;
static const unsigned long BACKOFF_MAX_MS  = 30000;
static const unsigned long BACKOFF_BASE_MS = 1000;

String backendBaseUrl()     { return BACKEND_MODE == BACKEND_PUBLIC ? String(BACKEND_BASE_URL_PUBLIC) : String(BACKEND_BASE_URL_LOCAL); }
String backendReadingsUrl() { return backendBaseUrl() + "/api/readings"; }
String backendModeTexto()   { return BACKEND_MODE == BACKEND_PUBLIC ? "PUBLIC" : "LOCAL"; }

static bool isUrlUnreserved(char c) {
  return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') ||
         c == '-' || c == '_' || c == '.' || c == '~';
}
static String urlEncode(const String &value) {
  const char hex[] = "0123456789ABCDEF";
  String encoded = "";
  encoded.reserve(value.length() + 8);
  for (size_t i = 0; i < value.length(); i++) {
    unsigned char c = (unsigned char)value.charAt(i);
    if (isUrlUnreserved((char)c)) {
      encoded += (char)c;
    } else {
      encoded += '%';
      encoded += hex[(c >> 4) & 0x0F];
      encoded += hex[c & 0x0F];
    }
  }
  return encoded;
}
static String backendDeviceKeyQuery() { return "deviceKey=" + urlEncode(ingestApiKey); }

String backendPendingCommandsUrl() {
  String url = backendBaseUrl() + "/api/commands/pending?";
  url += backendDeviceKeyQuery();
  if (DEVICE_ID > 0) {
    url += "&deviceId=" + String(DEVICE_ID);
  } else {
    url += "&deviceName=" + urlEncode(String(DEVICE_NAME));
  }
  if (String(DEVICE_HARDWARE_UID).length() > 0) {
    url += "&hardwareUid=" + urlEncode(String(DEVICE_HARDWARE_UID));
  }
  return url;
}
String backendCommandResponseUrl(unsigned long commandId) {
  return backendBaseUrl() + "/api/commands/" + String(commandId) + "/response?" + backendDeviceKeyQuery();
}

static bool backendUsaHttps(const String &url) { return url.startsWith("https://"); }
static bool wifiConectado()  { return WiFi.status() == WL_CONNECTED; }
static String ipLocalTexto() { if (!wifiConectado()) return ""; return WiFi.localIP().toString(); }

static bool conectarWifiGuardado(const String &ssid, const String &password, unsigned long timeoutMs) {
  if (ssid.length() == 0) return false;
  Serial.print("Intentando WiFi guardado: ");
  Serial.println(ssid);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.persistent(false);
  WiFi.disconnect(false);
  delay(500);
  if (password.length() > 0) {
    WiFi.begin(ssid.c_str(), password.c_str());
  } else {
    WiFi.begin(ssid.c_str());
  }
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < timeoutMs) {
    delay(500);
    Serial.print(".");
    esp_task_wdt_reset(); // FIX #2: reset WDT durante espera WiFi
  }
  Serial.println();
  if (wifiConectado()) {
    wifiSSID = WiFi.SSID();
    Serial.println("WiFi conectado con credenciales guardadas");
    Serial.print("IP: "); Serial.println(ipLocalTexto());
    return true;
  }
  Serial.print("Fallo conexion guardada. Estado WiFi: "); Serial.println(WiFi.status());
  return false;
}

static void conectarWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  if (conectarWifiGuardado(wifiSSID, wifiPass, WIFI_CONNECT_TIMEOUT_MS)) return;

  WiFiManager wm;
  wm.setConnectTimeout(45);
  wm.setConfigPortalTimeout(180);
  wm.setBreakAfterConfig(true);
  Serial.println("Conectando WiFi con WiFiManager...");
  Serial.print("Si no conecta, abre la red: "); Serial.println(WIFI_MANAGER_AP_NAME);

  oled.clearDisplay();
  oled.setTextColor(SSD1306_WHITE);
  oled.setTextSize(1);
  oled.setCursor(0,  8); oled.print("WiFiManager");
  oled.setCursor(0, 24); oled.print(WIFI_MANAGER_AP_NAME);
  oled.setCursor(0, 40); oled.print("Clave: "); oled.print(WIFI_MANAGER_AP_PASSWORD);
  oled.display();

  // WiFiManager puede bloquear la loopTask durante el portal/configuracion.
  // En demo fisica evitamos que el watchdog reinicie el ESP32 en ese tramo.
  esp_task_wdt_delete(NULL);
  bool conectado = wm.autoConnect(WIFI_MANAGER_AP_NAME, WIFI_MANAGER_AP_PASSWORD);
  esp_task_wdt_add(NULL);
  esp_task_wdt_reset();
  if (!conectado && WiFi.status() != WL_CONNECTED) {
    Serial.println("No se pudo configurar WiFi. Reiniciando...");
    delay(1000);
    ESP.restart();
  }
  if (wifiConectado()) {
    wifiSSID = WiFi.SSID();
    Serial.println("WiFi conectado");
    Serial.print("IP: "); Serial.println(ipLocalTexto());
  } else {
    Serial.println("No se pudo conectar a WiFi");
  }
}

void initWiFi() { conectarWiFi(); }

static bool probarYCambiarWifi(const String &nuevoSsid, const String &nuevaPassword) {
  Serial.print("Probando nueva red WiFi: "); Serial.println(nuevoSsid);
  WiFi.persistent(false);
  WiFi.disconnect(false);
  delay(600);
  WiFi.begin(nuevoSsid.c_str(), nuevaPassword.c_str());
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) {
    delay(300);
    Serial.print(".");
    esp_task_wdt_reset(); // FIX #2
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    wifiSSID = nuevoSsid;
    wifiPass = nuevaPassword;
    Preferences pref;
    pref.begin("creds", false);
    pref.putString("ssid", wifiSSID);
    pref.putString("pass", wifiPass);
    pref.end();
    WiFi.persistent(true);
    WiFi.begin(wifiSSID.c_str(), wifiPass.c_str());
    WiFi.persistent(false);
    Serial.print("Nueva red WiFi conectada. IP: "); Serial.println(WiFi.localIP());
    return true;
  }
  Serial.println("No se pudo conectar a la nueva red. Se abrira el portal WiFiManager.");
  return false;
}

static void borrarCredencialesWifiYReiniciar() {
  Serial.println("Borrando credenciales WiFi guardadas...");
  Preferences pref;
  pref.begin("creds", false);
  pref.remove("ssid");
  pref.remove("pass");
  pref.end();
  WiFiManager wm;
  wm.resetSettings();
  WiFi.disconnect(true, true);
  delay(1000);
  ESP.restart();
}

bool asegurarWiFi() {
  if (wifiConectado()) return true;
  Serial.println("WiFi caido. Reconectando...");
  WiFi.disconnect(false);
  WiFi.reconnect();
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 10000) {
    delay(300);
    Serial.print(".");
    esp_task_wdt_reset(); // FIX #2
  }
  Serial.println();
  if (wifiConectado()) {
    Serial.println("WiFi reconectado");
    Serial.print("IP: "); Serial.println(ipLocalTexto());
    return true;
  }
  Serial.println("No fue posible reconectar WiFi");
  conectarWiFi();
  return wifiConectado();
}

static void updateBackoff(bool success, unsigned long &backoffMs) {
  if (success) { backoffMs = 0; }
  else { backoffMs = backoffMs == 0 ? BACKOFF_BASE_MS : min(backoffMs * 2, BACKOFF_MAX_MS); }
}
static bool shouldRetryHttpCode(int code) {
  return code == 429 || code == 500 || code == 502 || code == 503 || code == 504;
}

static String escapeJson(const String &value) {
  String escaped = "";
  escaped.reserve(value.length() + 8);
  for (size_t i = 0; i < value.length(); i++) {
    char c = value.charAt(i);
    if      (c == '"' || c == '\\') { escaped += '\\'; escaped += c; }
    else if (c == '\n') escaped += "\\n";
    else if (c == '\r') escaped += "\\r";
    else if (c == '\t') escaped += "\\t";
    else                escaped += c;
  }
  return escaped;
}

static String seguridadWifiTexto(wifi_auth_mode_t encryptionType) {
  switch (encryptionType) {
    case WIFI_AUTH_OPEN:          return "OPEN";
    case WIFI_AUTH_WEP:           return "WEP";
    case WIFI_AUTH_WPA_PSK:       return "WPA";
    case WIFI_AUTH_WPA2_PSK:      return "WPA2";
    case WIFI_AUTH_WPA_WPA2_PSK:  return "WPA/WPA2";
    case WIFI_AUTH_WPA2_ENTERPRISE: return "WPA2-ENT";
    case WIFI_AUTH_WPA3_PSK:      return "WPA3";
    case WIFI_AUTH_WPA2_WPA3_PSK: return "WPA2/WPA3";
    default:                      return "UNKNOWN";
  }
}

static String construirPayloadEscaneoWifi() {
  esp_task_wdt_reset();
  int total = WiFi.scanNetworks(false, true);
  esp_task_wdt_reset();
  String payload = "\"payload\":{\"networks\":[";
  if (total > 0) {
    int limit = min(total, 12);
    for (int i = 0; i < limit; i++) {
      if (i > 0) payload += ",";
      wifi_auth_mode_t enc = WiFi.encryptionType(i);
      payload += "{";
      payload += "\"ssid\":\""    + escapeJson(WiFi.SSID(i)) + "\"";
      payload += ",\"rssi\":"     + String(WiFi.RSSI(i));
      payload += ",\"channel\":"  + String(WiFi.channel(i));
      payload += ",\"secure\":"   + String(enc == WIFI_AUTH_OPEN ? "false" : "true");
      payload += ",\"security\":\"" + seguridadWifiTexto(enc) + "\"";
      payload += "}";
    }
  }
  payload += "],\"count\":" + String(max(total, 0));
  payload += ",\"currentSsid\":\"" + escapeJson(WiFi.SSID()) + "\"";
  payload += "}";
  WiFi.scanDelete();
  return payload;
}

static String calcularHMAC(const String &data, const String &key) {
  byte result[32];
  mbedtls_md_context_t ctx;
  mbedtls_md_type_t md_type = MBEDTLS_MD_SHA256;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(md_type), 1);
  mbedtls_md_hmac_starts(&ctx, (const unsigned char*)key.c_str(), key.length());
  mbedtls_md_hmac_update(&ctx, (const unsigned char*)data.c_str(), data.length());
  mbedtls_md_hmac_finish(&ctx, result);
  mbedtls_md_free(&ctx);
  char hex[65];
  for (int i = 0; i < 32; i++) sprintf(hex + (i * 2), "%02x", result[i]);
  return String(hex);
}

static bool beginBackendHttp(HTTPClient &http, WiFiClient &client,
                             WiFiClientSecure &secureClient, const String &url,
                             SystemState &state) {
  http.setTimeout(BACKEND_TIMEOUT_MS);
  if (backendUsaHttps(url)) {
    if (BACKEND_ROOT_CA_PEM[0] != '\0') {
      secureClient.setCACert(BACKEND_ROOT_CA_PEM);
    } else {
#if BACKEND_ALLOW_INSECURE_TLS
      secureClient.setInsecure();
#else
      state.backendOnline  = false;
      state.backendLastCode = -2;
      state.backendLastMsg  = "TLS seguro requiere BACKEND_ROOT_CA_PEM";
      Serial.println("TLS seguro habilitado, pero falta BACKEND_ROOT_CA_PEM.");
      return false;
#endif
    }
    return http.begin(secureClient, url);
  }
  return http.begin(client, url);
}

// ===================== ENVÍO AL BACKEND =====================
void enviarBackend(SystemState &state) {
  if (!asegurarWiFi()) {
    state.backendOnline  = false;
    state.backendLastCode = 0;
    state.backendLastMsg  = "WiFi desconectado";
    Serial.println("Sin WiFi. No se envio al backend.");
    return;
  }
  if (s_backoffMs > 0) {
    unsigned long now = millis();
    if (now - state.lastBackoffAttempt < s_backoffMs) {
#ifdef DEBUG_SERIAL
      Serial.print("Backoff activo: esperando "); Serial.print(s_backoffMs); Serial.println(" ms.");
#endif
      return;
    }
    state.lastBackoffAttempt = now;
  }

  WiFiClient client;
  WiFiClientSecure secureClient;
  HTTPClient http;
  String url = backendReadingsUrl();

  String payload = "{";
  bool needsComma = false;
  auto appendField = [&](const String &fragment) {
    if (needsComma) payload += ",";
    payload += fragment;
    needsComma = true;
  };
  if (DEVICE_ID > 0) appendField("\"deviceId\":" + String(DEVICE_ID));
  if (HOUSE_ID  > 0) appendField("\"houseId\":"  + String(HOUSE_ID));
  appendField("\"deviceName\":\""       + escapeJson(String(DEVICE_NAME)) + "\"");
  if (String(DEVICE_TYPE).length() > 0)
    appendField("\"deviceType\":\""     + escapeJson(String(DEVICE_TYPE)) + "\"");
  if (String(DEVICE_FIRMWARE_VERSION).length() > 0)
    appendField("\"firmwareVersion\":\"" + escapeJson(String(DEVICE_FIRMWARE_VERSION)) + "\"");
  if (String(DEVICE_HARDWARE_UID).length() > 0)
    appendField("\"hardwareUid\":\""    + escapeJson(String(DEVICE_HARDWARE_UID)) + "\"");
  appendField("\"deviceKey\":\""        + escapeJson(ingestApiKey) + "\"");
  appendField("\"ipAddress\":\""        + WiFi.localIP().toString() + "\"");
  appendField("\"wifiSsid\":\""         + escapeJson(wifiSSID) + "\"");
  appendField("\"internetConnected\":"  + String(WiFi.status() == WL_CONNECTED ? "true" : "false"));
  if (SENSOR_ID > 0) appendField("\"sensorId\":" + String(SENSOR_ID));
  appendField("\"flow_lmin\":"          + String(state.flujoLmin, 2));
  appendField("\"pressure_kpa\":"       + String(state.presionKPa, 2));
  appendField("\"risk\":"               + String(state.nivelRiesgo));
  appendField("\"state\":\""            + estadoTexto(state.estadoSistema) + "\"");
  appendField("\"valveState\":\""       + String(state.valvulaAbierta ? "ABIERTA" : "CERRADA") + "\"");
  payload += "}";

  String signature = calcularHMAC(payload, HMAC_SECRET_KEY);

#ifdef DEBUG_SERIAL
  Serial.println(">>> Enviando lectura al backend...");
  Serial.println(url);
  Serial.println(payload);
  Serial.println("Firma: " + signature);
#else
  Serial.println("Enviando lectura... (modo silencioso)");
#endif

  if (!beginBackendHttp(http, client, secureClient, url, state)) {
    state.backendOnline  = false;
    state.backendLastCode = -1;
    state.backendLastMsg  = "No se pudo iniciar HTTP/HTTPS";
    updateBackoff(false, s_backoffMs);
    return;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-key", ingestApiKey);
  http.addHeader("x-signature", signature);

  // FIX #7: deshabilitar temporalmente el WDT durante la llamada HTTPS.
  //         La negociación TLS puede tomar > 15 s en redes lentas y el
  //         bloqueo ocurre DENTRO del stack mbedtls, antes de que el
  //         POST siquiera empiece, haciendo inútil un simple reset().
  esp_task_wdt_delete(NULL);
  int httpCode = http.POST(payload);
  esp_task_wdt_add(NULL);
  esp_task_wdt_reset();

  state.backendLastCode = httpCode;
  Serial.print("HTTP Code: "); Serial.println(httpCode);
  if (httpCode > 0) {
    String resp = http.getString();
    state.backendLastMsg  = resp.substring(0, 120);
    state.backendOnline   = httpCode >= 200 && httpCode < 300;
#ifdef DEBUG_SERIAL
    Serial.print("Respuesta backend: "); Serial.println(resp);
#endif
    if (state.backendOnline) {
      state.backendEnvios++;
      updateBackoff(true, s_backoffMs);
    } else if (shouldRetryHttpCode(httpCode)) {
      updateBackoff(false, s_backoffMs);
    }
  } else {
    state.backendOnline  = false;
    state.backendLastMsg  = http.errorToString(httpCode);
    Serial.print("Error HTTP: "); Serial.println(http.errorToString(httpCode));
    updateBackoff(false, s_backoffMs);
  }
  http.end();
}

// ===================== COMANDOS REMOTOS =====================
static void ejecutarComando(SystemState &state, const String &tipo, JsonObject commandPayload,
                            String &codigo, String &mensaje, String &payloadJson) {
  codigo = "OK"; payloadJson = "";
  if (tipo == "CERRAR_VALVULA") {
    state.valvulaAbierta = false;
    mensaje = "Valvula cerrada en simulacion";
  } else if (tipo == "ABRIR_VALVULA") {
    state.valvulaAbierta = true;
    mensaje = "Valvula abierta en simulacion";
  } else if (tipo == "SOLICITAR_ESTADO") {
    mensaje = "Estado reportado desde simulacion";
  } else if (tipo == "ACTUALIZAR_CONFIG") {
    const char* ssid     = commandPayload["wifiSsid"]     | "";
    const char* password = commandPayload["wifiPassword"] | "";
    String nuevoSsid    = String(ssid);     nuevoSsid.trim();
    String nuevaPassword= String(password);
    if (nuevoSsid.length() == 0 || nuevoSsid.length() > 64) {
      codigo = "ERROR"; mensaje = "wifiSsid invalido";
    } else if (nuevaPassword.length() > 64) {
      codigo = "ERROR"; mensaje = "wifiPassword invalido";
    } else {
      bool conectado = probarYCambiarWifi(nuevoSsid, nuevaPassword);
      if (conectado) {
        mensaje = "WiFi actualizado y conectado";
        payloadJson = "\"payload\":{\"wifiSsid\":\"" + escapeJson(wifiSSID) + "\",\"ipAddress\":\"" + WiFi.localIP().toString() + "\",\"applied\":true}";
      } else {
        codigo = "ERROR";
        mensaje = "No se pudo conectar a la nueva red. Se reiniciara el portal WiFi";
        payloadJson = "\"payload\":{\"wifiSsid\":\"" + escapeJson(nuevoSsid) + "\",\"applied\":false,\"openPortal\":true}";
      }
    }
  } else if (tipo == "ESCANEAR_WIFI") {
    mensaje = "Escaneo WiFi completado";
    payloadJson = construirPayloadEscaneoWifi();
  } else if (tipo == "REINICIAR") {
    mensaje = "Reinicio programado en simulacion";
  } else if (tipo == "OTRO") {
    mensaje = "Comando OTRO recibido por simulacion";
  } else {
    codigo = "ERROR"; mensaje = "Tipo de comando no soportado por simulacion";
  }
}

static bool responderComandoBackend(SystemState &state, unsigned long commandId,
                                    const String &codigo, const String &mensaje,
                                    const String &payloadJson) {
  if (!asegurarWiFi()) return false;
  WiFiClient client;
  WiFiClientSecure secureClient;
  HTTPClient http;
  String url = backendCommandResponseUrl(commandId);
  if (!beginBackendHttp(http, client, secureClient, url, state)) {
    Serial.println("No se pudo iniciar HTTP para responder comando.");
    return false;
  }
  String payload = "{";
  bool needsComma = false;
  auto appendField = [&](const String &fragment) {
    if (needsComma) payload += ",";
    payload += fragment;
    needsComma = true;
  };
  if (DEVICE_ID > 0) appendField("\"deviceId\":" + String(DEVICE_ID));
  appendField("\"deviceName\":\""    + escapeJson(String(DEVICE_NAME)) + "\"");
  if (String(DEVICE_HARDWARE_UID).length() > 0)
    appendField("\"hardwareUid\":\"" + escapeJson(String(DEVICE_HARDWARE_UID)) + "\"");
  appendField("\"deviceKey\":\""     + escapeJson(ingestApiKey) + "\"");
  appendField("\"codigoResultado\":\"" + escapeJson(codigo) + "\"");
  appendField("\"mensaje\":\""       + escapeJson(mensaje) + "\"");
  if (payloadJson.length() > 0) {
    appendField(payloadJson);
  } else {
    String rp = "\"payload\":{";
    rp += "\"state\":\""      + String(estadoTexto(state.estadoSistema)) + "\"";
    rp += ",\"risk\":"        + String(state.nivelRiesgo);
    rp += ",\"valvula\":\""   + String(state.valvulaAbierta ? "ABIERTA" : "CERRADA") + "\"";
    rp += ",\"backendEnvios\":" + String(state.backendEnvios);
    rp += "}";
    appendField(rp);
  }
  payload += "}";
  String signature = calcularHMAC(payload, HMAC_SECRET_KEY);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-key", ingestApiKey);
  http.addHeader("x-signature", signature);

  // FIX #7: deshabilitar WDT durante POST de respuesta de comando
  esp_task_wdt_delete(NULL);
  int httpCode = http.POST(payload);
  esp_task_wdt_add(NULL);
  esp_task_wdt_reset();

  Serial.print("Respuesta comando #"); Serial.print(commandId);
  Serial.print(" HTTP Code: ");        Serial.println(httpCode);
  if (httpCode > 0) {
#ifdef DEBUG_SERIAL
    Serial.println(http.getString());
#endif
  } else {
    Serial.print("Error respondiendo comando: "); Serial.println(http.errorToString(httpCode));
  }
  http.end();
  return httpCode >= 200 && httpCode < 300;
}

void consultarComandosBackend(SystemState &state) {
  if (!asegurarWiFi()) return;
  if (s_commandBackoffMs > 0) {
    unsigned long now = millis();
    if (now - state.lastCommandBackoffAttempt < s_commandBackoffMs) {
#ifdef DEBUG_SERIAL
      Serial.print("Backoff comandos activo: esperando "); Serial.print(s_commandBackoffMs); Serial.println(" ms.");
#endif
      return;
    }
    state.lastCommandBackoffAttempt = now;
  }

  WiFiClient client;
  WiFiClientSecure secureClient;
  HTTPClient http;
  String url = backendPendingCommandsUrl();
  if (!beginBackendHttp(http, client, secureClient, url, state)) {
    Serial.println("No se pudo iniciar HTTP para consultar comandos.");
    updateBackoff(false, s_commandBackoffMs);
    return;
  }
  http.addHeader("x-device-key", ingestApiKey);

  // FIX #7: deshabilitar WDT durante GET HTTPS (mismo motivo que POST)
  esp_task_wdt_delete(NULL);
  int httpCode = http.GET();
  esp_task_wdt_add(NULL);
  esp_task_wdt_reset();

  Serial.print("Consulta comandos HTTP Code: "); Serial.println(httpCode);
  if (httpCode < 200 || httpCode >= 300) {
    if (httpCode > 0) {
#ifdef DEBUG_SERIAL
      Serial.println(http.getString());
#endif
    } else {
      Serial.print("Error consultando comandos: "); Serial.println(http.errorToString(httpCode));
    }
    http.end();
    updateBackoff(false, s_commandBackoffMs);
    return;
  }

  String response = http.getString();
  http.end();
  updateBackoff(true, s_commandBackoffMs);

  StaticJsonDocument<4096> doc;
  DeserializationError error = deserializeJson(doc, response);
  if (error) {
    Serial.print("JSON comandos invalido: "); Serial.println(error.c_str()); return;
  }
  JsonArray comandos = doc["comandos"].as<JsonArray>();
  if (comandos.isNull() || comandos.size() == 0) {
#ifdef DEBUG_SERIAL
    Serial.println("Sin comandos remotos pendientes.");
#endif
    return;
  }
  for (JsonObject comando : comandos) {
    unsigned long commandId = comando["id"].as<unsigned long>();
    String tipo = comando["tipo"].as<String>();
    if (commandId == 0 || tipo.length() == 0) continue;
    String codigo, mensaje, payloadJson;
    JsonObject commandPayload = comando["payload"].as<JsonObject>();
    ejecutarComando(state, tipo, commandPayload, codigo, mensaje, payloadJson);
    state.comandosBackend++;
    state.ultimoComandoBackend = tipo;
    Serial.print("Comando remoto #"); Serial.print(commandId);
    Serial.print(": "); Serial.print(tipo); Serial.print(" -> "); Serial.println(mensaje);
    bool responded = responderComandoBackend(state, commandId, codigo, mensaje, payloadJson);
    if (tipo == "ACTUALIZAR_CONFIG" && codigo == "ERROR" && payloadJson.indexOf("\"openPortal\":true") >= 0) {
      delay(1000);
      borrarCredencialesWifiYReiniciar();
    }
    if (responded && tipo == "REINICIAR" && codigo == "OK") {
      Serial.println("Reiniciando ESP32 por comando remoto...");
      delay(500);
      ESP.restart();
    }
  }
}

// ===================== SENSORES =====================
static int leerAdcPromediado(int pin, int muestras, unsigned int pausaUs) {
  long suma = 0;
  for (int i = 0; i < muestras; i++) { suma += analogRead(pin); delayMicroseconds(pausaUs); }
  return (int)(suma / muestras);
}

static float calcularPresionVirtualPF338(float flujoLmin, bool valvulaAbierta) {
  float ondulacion = sin(millis() / 900.0f) * 0.8f;

  if (!valvulaAbierta) {
    return 0.0f;
  }

  if (flujoLmin <= 0.15f) {
    return PF338_PRESION_VIRTUAL_REPOSO_KPA + ondulacion;
  }

  float presion;
  if (flujoLmin < PF338_FLUJO_REAL_MIN_LMIN) {
    presion = PF338_PRESION_VIRTUAL_REPOSO_KPA;
  } else if (flujoLmin <= PF338_FUGA_FLUJO_BAJO_LMIN) {
    float ratio = limitarFloat(
      (flujoLmin - PF338_FLUJO_REAL_MIN_LMIN) /
      (PF338_FUGA_FLUJO_BAJO_LMIN - PF338_FLUJO_REAL_MIN_LMIN),
      0.0f,
      1.0f
    );
    presion = PF338_PRESION_VIRTUAL_ALERTA_KPA -
              ratio * (PF338_PRESION_VIRTUAL_ALERTA_KPA - PF338_PRESION_VIRTUAL_FUGA_KPA);
  } else if (flujoLmin < PF338_FLUJO_NORMAL_MIN_LMIN) {
    float ratio = limitarFloat(
      (flujoLmin - PF338_FUGA_FLUJO_BAJO_LMIN) /
      (PF338_FLUJO_NORMAL_MIN_LMIN - PF338_FUGA_FLUJO_BAJO_LMIN),
      0.0f,
      1.0f
    );
    presion = PF338_PRESION_VIRTUAL_ALERTA_KPA +
              ratio * (PF338_PRESION_VIRTUAL_NORMAL_ALTA_KPA - PF338_PRESION_VIRTUAL_ALERTA_KPA);
  } else {
    float ratio = limitarFloat((flujoLmin - PF338_FLUJO_NORMAL_MIN_LMIN) / 1.5f, 0.0f, 1.0f);
    presion = PF338_PRESION_VIRTUAL_NORMAL_ALTA_KPA -
              ratio * (PF338_PRESION_VIRTUAL_NORMAL_ALTA_KPA - PF338_PRESION_VIRTUAL_NORMAL_BAJA_KPA);
  }

  return limitarFloat(presion + ondulacion, PF338_PRESION_VIRTUAL_FUGA_KPA, PF338_PRESION_VIRTUAL_REPOSO_KPA + 2.0f);
}

void initSensores(SystemState &state) {
  pinMode(pressurePin, INPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(pressurePin, ADC_11db);
  state.sensorOK = true;
  Serial.println("Transductor 100 PSI OK");
}

void readSensores(SystemState &state, unsigned long sampleIntervalMs) {
  noInterrupts();
  uint32_t pulses = state.pulseCount;
  state.pulseCount = 0;
  interrupts();

  // FIX #3: gestión correcta de flujoRealDetectado con contador de estabilidad.
  //         Un solo pulso espurio ya no lo deja en true permanentemente.
  if (pulses > 0) {
    state.flujoRealDetectado    = true;
    state.sinPulsosConsecutivos = 0;
  } else {
    state.sinPulsosConsecutivos++;
    if (state.sinPulsosConsecutivos >= 5) {
      state.flujoRealDetectado    = false;
      state.sinPulsosConsecutivos = 5; // clamp, no overflow
    }
  }

  float sampleSeconds = sampleIntervalMs / 1000.0f;
  if (sampleSeconds <= 0.0f) sampleSeconds = 1.0f;

  float frequencyHz    = pulses / sampleSeconds;
  float flujoPorPulsos = frequencyHz / 7.5;
  float nuevoFlujo     = flujoPorPulsos;

  int   rawPressure    = leerAdcPromediado(pressurePin, 20, 200);
  float adcVoltage     = (rawPressure / 4095.0f) * 3.3f;
  float sensorVoltage  = adcVoltage * PRESSURE_DIVIDER_FACTOR;
  int   pressurePercent= (int)((rawPressure * 100L) / 4095L);
  float pressureRatio  = (sensorVoltage - PRESSURE_SENSOR_MIN_V) /
                         (PRESSURE_SENSOR_MAX_V - PRESSURE_SENSOR_MIN_V);
  float pressurePsi    = limitarFloat(pressureRatio, 0.0f, 1.0f) * PRESSURE_SENSOR_MAX_PSI;
  if (pressurePsi < PRESSURE_DEAD_ZONE_PSI) pressurePsi = 0.0f;
  float nuevaPresion   = pressurePsi * 6.89476f;
  bool presionDisponible = nuevaPresion > 1.0f;
  bool flujoRealPF338 = flujoPorPulsos >= PF338_FLUJO_REAL_MIN_LMIN ||
                        state.flujoRealDetectado;
  float presionVirtualPF338 = calcularPresionVirtualPF338(
    nuevoFlujo,
    state.valvulaAbierta
  );

  float flujoEstimadoDemo = 0.0f;
  if (DEMO_ESTIMAR_FLUJO_SIN_PULSOS &&
      pulses == 0 &&
      state.valvulaAbierta &&
      nuevaPresion >= DEMO_PRESION_MIN_FLUJO_ESTIMADO_KPA) {
    float ratioPresion = limitarFloat(
      (nuevaPresion - DEMO_PRESION_MIN_FLUJO_ESTIMADO_KPA) /
      (DEMO_PRESION_MAX_FLUJO_ESTIMADO_KPA - DEMO_PRESION_MIN_FLUJO_ESTIMADO_KPA),
      0.0f, 1.0f
    );
    flujoEstimadoDemo = DEMO_FLUJO_ESTIMADO_MIN_LMIN +
                        ratioPresion * (DEMO_FLUJO_ESTIMADO_MAX_LMIN - DEMO_FLUJO_ESTIMADO_MIN_LMIN);
    nuevoFlujo = max(nuevoFlujo, flujoEstimadoDemo);
  }

  state.sensorOK = sensorVoltage >= (PRESSURE_SENSOR_MIN_V - 0.05f) &&
                   sensorVoltage <= (PRESSURE_SENSOR_MAX_V + 0.05f);

  if (PF338_SIMULAR_PRESION_EN_DEMO && !presionDisponible) {
    // Para la presentacion con PF338, la presion se simula si el transductor
    // esta en cero. Asi el sistema puede mostrar reposo presurizado, flujo
    // normal y caida de presion por fuga sin depender del sensor fisico.
    nuevaPresion = presionVirtualPF338;
    state.sensorOK = true;
  } else if (PF338_PRESION_OPCIONAL_EN_DEMO && flujoRealPF338 && !presionDisponible) {
    // Respaldo: si hay flujo real, nunca bloqueamos la demo solo por P=0.
    nuevaPresion = PF338_PRESION_VIRTUAL_NORMAL_BAJA_KPA;
    state.sensorOK = true;
  }

  nuevoFlujo   = limitarFloat(nuevoFlujo,   0.0f,  15.0f);
  nuevaPresion = limitarFloat(nuevaPresion, 0.0f, 690.0f);

  if (state.primeraLectura) {
    state.flujoLmin  = nuevoFlujo;
    state.presionKPa = nuevaPresion;
    state.primeraLectura = false;
  } else {
    float deltaFlujo   = nuevoFlujo   - state.flujoLmin;
    float deltaPresion = nuevaPresion - state.presionKPa;
    float pesoNuevoFlujo   = 0.95f;
    float pesoNuevoPresion = 0.95f;
    if (abs(deltaPresion) >= 20.0f) pesoNuevoPresion = 1.0f;
    if (abs(deltaFlujo)   >=  0.5f) pesoNuevoFlujo   = 1.0f;
    state.flujoLmin  = state.flujoLmin  * (1.0f - pesoNuevoFlujo)   + nuevoFlujo   * pesoNuevoFlujo;
    state.presionKPa = state.presionKPa * (1.0f - pesoNuevoPresion) + nuevaPresion * pesoNuevoPresion;
  }

#ifdef DEBUG_SERIAL
  Serial.println("----- LECTURA -----");
  Serial.print("Pulsos: ");                    Serial.println(pulses);
  Serial.print("Flujo pulsos (L/min): ");      Serial.println(flujoPorPulsos, 2);
  Serial.print("Flujo estimado demo (L/min): ");Serial.println(flujoEstimadoDemo, 2);
  Serial.print("ADC presion: ");               Serial.println(rawPressure);
  Serial.print("Pot presion (%): ");           Serial.println(pressurePercent);
  Serial.print("V transductor: ");             Serial.println(sensorVoltage, 2);
  Serial.print("Presion (PSI): ");             Serial.println(pressurePsi, 2);
  Serial.print("Presion real disponible: ");   Serial.println(presionDisponible ? "SI" : "NO");
  Serial.print("Presion virtual PF338 (kPa): "); Serial.println(presionVirtualPF338, 2);
  Serial.print("Modo PF338 simula presion: "); Serial.println(PF338_SIMULAR_PRESION_EN_DEMO ? "SI" : "NO");
  Serial.print("PF338 rangos bajo/normal: <=");
  Serial.print(PF338_FUGA_FLUJO_BAJO_LMIN, 2);
  Serial.print(" fuga, ");
  Serial.print(PF338_FUGA_FLUJO_BAJO_LMIN, 2);
  Serial.print("-");
  Serial.print(PF338_FLUJO_NORMAL_MIN_LMIN, 2);
  Serial.print(" alerta, >=");
  Serial.print(PF338_FLUJO_NORMAL_MIN_LMIN, 2);
  Serial.println(" normal");
  Serial.print("PF338 fuga tras alerta (s): ");
  Serial.println(PF338_ALERTA_A_FUGA_MS / 1000);
  Serial.print("Flujo real detectado: ");      Serial.println(state.flujoRealDetectado ? "SI" : "NO");
  Serial.print("Flujo (L/min): ");             Serial.println(state.flujoLmin, 2);
  Serial.print("Presion (kPa): ");             Serial.println(state.presionKPa, 2);
  Serial.print("Sensor OK: ");                 Serial.println(state.sensorOK ? "SI" : "NO");
#endif
}

// ===================== BUZZER =====================
// NORMAL  → silencio total
// ALERTA  → pitido intermitente suave 800 Hz
// FUGA    → tono agresivo continuo 2500 Hz
// ERROR   → tono medio continuo 650 Hz
static void apagarBuzzer() { ledcWrite(buzzerPin, 0); }

static void encenderBuzzerAlerta() {
  ledcChangeFrequency(buzzerPin, 800, 8);
  ledcWrite(buzzerPin, 36);
}
static void encenderBuzzerFuga() {
  ledcChangeFrequency(buzzerPin, 2500, 8);
  ledcWrite(buzzerPin, 200);
}
static void encenderBuzzerError() {
  ledcChangeFrequency(buzzerPin, 650, 8);
  ledcWrite(buzzerPin, 90);
}

// ===================== ACTUADORES =====================
void initActuadores() {
  pinMode(flowPin,    INPUT);
  pinMode(buttonPin,  INPUT_PULLUP);
  pinMode(ledAzul,    OUTPUT);
  pinMode(ledVerde,   OUTPUT);
  pinMode(ledNaranja, OUTPUT);
  pinMode(ledRojo,    OUTPUT);
  pinMode(relayPin,   OUTPUT);
  // valveIndicatorPin == ledAzul, ya configurado arriba

  digitalWrite(ledAzul,    LOW);
  digitalWrite(ledVerde,   LOW);
  digitalWrite(ledNaranja, LOW);
  digitalWrite(ledRojo,    LOW);
  digitalWrite(relayPin,   LOW);

  const int buzzerFreq       = 1000;
  const int buzzerResolution = 8;
  if (!ledcAttach(buzzerPin, buzzerFreq, buzzerResolution)) {
    Serial.println("Error al configurar buzzer");
  } else {
    Serial.println("Buzzer OK");
  }
  ledcWrite(buzzerPin, 0);
}

static void leerPulsadorValvula(SystemState &state) {
  static bool lastReading      = HIGH;
  static bool stableButtonState= HIGH;
  static unsigned long lastDebounce = 0;
  bool reading = digitalRead(buttonPin);
  if (reading != lastReading) { lastDebounce = millis(); lastReading = reading; }
  if (millis() - lastDebounce > 60 && reading != stableButtonState) {
    stableButtonState = reading;
    if (stableButtonState == LOW) {
      state.valvulaAbierta = !state.valvulaAbierta;
      Serial.print("Pulsador: valvula ");
      Serial.println(state.valvulaAbierta ? "ABIERTA" : "CERRADA");
    }
  }
}

void actualizarActuadores(SystemState &state, unsigned long &lastBlink) {
  leerPulsadorValvula(state);

  if (state.estadoSistema == ESTADO_FUGA) {
    state.valvulaAbierta = false;
  }

  digitalWrite(relayPin,          state.valvulaAbierta ? HIGH : LOW);
  digitalWrite(valveIndicatorPin, state.valvulaAbierta ? HIGH : LOW);

  switch (state.estadoSistema) {

    case ESTADO_NORMAL:
      // Silencio total + LED verde fijo
      apagarBuzzer();
      digitalWrite(ledVerde,   HIGH);
      digitalWrite(ledNaranja, LOW);
      digitalWrite(ledRojo,    LOW);
      break;

    case ESTADO_ALERTA:
      // Pitido intermitente 800 Hz + LED naranja parpadeante
      if (millis() - lastBlink >= 300) {
        lastBlink = millis();
        state.ledBlinkState = !state.ledBlinkState;
        digitalWrite(ledNaranja, state.ledBlinkState);
        if (state.ledBlinkState) encenderBuzzerAlerta();
        else                     apagarBuzzer();
      }
      digitalWrite(ledVerde, LOW);
      digitalWrite(ledRojo,  LOW);
      break;

    case ESTADO_FUGA:
      // Tono agresivo continuo 2500 Hz + LED rojo fijo
      encenderBuzzerFuga();
      digitalWrite(ledVerde,   LOW);
      digitalWrite(ledNaranja, LOW);
      digitalWrite(ledRojo,    HIGH);
      break;

    case ESTADO_ERROR:
      // Tono medio continuo 650 Hz, sin LEDs de color
      encenderBuzzerError();
      digitalWrite(ledVerde,   LOW);
      digitalWrite(ledNaranja, LOW);
      digitalWrite(ledRojo,    LOW);
      break;
  }
}

// ===================== OLED =====================
void initDisplay(Adafruit_SSD1306 &display, const SystemState &state) {
  Wire.begin(21, 22);
  Wire.setClock(100000);
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("OLED no encontrado"); return;
  }
  display.ssd1306_command(SSD1306_DISPLAYOFF);
  display.ssd1306_command(SSD1306_SETDISPLAYOFFSET); display.ssd1306_command(0x00);
  display.ssd1306_command(SSD1306_SETSTARTLINE | 0x00);
  display.ssd1306_command(SSD1306_SEGREMAP | 0x01);
  display.ssd1306_command(SSD1306_COMSCANDEC);
  display.ssd1306_command(SSD1306_DISPLAYON);
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(8, 18); display.print("Iniciando...");
  display.setCursor(8, 34); display.print("Sistema IoT");
  if (!state.sensorOK) { display.setCursor(8, 50); display.print("Verificar presion"); }
  display.display();
  Serial.println("OLED OK");
}

static void oledRoundRect(Adafruit_SSD1306 &d, int x, int y, int w, int h) {
  d.drawRoundRect(x, y, w, h, 2, SSD1306_WHITE);
}

static void oledRoundRectFill(Adafruit_SSD1306 &d, int x, int y, int w, int h) {
  d.fillRoundRect(x, y, w, h, 2, SSD1306_WHITE);
}

static void oledDrawStatePill(Adafruit_SSD1306 &d, EstadoSistema estado, bool blinkOn) {
  const int PW = 50, PH = 9, PX = 77, PY = 1;
  bool filled = estado == ESTADO_FUGA || (estado == ESTADO_ALERTA && blinkOn);

  if (filled) {
    oledRoundRectFill(d, PX, PY, PW, PH);
    d.setTextColor(SSD1306_BLACK);
  } else {
    oledRoundRect(d, PX, PY, PW, PH);
    d.setTextColor(SSD1306_WHITE);
  }

  if (estado == ESTADO_FUGA) {
    d.setCursor(PX + 4, PY + 1); d.print("!! FUGA");
  } else if (estado == ESTADO_ALERTA) {
    d.setCursor(PX + 3, PY + 1); d.print("! ALERTA");
  } else if (estado == ESTADO_ERROR) {
    d.setCursor(PX + 8, PY + 1); d.print("ERROR");
  } else {
    d.setCursor(PX + 5, PY + 1); d.print("NORMAL");
  }
  d.setTextColor(SSD1306_WHITE);
}

static void oledProgressBar(Adafruit_SSD1306 &d, int x, int y, int w, int h, int pct) {
  pct = constrain(pct, 0, 100);
  d.drawRect(x, y, w, h, SSD1306_WHITE);
  int fill = (int)((w - 2) * pct / 100.0f);
  if (fill > 0) d.fillRect(x + 1, y + 1, fill, h - 2, SSD1306_WHITE);
}

static void oledSparkline(Adafruit_SSD1306 &d, int x, int y, int w, int h,
                          const float *buf, int len, int start, float vMin, float vMax) {
  if (len < 2 || vMax <= vMin) return;
  float range = vMax - vMin;
  int prevX = x;
  int prevY = y + h - 1;

  for (int i = 0; i < len; i++) {
    int idx = (start + i) % len;
    float v = buf[idx];
    int px = x + (int)(i * (w - 1) / (float)(len - 1));
    int py = y + h - 1 - (int)(((v - vMin) / range) * (h - 1));
    py = constrain(py, y, y + h - 1);
    if (i > 0) d.drawLine(prevX, prevY, px, py, SSD1306_WHITE);
    prevX = px;
    prevY = py;
  }
}

static void oledDrawLeakWave(Adafruit_SSD1306 &d, int frame, bool intense) {
  int yBase = intense ? 61 : 62;
  for (int x = 0; x < 128; x += 4) {
    int phase = (x + frame * 3) % 16;
    int y = yBase - (phase < 8 ? phase / 4 : (15 - phase) / 4);
    d.drawPixel(x, y, SSD1306_WHITE);
    d.drawPixel(x + 1, y, SSD1306_WHITE);
  }
}

static float sparkBuf[16] = {};
static int sparkIdx = 0;
static bool sparkFull = false;

void actualizarOLED(Adafruit_SSD1306 &display, const SystemState &state, unsigned long &lastDisplayUpdate) {
  static int  ultimoEstado       = -1;
  static int  ultimoRiesgo       = -1;
  static int  ultimoFlujo10      = -1;
  static int  ultimaPresion      = -1;
  static bool ultimoSensorOK     = true;
  static bool ultimoBackendOnline= false;
  static bool ultimaValvula      = false;
  static int  animFrame          = 0;

  unsigned long now = millis();
  bool animando = state.estadoSistema == ESTADO_ALERTA || state.estadoSistema == ESTADO_FUGA;
  int flujo10 = (int)(state.flujoLmin * 10.0f);
  int presion = (int)(state.presionKPa + 0.5f);

  bool changed =
    (int)state.estadoSistema != ultimoEstado ||
    state.nivelRiesgo        != ultimoRiesgo ||
    flujo10                  != ultimoFlujo10 ||
    presion                  != ultimaPresion ||
    state.sensorOK           != ultimoSensorOK ||
    state.backendOnline      != ultimoBackendOnline ||
    state.valvulaAbierta     != ultimaValvula;

  unsigned long frameMs = animando ? 160 : 500;
  if (!changed && now - lastDisplayUpdate < frameMs) return;

  if (changed || now - lastDisplayUpdate >= 500) {
    sparkBuf[sparkIdx] = state.flujoLmin;
    sparkIdx = (sparkIdx + 1) % 16;
    if (sparkIdx == 0) sparkFull = true;
  }
  animFrame++;

  ultimoEstado        = (int)state.estadoSistema;
  ultimoRiesgo        = state.nivelRiesgo;
  ultimoFlujo10       = flujo10;
  ultimaPresion       = presion;
  ultimoSensorOK      = state.sensorOK;
  ultimoBackendOnline = state.backendOnline;
  ultimaValvula       = state.valvulaAbierta;
  lastDisplayUpdate   = now;

  int sparkLen = sparkFull ? 16 : sparkIdx;
  float sMin = 0.0f;
  float sMax = 1.0f;
  if (sparkLen > 0) {
    sMin = sparkBuf[0];
    sMax = sparkBuf[0];
    for (int i = 1; i < sparkLen; i++) {
      if (sparkBuf[i] < sMin) sMin = sparkBuf[i];
      if (sparkBuf[i] > sMax) sMax = sparkBuf[i];
    }
    if (sMax - sMin < 0.5f) { sMin -= 0.25f; sMax += 0.25f; }
  }

  bool blinkOn = (animFrame % 4) < 2;
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  display.setCursor(1, 1);
  display.print("ESP32-FISICO");
  oledDrawStatePill(display, state.estadoSistema, blinkOn);
  display.drawFastHLine(0, 11, 128, SSD1306_WHITE);

  display.setCursor(1, 14);
  display.print("Q");
  display.setTextSize(2);
  display.setCursor(13, 13);
  display.print(state.flujoLmin, 1);
  display.setTextSize(1);
  display.setCursor(49, 21);
  display.print("L/m");

  display.setCursor(1, 35);
  display.print("P");
  display.setTextSize(2);
  display.setCursor(13, 34);
  display.print((int)state.presionKPa);
  display.setTextSize(1);
  display.setCursor(49, 42);
  display.print("kPa");

  display.drawFastVLine(66, 11, 48, SSD1306_WHITE);
  display.setCursor(69, 14);
  display.print("RIESGO ");
  display.print(state.nivelRiesgo);
  display.print("%");
  oledProgressBar(display, 69, 23, 56, 5, state.nivelRiesgo);

  display.setCursor(69, 31);
  display.print("Q hist.");
  if (sparkLen >= 2) {
    int start = sparkFull ? sparkIdx : 0;
    oledSparkline(display, 69, 39, 56, 12, sparkBuf, sparkLen, start, sMin, sMax);
  }

  display.setCursor(1, 55);
  if (state.estadoSistema == ESTADO_ALERTA && state.alertaPersistenteActiva) {
    unsigned long transcurrido = now - state.alertaInicioMs;
    int restante = (int)((PF338_SIMULAR_PRESION_EN_DEMO ? PF338_ALERTA_A_FUGA_MS : ALERTA_A_FUGA_TIMEOUT_MS) - transcurrido) / 1000 + 1;
    if (restante < 0) restante = 0;
    display.print("FUGA EN ");
    display.print(restante);
    display.print("s");
  } else if (state.estadoSistema == ESTADO_FUGA) {
    if (blinkOn) display.print("VALVULA CERRADA");
    else         display.print("FUGA DETECTADA");
  } else {
    display.print(state.sensorOK ? "SNS:OK " : "SNS:ERR ");
    display.print(state.valvulaAbierta ? "VLV:AB " : "VLV:CE ");
    display.print(state.backendOnline ? "WF:OK" : "WF:--");
  }

  if (animando) {
    oledDrawLeakWave(display, animFrame, state.estadoSistema == ESTADO_FUGA);
  }

  display.display();
}

// ===================== COMANDOS SERIALES =====================
static String pendingCommand    = "";
static bool forcedStateEnabled  = false;
static EstadoSistema forcedStateValue = ESTADO_NORMAL;

static bool parseForcedState(const String &rawState, EstadoSistema &outState) {
  if (rawState == "NORMAL") { outState = ESTADO_NORMAL; return true; }
  if (rawState == "ALERTA") { outState = ESTADO_ALERTA; return true; }
  if (rawState == "FUGA")   { outState = ESTADO_FUGA;   return true; }
  if (rawState == "ERROR")  { outState = ESTADO_ERROR;  return true; }
  return false;
}

bool commandHasForcedState() { return forcedStateEnabled; }
EstadoSistema commandForcedState() { return forcedStateValue; }

void handleCommands(SystemState &state) {
  if (Serial.available()) {
    pendingCommand = Serial.readStringUntil('\n');
    pendingCommand.trim();
    pendingCommand.toUpperCase();
  }
  if (pendingCommand.length() == 0) return;

  if (pendingCommand == "PING") {
    Serial.println("CMD:PONG");
  } else if (pendingCommand == "STATUS") {
    Serial.print("CMD:STATUS "); Serial.print(estadoTexto(state.estadoSistema));
    Serial.print(" R=");  Serial.print(state.nivelRiesgo);
    Serial.print(" Q=");  Serial.print(state.flujoLmin, 2);
    Serial.print(" P=");  Serial.print(state.presionKPa, 2);
    Serial.print(" VALVULA="); Serial.print(state.valvulaAbierta ? "ABIERTA" : "CERRADA");
    Serial.print(" CMD="); Serial.println(state.ultimoComandoBackend);
  } else if (pendingCommand == "HELP") {
    Serial.println("CMD:HELP PING | STATUS | FORCE NORMAL|ALERTA|FUGA|ERROR|AUTO");
  } else if (pendingCommand.startsWith("FORCE ")) {
    String arg = pendingCommand.substring(6); arg.trim();
    if (arg == "AUTO") {
      forcedStateEnabled = false;
      state.valvulaAbierta = true;
      state.primeraLectura = true;
      state.contadorAlerta = 0;
      state.contadorCritico = 0;
      state.contadorRecuperacionFuga = 0;
      state.alertaPersistenteActiva = false;
      state.alertaInicioMs = 0;
      Serial.println("CMD:FORCE AUTO");
    } else {
      EstadoSistema parsedState = ESTADO_NORMAL;
      if (parseForcedState(arg, parsedState)) {
        forcedStateEnabled = true;
        forcedStateValue   = parsedState;
        Serial.print("CMD:FORCE "); Serial.println(estadoTexto(forcedStateValue));
      } else {
        Serial.println("CMD:UNKNOWN_FORCE");
      }
    }
  } else {
    Serial.println("CMD:UNKNOWN");
  }
  pendingCommand = "";
}

// ===================== DEBUG JSON =====================
#ifdef DEBUG_SERIAL
static void printJsonEstado(const SystemState &s) {
  Serial.print("{\"device\":\""); Serial.print(DEVICE_NAME);
  Serial.print("\",\"sensor_id\":"); Serial.print(SENSOR_ID);
  Serial.print(",\"flow_lmin\":"); Serial.print(s.flujoLmin, 2);
  Serial.print(",\"pressure_kpa\":"); Serial.print(s.presionKPa, 2);
  Serial.print(",\"risk\":"); Serial.print(s.nivelRiesgo);
  Serial.print(",\"state\":\""); Serial.print(estadoTexto(s.estadoSistema));
  Serial.print("\",\"sensor_ok\":"); Serial.print(s.sensorOK ? "true" : "false");
  Serial.print(",\"backend_online\":"); Serial.print(s.backendOnline ? "true" : "false");
  Serial.print(",\"valvula\":\""); Serial.print(s.valvulaAbierta ? "ABIERTA" : "CERRADA");
  Serial.print("\",\"remote_commands\":"); Serial.print(s.comandosBackend);
  Serial.println("}");
}
#else
static void printJsonEstado(const SystemState &s) {}
#endif

// ===================== ISR / SETUP / LOOP =====================
void IRAM_ATTR onPulse() { state.pulseCount++; }

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println();
  Serial.println("Iniciando sistema...");
  Serial.println("RFC2217 configurado en puerto 4001");

  Preferences pref;
  pref.begin("creds", true);
  wifiSSID     = pref.getString("ssid", DEFAULT_SSID);
  wifiPass     = pref.getString("pass", DEFAULT_PASSWORD);
  ingestApiKey = DEFAULT_INGEST_API_KEY;
  pref.end();
#ifdef DEBUG_SERIAL
  Serial.println("Credenciales cargadas desde NVS o defaults.");
#endif

  initActuadores();
  initSensores(state);
  initDisplay(oled, state);

  attachInterrupt(digitalPinToInterrupt(flowPin), onPulse, FALLING);
  Serial.println("Interrupcion OK");

  // FIX #6: el bootloader ya inicializa TWDT; usar reconfigure() para
  //         cambiar el timeout sin error "already initialized".
  //         idle_core_mask=0 evita que los cores IDLE disparen el WDT;
  //         solo la loopTask queda vigilada.
  //         Se llama ANTES de initWiFi para que los resets dentro de
  //         conectarWifiGuardado() sean válidos (task ya suscrita).
  {
    const esp_task_wdt_config_t wdtConfig = {
      .timeout_ms     = 30000,  // 30 s: cubre TLS + latencias de red
      .idle_core_mask = 0,      // no vigilar IDLE tasks
      .trigger_panic  = true
    };
    esp_task_wdt_reconfigure(&wdtConfig);
    esp_task_wdt_add(NULL);
  }

  initWiFi();

  lastMeasure     = millis();
  lastSend        = millis();
  lastCommandPoll = millis();
  lastBlink       = millis();

  Serial.println("Sistema listo");
  Serial.println("Comandos seriales: HELP, PING, STATUS, FORCE NORMAL|ALERTA|FUGA|ERROR|AUTO");
}

void loop() {
  unsigned long now = millis();
  esp_task_wdt_reset(); // FIX #2: reset al inicio de cada ciclo

  handleCommands(state);

  if (now - lastMeasure >= SENSOR_READ_INTERVAL_MS) {
    unsigned long sampleIntervalMs = now - lastMeasure;
    readSensores(state, sampleIntervalMs);

    // FIX #1: evaluarEstado ahora recibe el struct completo
    state.estadoSistema = evaluarEstado(state);

    if (commandHasForcedState()) {
      state.estadoSistema           = commandForcedState();
      state.alertaPersistenteActiva = false;
      state.alertaInicioMs          = 0;
      if (state.estadoSistema == ESTADO_FUGA) {
        state.valvulaAbierta = false;
        state.flujoLmin = 0.0f;
        state.presionKPa = 0.0f;
        state.nivelRiesgo = 100;
      } else {
        state.valvulaAbierta = true;
      }
    } else {
      aplicarFugaPorAlertaPersistente(state, now);
    }

    actualizarOLED(oled, state, lastLCDUpdate);

#ifdef DEBUG_SERIAL
    Serial.print("Estado: ");        Serial.println(estadoTexto(state.estadoSistema));
    Serial.print("Nivel riesgo: ");  Serial.println(state.nivelRiesgo);
    Serial.print("Cnt alerta: ");    Serial.println(state.contadorAlerta);
    Serial.print("Cnt critico: ");   Serial.println(state.contadorCritico);
    printJsonEstado(state);
    Serial.println();
#endif

    lastMeasure = now;
  }

  actualizarActuadores(state, lastBlink);

  if (now - lastSend >= BACKEND_SEND_INTERVAL_MS) {
    enviarBackend(state);
    lastSend = now;
  }

  if (now - lastCommandPoll >= BACKEND_COMMAND_POLL_INTERVAL_MS) {
    consultarComandosBackend(state);
    lastCommandPoll = now;
  }
}

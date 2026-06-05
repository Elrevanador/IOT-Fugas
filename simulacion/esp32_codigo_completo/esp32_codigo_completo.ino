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
#include <mbedtls/md.h>            // para HMAC
#include <esp_task_wdt.h>          // watchdog

// ===================== CONFIGURACION =====================
// En producción, las credenciales deben cargarse desde NVS (Preferences).
// Para pruebas en Wokwi se pueden usar valores por defecto.

// ----------- Modo depuración -----------
// Comentar esta línea para producción (oculta datos sensibles en Serial)
#define DEBUG_SERIAL

// ===================== CLAVES DE SEGURIDAD =====================
// Clave secreta para firmar los payloads enviados al backend (HMAC-SHA256)
// DEBE ser la misma que el backend utiliza para verificar.
const char* HMAC_SECRET_KEY = "c0ntraclave-hmac-muy-segura-2024!";

// ===================== TLS =====================
// Para producción, debes:
//   1) Definir BACKEND_ROOT_CA_PEM con el certificado raíz de tu servidor.
//   2) Cambiar BACKEND_ALLOW_INSECURE_TLS a 0.
// Para desarrollo/Wokwi, puedes dejar ambos con sus valores por defecto.
#ifndef BACKEND_ROOT_CA_PEM
#define BACKEND_ROOT_CA_PEM ""
#endif

#ifndef BACKEND_ALLOW_INSECURE_TLS
#define BACKEND_ALLOW_INSECURE_TLS 1   // 1 = permite TLS sin verificar (solo desarrollo)
#endif

// ===================== PARÁMETROS POR DEFECTO (si no hay NVS) =====================
#ifndef WIFI_SSID_VALUE
#define WIFI_SSID_VALUE "MONTOYA_MA2.4G"
#endif

#ifndef WIFI_PASSWORD_VALUE
#define WIFI_PASSWORD_VALUE "CAMBIA_ESTA_CLAVE_WIFI"
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

const char* DEFAULT_SSID     = WIFI_SSID_VALUE;
const char* DEFAULT_PASSWORD = WIFI_PASSWORD_VALUE;
const char* DEFAULT_INGEST_API_KEY = INGEST_API_KEY_VALUE;
const char* DEVICE_NAME      = DEVICE_NAME_VALUE;
const char* DEVICE_TYPE      = DEVICE_TYPE_VALUE;
const char* DEVICE_FIRMWARE_VERSION = DEVICE_FIRMWARE_VERSION_VALUE;
const char* DEVICE_HARDWARE_UID = DEVICE_HARDWARE_UID_VALUE;

enum BackendMode {
  BACKEND_LOCAL = 0,
  BACKEND_PUBLIC = 1
};

const BackendMode BACKEND_MODE = BACKEND_PUBLIC;
const char* BACKEND_BASE_URL_LOCAL  = "http://host.wokwi.internal:3000";
const char* BACKEND_BASE_URL_PUBLIC = "https://sistemas-de-deteccion-de-fugas.up.railway.app";

const int DEVICE_ID = 0;
const int HOUSE_ID = 0;
const int SENSOR_ID = 0;

const int SCREEN_WIDTH = 128;
const int SCREEN_HEIGHT = 64;
const int OLED_ADDR = 0x3C;
const int OLED_RESET = -1;

const unsigned long SENSOR_READ_INTERVAL_MS = 500;
const unsigned long BACKEND_SEND_INTERVAL_MS = 2000;
const unsigned long BACKEND_COMMAND_POLL_INTERVAL_MS = 5000;
const unsigned long BACKEND_TIMEOUT_MS = 5000;

const int flowPin    = 27;
const int pressurePin = 34;
const int ledVerde   = 2;
const int ledNaranja = 15;
const int ledRojo    = 4;
const int buzzerPin  = 16;
const int relayPin   = 17;
const int valveIndicatorPin = 5;
const int buttonPin  = 13;

const float PRESSURE_SENSOR_MAX_PSI = 100.0f;
const float PRESSURE_SENSOR_MIN_V = 0.27f;
const float PRESSURE_SENSOR_MAX_V = 2.46f;
const float PRESSURE_DIVIDER_FACTOR = 1.5f;
const float PRESSURE_DEAD_ZONE_PSI = 0.5f;

// ===================== ESTADO Y LOGICA =====================
enum EstadoSistema {
  ESTADO_NORMAL = 0,
  ESTADO_ALERTA = 1,
  ESTADO_FUGA   = 2,
  ESTADO_ERROR  = 3
};

const float UMBRAL_ALERTA_FLUJO_IN = 1.0;
const float UMBRAL_ALERTA_PRES_IN  = 250.0;
const float UMBRAL_CRITICO_FLUJO = 2.2;
const float UMBRAL_CRITICO_PRES  = 180.0;
const float UMBRAL_NORMAL_FLUJO_OUT = 0.85;
const float UMBRAL_NORMAL_PRES_OUT  = 280.0;
const float PRESION_RECUPERACION_NORMAL = 290.0;
const int LECTURAS_ALERTA_REQUERIDAS   = 1;
const int LECTURAS_CRITICAS_REQUERIDAS = 1;

struct SystemState {
  volatile uint32_t pulseCount = 0;
  float flujoLmin   = 0.0;
  float presionKPa  = 0.0;
  bool sensorOK           = true;
  bool ledBlinkState      = false;
  bool primeraLectura     = true;
  bool flujoRealDetectado = false;
  uint32_t backendEnvios = 0;
  int backendLastCode = 0;
  bool backendOnline = false;
  String backendLastMsg = "Sin intentos";
  bool valvulaAbierta = true;
  uint32_t comandosBackend = 0;
  String ultimoComandoBackend = "Sin comandos";
  int contadorAlerta  = 0;
  int contadorCritico = 0;
  int nivelRiesgo     = 20;
  EstadoSistema estadoSistema = ESTADO_NORMAL;
};

// Variables para credenciales cargadas desde NVS
static String wifiSSID;
static String wifiPass;
static String ingestApiKey;

const char* WIFI_MANAGER_AP_NAME = "ESP32-FUGAS-SETUP";
const char* WIFI_MANAGER_AP_PASSWORD = "12345678";

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
    default: return "DESCONOCIDO";
  }
}

int calcularRiesgoContinuo(float flujo, float presion, bool sensorOK) {
  float scoreFlujo = limitarFloat((flujo - 0.6) / (2.8 - 0.6), 0.0, 1.0);
  float scorePres  = limitarFloat((300.0 - presion) / (300.0 - 170.0), 0.0, 1.0);
  float riesgo = (scoreFlujo * 0.55 + scorePres * 0.45) * 100.0;
  if (!sensorOK) return 5;
  return (int)limitarFloat(riesgo, 0.0, 100.0);
}

EstadoSistema evaluarEstado(float flujoLmin, float presionKPa, bool sensorOK,
                            int &contadorAlerta, int &contadorCritico, int &nivelRiesgo) {
  nivelRiesgo = calcularRiesgoContinuo(flujoLmin, presionKPa, sensorOK);
  if (!sensorOK) {
    contadorAlerta = 0;
    contadorCritico = 0;
    nivelRiesgo = 5;
    return ESTADO_ERROR;
  }
  bool flujoAnomalo = flujoLmin >= UMBRAL_ALERTA_FLUJO_IN;
  bool flujoCritico = flujoLmin >= UMBRAL_CRITICO_FLUJO;
  bool presionBaja = presionKPa <= UMBRAL_ALERTA_PRES_IN;
  bool presionCritica = presionKPa <= UMBRAL_CRITICO_PRES;

  if (presionKPa >= PRESION_RECUPERACION_NORMAL &&
      flujoLmin <= UMBRAL_NORMAL_FLUJO_OUT) {
    contadorAlerta = 0;
    contadorCritico = 0;
    nivelRiesgo = min(nivelRiesgo, 15);
    return ESTADO_NORMAL;
  }

  bool condicionCritica =
    (flujoCritico && presionBaja) ||
    (flujoAnomalo && presionCritica);
  bool condicionAlerta =
    flujoAnomalo ||
    presionBaja ||
    (nivelRiesgo >= 35);
  bool condicionNormal =
    (flujoLmin <= UMBRAL_NORMAL_FLUJO_OUT &&
     presionKPa >= UMBRAL_NORMAL_PRES_OUT &&
     nivelRiesgo < 35);

  if (condicionCritica) {
    contadorCritico = min(contadorCritico + 1, 10);
    contadorAlerta  = min(contadorAlerta + 1, 10);
    if (contadorCritico >= LECTURAS_CRITICAS_REQUERIDAS) return ESTADO_FUGA;
    return ESTADO_ALERTA;
  }
  if (condicionAlerta) {
    contadorAlerta = min(contadorAlerta + 1, 10);
    contadorCritico = max(contadorCritico - 1, 0);
    if (contadorAlerta >= LECTURAS_ALERTA_REQUERIDAS) return ESTADO_ALERTA;
    return ESTADO_NORMAL;
  }
  if (condicionNormal) {
    contadorAlerta = 0;
    contadorCritico = 0;
    nivelRiesgo = min(nivelRiesgo, 20);
    return ESTADO_NORMAL;
  }
  contadorAlerta  = max(contadorAlerta - 1, 0);
  contadorCritico = max(contadorCritico - 1, 0);
  if (contadorCritico >= LECTURAS_CRITICAS_REQUERIDAS) return ESTADO_FUGA;
  if (contadorAlerta >= 1) return ESTADO_ALERTA;
  return ESTADO_NORMAL;
}

// ===================== OBJETOS Y TEMPORIZADORES =====================
Adafruit_SSD1306 oled(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
SystemState state;

unsigned long lastMeasure = 0;
unsigned long lastSend = 0;
unsigned long lastCommandPoll = 0;
unsigned long lastBlink = 0;
unsigned long lastLCDUpdate = 0;

// ===================== WIFI / BACKEND =====================
static unsigned long s_backoffMs = 0;
static unsigned long s_commandBackoffMs = 0;
static const unsigned long BACKOFF_MAX_MS = 30000;
static const unsigned long BACKOFF_BASE_MS = 1000;

String backendBaseUrl() {
  return BACKEND_MODE == BACKEND_PUBLIC ? String(BACKEND_BASE_URL_PUBLIC) : String(BACKEND_BASE_URL_LOCAL);
}

String backendReadingsUrl() {
  return backendBaseUrl() + "/api/readings";
}

String backendModeTexto() {
  return BACKEND_MODE == BACKEND_PUBLIC ? "PUBLIC" : "LOCAL";
}

static bool isUrlUnreserved(char c) {
  return (c >= 'A' && c <= 'Z') ||
         (c >= 'a' && c <= 'z') ||
         (c >= '0' && c <= '9') ||
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

static String backendDeviceKeyQuery() {
  return "deviceKey=" + urlEncode(ingestApiKey);
}

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

static bool backendUsaHttps(const String &url) {
  return url.startsWith("https://");
}

static bool wifiConectado() {
  return WiFi.status() == WL_CONNECTED;
}

static String ipLocalTexto() {
  if (!wifiConectado()) return "";
  return WiFi.localIP().toString();
}

static void conectarWiFi() {
  WiFi.mode(WIFI_STA);

  WiFiManager wm;
  wm.setConnectTimeout(20);
  wm.setConfigPortalTimeout(180);
  wm.setBreakAfterConfig(true);

  Serial.println("Conectando WiFi con WiFiManager...");
  Serial.print("Si no conecta, abre la red: ");
  Serial.println(WIFI_MANAGER_AP_NAME);

  oled.clearDisplay();
  oled.setTextColor(SSD1306_WHITE);
  oled.setTextSize(1);
  oled.setCursor(0, 8);
  oled.print("WiFiManager");
  oled.setCursor(0, 24);
  oled.print(WIFI_MANAGER_AP_NAME);
  oled.setCursor(0, 40);
  oled.print("Clave: ");
  oled.print(WIFI_MANAGER_AP_PASSWORD);
  oled.display();

  bool conectado = wm.autoConnect(WIFI_MANAGER_AP_NAME, WIFI_MANAGER_AP_PASSWORD);
  if (!conectado && WiFi.status() != WL_CONNECTED) {
    Serial.println("No se pudo configurar WiFi. Reiniciando...");
    delay(1000);
    ESP.restart();
  }

  if (wifiConectado()) {
    wifiSSID = WiFi.SSID();
    Serial.println("WiFi conectado");
    Serial.print("IP: ");
    Serial.println(ipLocalTexto());
#ifdef DEBUG_SERIAL
    Serial.print("Backend activo (");
    Serial.print(backendModeTexto());
    Serial.print("): ");
    Serial.println(backendReadingsUrl());
#endif
  } else {
    Serial.println("No se pudo conectar a WiFi");
  }
}

void initWiFi() {
  conectarWiFi();
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
  }
  Serial.println();
  if (wifiConectado()) {
    Serial.println("WiFi reconectado");
    Serial.print("IP: ");
    Serial.println(ipLocalTexto());
    return true;
  }
  Serial.println("No fue posible reconectar WiFi");
  conectarWiFi();
  return wifiConectado();
}

static void updateBackoff(bool success, unsigned long &backoffMs) {
  if (success) {
    backoffMs = 0;
  } else {
    backoffMs = backoffMs == 0 ? BACKOFF_BASE_MS : min(backoffMs * 2, BACKOFF_MAX_MS);
  }
}

static bool shouldRetryHttpCode(int code) {
  return code == 429 || code == 500 || code == 502 || code == 503 || code == 504;
}

static String escapeJson(const String &value) {
  String escaped = "";
  escaped.reserve(value.length() + 8);
  for (size_t i = 0; i < value.length(); i++) {
    char c = value.charAt(i);
    if (c == '"' || c == '\\') {
      escaped += '\\';
      escaped += c;
    } else if (c == '\n') {
      escaped += "\\n";
    } else if (c == '\r') {
      escaped += "\\r";
    } else if (c == '\t') {
      escaped += "\\t";
    } else {
      escaped += c;
    }
  }
  return escaped;
}

// Función para calcular HMAC-SHA256
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
  for (int i = 0; i < 32; i++) {
    sprintf(hex + (i * 2), "%02x", result[i]);
  }
  return String(hex);
}

static bool beginBackendHttp(HTTPClient &http, WiFiClient &client,
                             WiFiClientSecure &secureClient, const String &url,
                             SystemState &state) {
  http.setTimeout(BACKEND_TIMEOUT_MS);
  if (backendUsaHttps(url)) {
    // Si se definió un certificado (cadena no vacía) lo usamos
    if (BACKEND_ROOT_CA_PEM[0] != '\0') {
      secureClient.setCACert(BACKEND_ROOT_CA_PEM);
    } else {
#if BACKEND_ALLOW_INSECURE_TLS
      secureClient.setInsecure();
#else
      state.backendOnline = false;
      state.backendLastCode = -2;
      state.backendLastMsg = "TLS seguro requiere BACKEND_ROOT_CA_PEM";
      Serial.println("TLS seguro habilitado, pero falta BACKEND_ROOT_CA_PEM.");
      return false;
#endif
    }
    return http.begin(secureClient, url);
  }
  return http.begin(client, url);
}

void enviarBackend(SystemState &state) {
  if (!asegurarWiFi()) {
    state.backendOnline = false;
    state.backendLastCode = 0;
    state.backendLastMsg = "WiFi desconectado";
    Serial.println("Sin WiFi. No se envio al backend.");
    return;
  }

  if (s_backoffMs > 0) {
    static unsigned long lastBackoffAttempt = 0;
    unsigned long now = millis();
    if (now - lastBackoffAttempt < s_backoffMs) {
#ifdef DEBUG_SERIAL
      Serial.print("Backoff activo: esperando ");
      Serial.print(s_backoffMs);
      Serial.println(" ms antes del siguiente intento.");
#endif
      return;
    }
    lastBackoffAttempt = now;
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
  if (HOUSE_ID > 0) appendField("\"houseId\":" + String(HOUSE_ID));
  appendField("\"deviceName\":\"" + escapeJson(String(DEVICE_NAME)) + "\"");
  if (String(DEVICE_TYPE).length() > 0) appendField("\"deviceType\":\"" + escapeJson(String(DEVICE_TYPE)) + "\"");
  if (String(DEVICE_FIRMWARE_VERSION).length() > 0) appendField("\"firmwareVersion\":\"" + escapeJson(String(DEVICE_FIRMWARE_VERSION)) + "\"");
  if (String(DEVICE_HARDWARE_UID).length() > 0) appendField("\"hardwareUid\":\"" + escapeJson(String(DEVICE_HARDWARE_UID)) + "\"");
  appendField("\"deviceKey\":\"" + escapeJson(ingestApiKey) + "\"");
  appendField("\"ipAddress\":\"" + WiFi.localIP().toString() + "\"");
  appendField("\"wifiSsid\":\"" + escapeJson(wifiSSID) + "\"");
  appendField("\"internetConnected\":" + String(WiFi.status() == WL_CONNECTED ? "true" : "false"));
  if (SENSOR_ID > 0) appendField("\"sensorId\":" + String(SENSOR_ID));
  appendField("\"flow_lmin\":" + String(state.flujoLmin, 2));
  appendField("\"pressure_kpa\":" + String(state.presionKPa, 2));
  appendField("\"risk\":" + String(state.nivelRiesgo));
  appendField("\"state\":\"" + estadoTexto(state.estadoSistema) + "\"");
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
    state.backendOnline = false;
    state.backendLastCode = -1;
    state.backendLastMsg = "No se pudo iniciar HTTP/HTTPS";
    updateBackoff(false, s_backoffMs);
    return;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-key", ingestApiKey);
  http.addHeader("x-signature", signature);

  int httpCode = http.POST(payload);
  state.backendLastCode = httpCode;
  Serial.print("HTTP Code: ");
  Serial.println(httpCode);

  if (httpCode > 0) {
    String resp = http.getString();
    state.backendLastMsg = resp.substring(0, 120);
    state.backendOnline = httpCode >= 200 && httpCode < 300;
#ifdef DEBUG_SERIAL
    Serial.print("Respuesta backend: ");
    Serial.println(resp);
#endif
    if (state.backendOnline) {
      state.backendEnvios++;
      updateBackoff(true, s_backoffMs);
    } else if (shouldRetryHttpCode(httpCode)) {
      updateBackoff(false, s_backoffMs);
    }
  } else {
    state.backendOnline = false;
    state.backendLastMsg = http.errorToString(httpCode);
    Serial.print("Error HTTP: ");
    Serial.println(http.errorToString(httpCode));
    updateBackoff(false, s_backoffMs);
  }
  http.end();
}

static void ejecutarComando(SystemState &state, const String &tipo, String &codigo, String &mensaje) {
  codigo = "OK";
  if (tipo == "CERRAR_VALVULA") {
    state.valvulaAbierta = false;
    mensaje = "Valvula cerrada en simulacion";
  } else if (tipo == "ABRIR_VALVULA") {
    state.valvulaAbierta = true;
    mensaje = "Valvula abierta en simulacion";
  } else if (tipo == "SOLICITAR_ESTADO") {
    mensaje = "Estado reportado desde simulacion";
  } else if (tipo == "ACTUALIZAR_CONFIG") {
    mensaje = "Configuracion recibida por simulacion";
  } else if (tipo == "REINICIAR") {
    mensaje = "Reinicio programado en simulacion";
  } else if (tipo == "OTRO") {
    mensaje = "Comando OTRO recibido por simulacion";
  } else {
    codigo = "ERROR";
    mensaje = "Tipo de comando no soportado por simulacion";
  }
}

static bool responderComandoBackend(SystemState &state, unsigned long commandId,
                                    const String &codigo, const String &mensaje) {
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
  appendField("\"deviceName\":\"" + escapeJson(String(DEVICE_NAME)) + "\"");
  if (String(DEVICE_HARDWARE_UID).length() > 0) appendField("\"hardwareUid\":\"" + escapeJson(String(DEVICE_HARDWARE_UID)) + "\"");
  appendField("\"deviceKey\":\"" + escapeJson(ingestApiKey) + "\"");
  appendField("\"codigoResultado\":\"" + escapeJson(codigo) + "\"");
  appendField("\"mensaje\":\"" + escapeJson(mensaje) + "\"");

  String responsePayload = "\"payload\":{";
  responsePayload += "\"state\":\"" + String(estadoTexto(state.estadoSistema)) + "\"";
  responsePayload += ",\"risk\":" + String(state.nivelRiesgo);
  responsePayload += ",\"valvula\":\"" + String(state.valvulaAbierta ? "ABIERTA" : "CERRADA") + "\"";
  responsePayload += ",\"backendEnvios\":" + String(state.backendEnvios);
  responsePayload += "}";
  appendField(responsePayload);
  payload += "}";

  String signature = calcularHMAC(payload, HMAC_SECRET_KEY);

  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-key", ingestApiKey);
  http.addHeader("x-signature", signature);

  int httpCode = http.POST(payload);
  Serial.print("Respuesta comando #");
  Serial.print(commandId);
  Serial.print(" HTTP Code: ");
  Serial.println(httpCode);
  if (httpCode > 0) {
#ifdef DEBUG_SERIAL
    Serial.println(http.getString());
#endif
  } else {
    Serial.print("Error respondiendo comando: ");
    Serial.println(http.errorToString(httpCode));
  }
  http.end();
  return httpCode >= 200 && httpCode < 300;
}

void consultarComandosBackend(SystemState &state) {
  if (!asegurarWiFi()) return;

  if (s_commandBackoffMs > 0) {
    static unsigned long lastCommandBackoffAttempt = 0;
    unsigned long now = millis();
    if (now - lastCommandBackoffAttempt < s_commandBackoffMs) {
#ifdef DEBUG_SERIAL
      Serial.print("Backoff comandos activo: esperando ");
      Serial.print(s_commandBackoffMs);
      Serial.println(" ms.");
#endif
      return;
    }
    lastCommandBackoffAttempt = now;
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

  int httpCode = http.GET();
  Serial.print("Consulta comandos HTTP Code: ");
  Serial.println(httpCode);

  if (httpCode < 200 || httpCode >= 300) {
    if (httpCode > 0) {
#ifdef DEBUG_SERIAL
      Serial.println(http.getString());
#endif
    } else {
      Serial.print("Error consultando comandos: ");
      Serial.println(http.errorToString(httpCode));
    }
    http.end();
    updateBackoff(false, s_commandBackoffMs);
    return;
  }

  String response = http.getString();
  http.end();
  updateBackoff(true, s_commandBackoffMs);

  StaticJsonDocument<1024> doc;
  DeserializationError error = deserializeJson(doc, response);
  if (error) {
    Serial.print("JSON comandos invalido: ");
    Serial.println(error.c_str());
    return;
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

    String codigo;
    String mensaje;
    ejecutarComando(state, tipo, codigo, mensaje);
    state.comandosBackend++;
    state.ultimoComandoBackend = tipo;

    Serial.print("Comando remoto #");
    Serial.print(commandId);
    Serial.print(": ");
    Serial.print(tipo);
    Serial.print(" -> ");
    Serial.println(mensaje);

    bool responded = responderComandoBackend(state, commandId, codigo, mensaje);
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
  for (int i = 0; i < muestras; i++) {
    suma += analogRead(pin);
    delayMicroseconds(pausaUs);
  }
  return (int)(suma / muestras);
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

  if (pulses > 0) state.flujoRealDetectado = true;

  float sampleSeconds = sampleIntervalMs / 1000.0f;
  if (sampleSeconds <= 0.0f) sampleSeconds = 1.0f;

  float frequencyHz = pulses / sampleSeconds;
  float nuevoFlujo = frequencyHz / 7.5;
  int rawPressure = leerAdcPromediado(pressurePin, 20, 200);
  float adcVoltage = (rawPressure / 4095.0f) * 3.3f;
  float sensorVoltage = adcVoltage * PRESSURE_DIVIDER_FACTOR;
  int pressurePercent = (int)((rawPressure * 100L) / 4095L);
  float pressureRatio = (sensorVoltage - PRESSURE_SENSOR_MIN_V) /
                        (PRESSURE_SENSOR_MAX_V - PRESSURE_SENSOR_MIN_V);
  float pressurePsi = limitarFloat(pressureRatio, 0.0f, 1.0f) * PRESSURE_SENSOR_MAX_PSI;
  if (pressurePsi < PRESSURE_DEAD_ZONE_PSI) {
    pressurePsi = 0.0f;
  }
  float nuevaPresion = pressurePsi * 6.89476f;

  state.sensorOK = sensorVoltage >= (PRESSURE_SENSOR_MIN_V - 0.05f) &&
                   sensorVoltage <= (PRESSURE_SENSOR_MAX_V + 0.05f);

  if (nuevoFlujo < 0.0) nuevoFlujo = 0.0;
  if (nuevoFlujo > 5.0) nuevoFlujo = 5.0;
  if (nuevaPresion < 0.0) nuevaPresion = 0.0;
  if (nuevaPresion > 690.0) nuevaPresion = 690.0;

  if (state.primeraLectura) {
    state.flujoLmin = nuevoFlujo;
    state.presionKPa = nuevaPresion;
    state.primeraLectura = false;
  } else {
    float deltaFlujo = nuevoFlujo - state.flujoLmin;
    float deltaPresion = nuevaPresion - state.presionKPa;
    float pesoNuevoFlujo = 0.95f;
    float pesoNuevoPresion = 0.95f;
    if (abs(deltaPresion) >= 20.0f) pesoNuevoPresion = 1.0f;
    if (abs(deltaFlujo) >= 0.5f) pesoNuevoFlujo = 1.0f;
    state.flujoLmin = state.flujoLmin * (1.0f - pesoNuevoFlujo) + nuevoFlujo * pesoNuevoFlujo;
    state.presionKPa = state.presionKPa * (1.0f - pesoNuevoPresion) + nuevaPresion * pesoNuevoPresion;
  }

#ifdef DEBUG_SERIAL
  Serial.println("----- LECTURA -----");
  Serial.print("Pulsos: ");               Serial.println(pulses);
  Serial.print("ADC presion: ");          Serial.println(rawPressure);
  Serial.print("Pot presion (%): ");      Serial.println(pressurePercent);
  Serial.print("V transductor: ");        Serial.println(sensorVoltage, 2);
  Serial.print("Presion (PSI): ");        Serial.println(pressurePsi, 2);
  Serial.print("Flujo real detectado: "); Serial.println(state.flujoRealDetectado ? "SI" : "NO");
  Serial.print("Flujo (L/min): ");        Serial.println(state.flujoLmin, 2);
  Serial.print("Presion (kPa): ");        Serial.println(state.presionKPa, 2);
  Serial.print("Sensor OK: ");            Serial.println(state.sensorOK ? "SI" : "NO");
#endif
}

static void apagarBuzzer() {
  ledcWrite(buzzerPin, 0);
}

static void encenderBuzzerContinuo() {
  ledcWrite(buzzerPin, 128);
}

void initActuadores() {
  pinMode(flowPin, INPUT);
  pinMode(buttonPin, INPUT_PULLUP);
  pinMode(ledVerde, OUTPUT);
  pinMode(ledNaranja, OUTPUT);
  pinMode(ledRojo, OUTPUT);
  pinMode(relayPin, OUTPUT);
  pinMode(valveIndicatorPin, OUTPUT);

  digitalWrite(ledVerde, LOW);
  digitalWrite(ledNaranja, LOW);
  digitalWrite(ledRojo, LOW);
  digitalWrite(relayPin, LOW);
  digitalWrite(valveIndicatorPin, LOW);

  const int buzzerFreq = 1500;
  const int buzzerResolution = 8;

  if (!ledcAttach(buzzerPin, buzzerFreq, buzzerResolution)) {
    Serial.println("Error al configurar buzzer");
  } else {
    Serial.println("Buzzer OK");
  }
  ledcWrite(buzzerPin, 0);
}

static void leerPulsadorValvula(SystemState &state) {
  static bool lastButtonState = HIGH;
  static unsigned long lastDebounce = 0;

  bool reading = digitalRead(buttonPin);
  if (reading != lastButtonState) {
    lastDebounce = millis();
    lastButtonState = reading;
  }

  if (reading == LOW && millis() - lastDebounce > 60) {
    state.valvulaAbierta = !state.valvulaAbierta;
    Serial.print("Pulsador: valvula ");
    Serial.println(state.valvulaAbierta ? "ABIERTA" : "CERRADA");
    while (digitalRead(buttonPin) == LOW) {
      delay(5);
    }
    lastButtonState = HIGH;
  }
}

void actualizarActuadores(SystemState &state, unsigned long &lastBlink) {
  leerPulsadorValvula(state);

  if (state.estadoSistema == ESTADO_FUGA) {
    state.valvulaAbierta = false;
  }

  digitalWrite(relayPin, state.valvulaAbierta ? HIGH : LOW);
  digitalWrite(valveIndicatorPin, state.valvulaAbierta ? HIGH : LOW);

  switch (state.estadoSistema) {
    case ESTADO_NORMAL:
      apagarBuzzer();
      digitalWrite(ledVerde, HIGH);
      digitalWrite(ledNaranja, LOW);
      digitalWrite(ledRojo, LOW);
      break;

    case ESTADO_ALERTA:
      apagarBuzzer();
      digitalWrite(ledVerde, LOW);
      digitalWrite(ledRojo, LOW);
      if (millis() - lastBlink >= 300) {
        lastBlink = millis();
        state.ledBlinkState = !state.ledBlinkState;
        digitalWrite(ledNaranja, state.ledBlinkState);
      }
      break;

    case ESTADO_FUGA:
      digitalWrite(ledVerde, LOW);
      digitalWrite(ledNaranja, LOW);
      digitalWrite(ledRojo, HIGH);
      encenderBuzzerContinuo();
      break;

    case ESTADO_ERROR:
      apagarBuzzer();
      digitalWrite(ledVerde, LOW);
      digitalWrite(ledNaranja, LOW);
      if (millis() - lastBlink >= 700) {
        lastBlink = millis();
        state.ledBlinkState = !state.ledBlinkState;
        digitalWrite(ledRojo, state.ledBlinkState);
      }
      break;
  }
}

// ===================== OLED =====================
void initDisplay(Adafruit_SSD1306 &display, const SystemState &state) {
  Wire.begin(21, 22);

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("OLED no encontrado");
    return;
  }

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(8, 18);
  display.print("Iniciando...");
  display.setCursor(8, 34);
  display.print("Sistema IoT");
  if (!state.sensorOK) {
    display.setCursor(8, 50);
    display.print("Verificar presion");
  }
  display.display();
  Serial.println("OLED OK");
}

void actualizarOLED(Adafruit_SSD1306 &display, const SystemState &state, unsigned long &lastDisplayUpdate) {
  static int ultimoEstado = -1;
  static int ultimoRiesgo = -1;
  static int ultimoFlujo10 = -1;
  static int ultimaPresion = -1;
  static bool ultimoSensorOK = true;
  static bool ultimoBackendOnline = false;
  static bool ultimaValvula = false;

  int flujo10 = (int)(state.flujoLmin * 10.0f);
  int presion = (int)(state.presionKPa + 0.5f);

  if ((int)state.estadoSistema == ultimoEstado &&
      state.nivelRiesgo == ultimoRiesgo &&
      flujo10 == ultimoFlujo10 &&
      presion == ultimaPresion &&
      state.sensorOK == ultimoSensorOK &&
      state.backendOnline == ultimoBackendOnline &&
      state.valvulaAbierta == ultimaValvula &&
      millis() - lastDisplayUpdate < 500) {
    return;
  }

  ultimoEstado = (int)state.estadoSistema;
  ultimoRiesgo = state.nivelRiesgo;
  ultimoFlujo10 = flujo10;
  ultimaPresion = presion;
  ultimoSensorOK = state.sensorOK;
  ultimoBackendOnline = state.backendOnline;
  ultimaValvula = state.valvulaAbierta;
  lastDisplayUpdate = millis();

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  display.setCursor(2, 2);
  display.print("ESP32-FISICO ");
  display.print(state.backendOnline ? "ON" : "OFF");
  display.drawFastHLine(0, 12, 128, SSD1306_WHITE);

  display.setCursor(2, 18);
  display.print("Estado: ");
  display.print(estadoTexto(state.estadoSistema));

  display.setCursor(2, 30);
  display.print("Q: ");
  display.print(state.flujoLmin, 1);
  display.print(" L/min");

  display.setCursor(2, 42);
  display.print("P: ");
  display.print(state.presionKPa, 0);
  display.print(" kPa R:");
  display.print(state.nivelRiesgo);
  display.print("%");

  display.setCursor(2, 54);
  display.print(state.sensorOK ? "Sensor OK " : "Sensor ERROR ");
  display.print(state.valvulaAbierta ? "Valv AB" : "Valv CE");

  display.display();
}

// ===================== COMANDOS SERIALES =====================
static String pendingCommand = "";
static bool forcedStateEnabled = false;
static EstadoSistema forcedStateValue = ESTADO_NORMAL;

static bool parseForcedState(const String &rawState, EstadoSistema &outState) {
  if (rawState == "NORMAL") { outState = ESTADO_NORMAL; return true; }
  if (rawState == "ALERTA") { outState = ESTADO_ALERTA; return true; }
  if (rawState == "FUGA")   { outState = ESTADO_FUGA;   return true; }
  if (rawState == "ERROR")  { outState = ESTADO_ERROR;  return true; }
  return false;
}

bool commandHasForcedState() {
  return forcedStateEnabled;
}

EstadoSistema commandForcedState() {
  return forcedStateValue;
}

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
    Serial.print("CMD:STATUS ");
    Serial.print(estadoTexto(state.estadoSistema));
    Serial.print(" R=");
    Serial.print(state.nivelRiesgo);
    Serial.print(" Q=");
    Serial.print(state.flujoLmin, 2);
    Serial.print(" P=");
    Serial.print(state.presionKPa, 2);
    Serial.print(" VALVULA=");
    Serial.print(state.valvulaAbierta ? "ABIERTA" : "CERRADA");
    Serial.print(" CMD=");
    Serial.println(state.ultimoComandoBackend);
  } else if (pendingCommand == "HELP") {
    Serial.println("CMD:HELP PING | STATUS | RESET_WIFI | FORCE NORMAL|ALERTA|FUGA|ERROR|AUTO");
  } else if (pendingCommand == "RESET_WIFI") {
    WiFiManager wm;
    wm.resetSettings();
    Serial.println("CMD:RESET_WIFI OK. Reiniciando para abrir portal...");
    delay(1000);
    ESP.restart();
  } else if (pendingCommand.startsWith("FORCE ")) {
    String arg = pendingCommand.substring(6);
    arg.trim();
    if (arg == "AUTO") {
      forcedStateEnabled = false;
      Serial.println("CMD:FORCE AUTO");
    } else {
      EstadoSistema parsedState = ESTADO_NORMAL;
      if (parseForcedState(arg, parsedState)) {
        forcedStateEnabled = true;
        forcedStateValue = parsedState;
        Serial.print("CMD:FORCE ");
        Serial.println(estadoTexto(forcedStateValue));
      } else {
        Serial.println("CMD:UNKNOWN_FORCE");
      }
    }
  } else {
    Serial.println("CMD:UNKNOWN");
  }
  pendingCommand = "";
}

// ===================== SERIAL JSON (solo depuración) =====================
#ifdef DEBUG_SERIAL
static void printJsonEstado(const SystemState &s) {
  Serial.print("{\"device\":\"");
  Serial.print(DEVICE_NAME);
  Serial.print("\",\"sensor_id\":");
  Serial.print(SENSOR_ID);
  Serial.print(",\"flow_lmin\":");
  Serial.print(s.flujoLmin, 2);
  Serial.print(",\"pressure_kpa\":");
  Serial.print(s.presionKPa, 2);
  Serial.print(",\"risk\":");
  Serial.print(s.nivelRiesgo);
  Serial.print(",\"state\":\"");
  Serial.print(estadoTexto(s.estadoSistema));
  Serial.print("\",\"sensor_ok\":");
  Serial.print(s.sensorOK ? "true" : "false");
  Serial.print(",\"backend_online\":");
  Serial.print(s.backendOnline ? "true" : "false");
  Serial.print(",\"valvula\":\"");
  Serial.print(s.valvulaAbierta ? "ABIERTA" : "CERRADA");
  Serial.print("\",\"remote_commands\":");
  Serial.print(s.comandosBackend);
  Serial.println("}");
}
#else
static void printJsonEstado(const SystemState &s) {}
#endif

// ===================== INTERRUPCION / SETUP / LOOP =====================
void IRAM_ATTR onPulse() {
  state.pulseCount++;
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println();
  Serial.println("Iniciando sistema...");
  Serial.println("RFC2217 configurado en puerto 4001");

  Preferences pref;
  pref.begin("creds", true);
  wifiSSID = pref.getString("ssid", DEFAULT_SSID);
  wifiPass = pref.getString("pass", DEFAULT_PASSWORD);
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

  initWiFi();

  const esp_task_wdt_config_t wdtConfig = {
    .timeout_ms = 10000,
    .idle_core_mask = (1 << portNUM_PROCESSORS) - 1,
    .trigger_panic = true
  };
  esp_task_wdt_init(&wdtConfig);
  esp_task_wdt_add(NULL);

  lastMeasure = millis();
  lastSend = millis();
  lastCommandPoll = millis();
  lastBlink = millis();

  Serial.println("Sistema listo");
  Serial.println("Comandos seriales: HELP, PING, STATUS, FORCE NORMAL|ALERTA|FUGA|ERROR|AUTO");
}

void loop() {
  unsigned long now = millis();
  esp_task_wdt_reset();

  handleCommands(state);

  if (now - lastMeasure >= SENSOR_READ_INTERVAL_MS) {
    unsigned long sampleIntervalMs = now - lastMeasure;
    readSensores(state, sampleIntervalMs);
    state.estadoSistema = evaluarEstado(
      state.flujoLmin,
      state.presionKPa,
      state.sensorOK,
      state.contadorAlerta,
      state.contadorCritico,
      state.nivelRiesgo
    );

    if (commandHasForcedState()) {
      state.estadoSistema = commandForcedState();
    }

    actualizarOLED(oled, state, lastLCDUpdate);

#ifdef DEBUG_SERIAL
    Serial.print("Estado: ");       Serial.println(estadoTexto(state.estadoSistema));
    Serial.print("Nivel riesgo: "); Serial.println(state.nivelRiesgo);
    Serial.print("Cnt alerta: ");   Serial.println(state.contadorAlerta);
    Serial.print("Cnt critico: ");  Serial.println(state.contadorCritico);
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

#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <Adafruit_BMP085.h>
#include <LiquidCrystal_I2C.h>

// ===================== CONFIGURACION =====================
// Cambia estos dos valores si vas a cargarlo en un ESP32 fisico.
const char* ssid     = "Wokwi-GUEST";
const char* password = "";
String wifiSsidConfig = ssid;
String wifiPasswordConfig = password;
static Preferences wifiPrefs;

enum BackendMode {
  BACKEND_LOCAL = 0,
  BACKEND_PUBLIC = 1
};

const BackendMode BACKEND_MODE = BACKEND_PUBLIC;
const char* BACKEND_BASE_URL_LOCAL  = "http://host.wokwi.internal:3000";
const char* BACKEND_BASE_URL_PUBLIC = "https://sistemas-de-deteccion-de-fugas.up.railway.app";

const char* DEVICE_NAME = "ESP32-WOKWI-01";
const char* DEVICE_TYPE = "ESP32-WOKWI";
const char* DEVICE_FIRMWARE_VERSION = "sim-1.0.0";
const char* DEVICE_HARDWARE_UID = "HW-WOKWI-ESP32-01";

const int DEVICE_ID = 0;
const int HOUSE_ID = 0;
const int SENSOR_ID = 0;

// Debe ser igual a INGEST_API_KEY en el backend.
const char* INGEST_API_KEY = "CAMBIA_ESTA_CLAVE_POR_UNA_NUEVA";

const unsigned long SENSOR_READ_INTERVAL_MS = 1000;
const unsigned long BACKEND_SEND_INTERVAL_MS = 2000;
const unsigned long BACKEND_COMMAND_POLL_INTERVAL_MS = 5000;
const unsigned long BACKEND_TIMEOUT_MS = 3000;

const int flowPin    = 27;
const int ledVerde   = 2;
const int ledNaranja = 15;
const int ledRojo    = 4;
const int buzzerPin  = 16;

#ifndef BACKEND_ALLOW_INSECURE_TLS
#define BACKEND_ALLOW_INSECURE_TLS 1
#endif

#ifndef BACKEND_ROOT_CA_PEM
#define BACKEND_ROOT_CA_PEM ""
#endif

// ===================== ESTADO Y LOGICA =====================
enum EstadoSistema {
  ESTADO_NORMAL = 0,
  ESTADO_ALERTA = 1,
  ESTADO_FUGA   = 2,
  ESTADO_ERROR  = 3
};

const float UMBRAL_ALERTA_FLUJO_IN = 1.0;
const float UMBRAL_ALERTA_PRES_IN  = 101.5;
const float UMBRAL_CRITICO_FLUJO = 2.2;
const float UMBRAL_CRITICO_PRES  = 99.0;
const float UMBRAL_NORMAL_FLUJO_OUT = 0.85;
const float UMBRAL_NORMAL_PRES_OUT  = 101.0;
const float PRESION_RECUPERACION_NORMAL = 101.2;
const int LECTURAS_ALERTA_REQUERIDAS   = 1;
const int LECTURAS_CRITICAS_REQUERIDAS = 2;

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
  float scorePres  = limitarFloat((104.0 - presion) / (104.0 - 95.0), 0.0, 1.0);
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
  if (presionKPa >= PRESION_RECUPERACION_NORMAL + 0.8f &&
      flujoLmin <= UMBRAL_NORMAL_FLUJO_OUT + 0.25f) {
    contadorAlerta = 0;
    contadorCritico = 0;
    nivelRiesgo = min(nivelRiesgo, 15);
    return ESTADO_NORMAL;
  }
  if (presionKPa >= PRESION_RECUPERACION_NORMAL) {
    contadorAlerta = 0;
    contadorCritico = 0;
    nivelRiesgo = min(nivelRiesgo, 20);
    return ESTADO_NORMAL;
  }
  bool condicionCritica = (flujoLmin >= UMBRAL_CRITICO_FLUJO && presionKPa <= UMBRAL_CRITICO_PRES);
  bool condicionAlerta =
    (flujoLmin >= UMBRAL_ALERTA_FLUJO_IN && presionKPa <= UMBRAL_ALERTA_PRES_IN) ||
    (nivelRiesgo >= 45);
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
Adafruit_BMP085 bmp;
LiquidCrystal_I2C lcd(0x27, 16, 2);
SystemState state;

unsigned long lastMeasure = 0;
unsigned long lastSend = 0;
unsigned long lastCommandPoll = 0;
unsigned long lastBlink = 0;
unsigned long lastLCDUpdate = 0;

// ===================== WIFI / BACKEND =====================
static unsigned long s_backoffMs = 0;
static unsigned long s_commandBackoffMs = 0;   // backoff para consulta de comandos
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

String backendPendingCommandsUrl() {
  String url = backendBaseUrl() + "/api/commands/pending?";
  if (DEVICE_ID > 0) {
    url += "deviceId=" + String(DEVICE_ID);
  } else {
    url += "deviceName=" + urlEncode(String(DEVICE_NAME));
  }
  if (String(DEVICE_HARDWARE_UID).length() > 0) {
    url += "&hardwareUid=" + urlEncode(String(DEVICE_HARDWARE_UID));
  }
  return url;
}

String backendCommandResponseUrl(unsigned long commandId) {
  return backendBaseUrl() + "/api/commands/" + String(commandId) + "/response";
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

static void saveWifiConfig() {
  wifiPrefs.begin("wifi-config", false);
  wifiPrefs.putString("ssid", wifiSsidConfig);
  wifiPrefs.putString("pass", wifiPasswordConfig);
  wifiPrefs.end();
}

static void loadWifiConfig() {
  wifiPrefs.begin("wifi-config", true);
  String persistedSsid = wifiPrefs.getString("ssid", "");
  String persistedPass = wifiPrefs.getString("pass", "");
  wifiPrefs.end();
  if (persistedSsid.length() > 0) {
    wifiSsidConfig = persistedSsid;
    wifiPasswordConfig = persistedPass;
    Serial.print("WiFi cargado desde NVS: ");
    Serial.println(wifiSsidConfig);
  } else {
    Serial.println("WiFi usando credenciales por defecto.");
  }
}

static void conectarWiFi() {
  Serial.print("Conectando a WiFi");
  WiFi.mode(WIFI_STA);
  WiFi.begin(wifiSsidConfig.c_str(), wifiPasswordConfig.c_str(), 6);
  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 30) {
    delay(300);
    Serial.print(".");
    intentos++;
  }
  Serial.println();
  if (wifiConectado()) {
    Serial.println("WiFi conectado");
    Serial.print("IP: ");
    Serial.println(ipLocalTexto());
    Serial.print("Backend activo (");
    Serial.print(backendModeTexto());
    Serial.print("): ");
    Serial.println(backendReadingsUrl());
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
  WiFi.disconnect(true);
  delay(500);
  WiFi.begin(wifiSsidConfig.c_str(), wifiPasswordConfig.c_str());
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
  return false;
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

static bool beginBackendHttp(HTTPClient &http, WiFiClient &client,
                             WiFiClientSecure &secureClient, const String &url,
                             SystemState &state) {
  http.setTimeout(BACKEND_TIMEOUT_MS);
  if (backendUsaHttps(url)) {
#if BACKEND_ALLOW_INSECURE_TLS
    secureClient.setInsecure();
#else
    // Verificación usando sizeof en lugar de <cstring>
    if (sizeof(BACKEND_ROOT_CA_PEM) - 1 > 0) {
      secureClient.setCACert(BACKEND_ROOT_CA_PEM);
    } else {
      state.backendOnline = false;
      state.backendLastCode = -2;
      state.backendLastMsg = "TLS seguro requiere BACKEND_ROOT_CA_PEM";
      Serial.println("TLS seguro habilitado, pero falta BACKEND_ROOT_CA_PEM.");
      return false;
    }
#endif
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
      Serial.print("Backoff activo: esperando ");
      Serial.print(s_backoffMs);
      Serial.println(" ms antes del siguiente intento.");
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
  appendField("\"ipAddress\":\"" + WiFi.localIP().toString() + "\"");
  appendField("\"wifiSsid\":\"" + escapeJson(wifiSsidConfig) + "\"");
  appendField("\"internetConnected\":" + String(WiFi.status() == WL_CONNECTED ? "true" : "false"));
  if (SENSOR_ID > 0) appendField("\"sensorId\":" + String(SENSOR_ID));
  appendField("\"flow_lmin\":" + String(state.flujoLmin, 2));
  appendField("\"pressure_kpa\":" + String(state.presionKPa, 2));
  appendField("\"risk\":" + String(state.nivelRiesgo));
  appendField("\"state\":\"" + estadoTexto(state.estadoSistema) + "\"");
  payload += "}";

  Serial.println(">>> Enviando lectura al backend...");
  Serial.println(url);
  Serial.println(payload);

  if (!beginBackendHttp(http, client, secureClient, url, state)) {
    state.backendOnline = false;
    state.backendLastCode = -1;
    state.backendLastMsg = "No se pudo iniciar HTTP/HTTPS";
    updateBackoff(false, s_backoffMs);
    return;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-key", INGEST_API_KEY);

  int httpCode = http.POST(payload);
  state.backendLastCode = httpCode;
  Serial.print("HTTP Code: ");
  Serial.println(httpCode);

  if (httpCode > 0) {
    String resp = http.getString();
    state.backendLastMsg = resp.substring(0, 120);
    state.backendOnline = httpCode >= 200 && httpCode < 300;
    Serial.print("Respuesta backend: ");
    Serial.println(resp);
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

static bool applyWifiConfigFromPayload(const JsonObjectConst &payload, String &mensaje) {
  if (payload.isNull()) {
    mensaje = "ACTUALIZAR_CONFIG sin payload";
    return false;
  }
  String newSsid = "";
  String newPass = "";
  if (payload["wifiSsid"].is<const char*>()) newSsid = payload["wifiSsid"].as<String>();
  else if (payload["wifiSSID"].is<const char*>()) newSsid = payload["wifiSSID"].as<String>();
  else if (payload["ssid"].is<const char*>()) newSsid = payload["ssid"].as<String>();

  if (payload["wifiPassword"].is<const char*>()) newPass = payload["wifiPassword"].as<String>();
  else if (payload["password"].is<const char*>()) newPass = payload["password"].as<String>();

  newSsid.trim();
  newPass.trim();
  if (newSsid.length() == 0) {
    mensaje = "ACTUALIZAR_CONFIG sin SSID valido";
    return false;
  }

  wifiSsidConfig = newSsid;
  wifiPasswordConfig = newPass;
  saveWifiConfig();

  WiFi.disconnect(true);
  delay(300);
  conectarWiFi();

  if (wifiConectado()) {
    mensaje = "WiFi actualizado a " + wifiSsidConfig;
    return true;
  }

  mensaje = "WiFi guardado pero no conecto: " + wifiSsidConfig;
  return false;
}

static void ejecutarComando(SystemState &state, const String &tipo, const JsonObjectConst &payload, String &codigo, String &mensaje) {
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
    if (!applyWifiConfigFromPayload(payload, mensaje)) {
      codigo = "ERROR";
    }
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

  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-key", INGEST_API_KEY);

  int httpCode = http.POST(payload);
  Serial.print("Respuesta comando #");
  Serial.print(commandId);
  Serial.print(" HTTP Code: ");
  Serial.println(httpCode);
  if (httpCode > 0) {
    Serial.println(http.getString());
  } else {
    Serial.print("Error respondiendo comando: ");
    Serial.println(http.errorToString(httpCode));
  }
  http.end();
  return httpCode >= 200 && httpCode < 300;
}

void consultarComandosBackend(SystemState &state) {
  if (!asegurarWiFi()) return;

  // Aplicamos backoff para comandos también
  if (s_commandBackoffMs > 0) {
    static unsigned long lastCommandBackoffAttempt = 0;
    unsigned long now = millis();
    if (now - lastCommandBackoffAttempt < s_commandBackoffMs) {
      Serial.print("Backoff comandos activo: esperando ");
      Serial.print(s_commandBackoffMs);
      Serial.println(" ms.");
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

  http.addHeader("x-device-key", INGEST_API_KEY);

  int httpCode = http.GET();
  Serial.print("Consulta comandos HTTP Code: ");
  Serial.println(httpCode);

  if (httpCode < 200 || httpCode >= 300) {
    if (httpCode > 0) {
      Serial.println(http.getString());
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
  updateBackoff(true, s_commandBackoffMs);  // Éxito, reseteamos backoff de comandos

  // Corrección: usar StaticJsonDocument para evitar problemas de tipo
  StaticJsonDocument<1024> doc;
  DeserializationError error = deserializeJson(doc, response);
  if (error) {
    Serial.print("JSON comandos invalido: ");
    Serial.println(error.c_str());
    return;
  }

  JsonArray comandos = doc["comandos"].as<JsonArray>();
  if (comandos.isNull() || comandos.size() == 0) {
    Serial.println("Sin comandos remotos pendientes.");
    return;
  }

  for (JsonObject comando : comandos) {
    unsigned long commandId = comando["id"].as<unsigned long>();
    String tipo = comando["tipo"].as<String>();
    if (commandId == 0 || tipo.length() == 0) continue;
    JsonObjectConst payload = comando["payload"].as<JsonObjectConst>();

    String codigo;
    String mensaje;
    ejecutarComando(state, tipo, payload, codigo, mensaje);
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
      delay(500);  // Pequeña pausa para asegurar envío de respuesta
      ESP.restart();
    }
  }
}

// ===================== SENSORES =====================
static bool s_bmpDisponible = false;

void initSensores(Adafruit_BMP085 &bmp, SystemState &state) {
  Wire.begin(21, 22);  // Ajusta estos pines según tu placa ESP32 (21=SDA,22=SCL por defecto)
  Serial.println("I2C OK");
  if (!bmp.begin()) {
    s_bmpDisponible = false;
    state.sensorOK = false;
    Serial.println("Error BMP180");
  } else {
    s_bmpDisponible = true;
    Serial.println("BMP180 OK");
  }
}

void readSensores(Adafruit_BMP085 &bmp, SystemState &state, unsigned long sampleIntervalMs) {
  noInterrupts();
  uint32_t pulses = state.pulseCount;
  state.pulseCount = 0;
  interrupts();

  if (pulses > 0) state.flujoRealDetectado = true;

  float sampleSeconds = sampleIntervalMs / 1000.0f;
  if (sampleSeconds <= 0.0f) sampleSeconds = 1.0f;

  float frequencyHz = pulses / sampleSeconds;
  float nuevoFlujo = frequencyHz / 7.5;
  float nuevaPresion = 0.0;

  if (s_bmpDisponible) {
    long presionPa = bmp.readPressure();
    if (presionPa > 0) {
      nuevaPresion = presionPa / 1000.0;
      state.sensorOK = true;
    } else {
      state.sensorOK = false;
    }
  } else {
    nuevaPresion = 0.0;
    state.sensorOK = false;
  }

  if (nuevoFlujo < 0.0) nuevoFlujo = 0.0;
  if (nuevoFlujo > 5.0) nuevoFlujo = 5.0;
  if (nuevaPresion < 0.0) nuevaPresion = 0.0;
  if (nuevaPresion > 115.0) nuevaPresion = 115.0;

  if (state.primeraLectura) {
    state.flujoLmin = nuevoFlujo;
    state.presionKPa = nuevaPresion;
    state.primeraLectura = false;
  } else {
    float deltaFlujo = nuevoFlujo - state.flujoLmin;
    float deltaPresion = nuevaPresion - state.presionKPa;
    float pesoNuevoFlujo = nuevoFlujo < state.flujoLmin ? 0.97f : 0.80f;
    float pesoNuevoPresion = nuevaPresion > state.presionKPa ? 0.97f : 0.80f;
    if (deltaPresion >= 1.5f) pesoNuevoPresion = 1.0f;
    if (deltaFlujo <= -0.8f) pesoNuevoFlujo = 1.0f;
    state.flujoLmin = state.flujoLmin * (1.0f - pesoNuevoFlujo) + nuevoFlujo * pesoNuevoFlujo;
    state.presionKPa = state.presionKPa * (1.0f - pesoNuevoPresion) + nuevaPresion * pesoNuevoPresion;
  }

  Serial.println("----- LECTURA -----");
  Serial.print("Pulsos: ");               Serial.println(pulses);
  Serial.print("Flujo real detectado: "); Serial.println(state.flujoRealDetectado ? "SI" : "NO");
  Serial.print("Flujo (L/min): ");        Serial.println(state.flujoLmin, 2);
  Serial.print("Presion (kPa): ");        Serial.println(state.presionKPa, 2);
  Serial.print("Sensor OK: ");            Serial.println(state.sensorOK ? "SI" : "NO");
}

// ===================== ACTUADORES =====================
static const int buzzerChannel = 0; // canal fijo para el buzzer

static void apagarBuzzer() {
  ledcWrite(buzzerChannel, 0);
}

static void encenderBuzzerContinuo() {
  ledcWrite(buzzerChannel, 128);
}

void initActuadores() {
  pinMode(flowPin, INPUT_PULLUP);
  pinMode(ledVerde, OUTPUT);
  pinMode(ledNaranja, OUTPUT);
  pinMode(ledRojo, OUTPUT);

  digitalWrite(ledVerde, LOW);
  digitalWrite(ledNaranja, LOW);
  digitalWrite(ledRojo, LOW);

  const int buzzerFreq = 1500;
  const int buzzerResolution = 8;

  // Configuración del buzzer mediante la API estándar
  ledcSetup(buzzerChannel, buzzerFreq, buzzerResolution);
  ledcAttachPin(buzzerPin, buzzerChannel);
  ledcWrite(buzzerChannel, 0);
  Serial.println("Buzzer OK");
}

void actualizarActuadores(SystemState &state, unsigned long &lastBlink) {
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

// ===================== LCD =====================
void initDisplay(LiquidCrystal_I2C &lcd, const SystemState &state) {
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Iniciando...");
  lcd.setCursor(0, 1);
  lcd.print("Sistema IoT");
  if (!state.sensorOK) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Error BMP180");
  }
  Serial.println("LCD OK");
}

void actualizarLCD(LiquidCrystal_I2C &lcd, const SystemState &state, unsigned long &lastLCDUpdate) {
  static int ultimoEstado = -1;
  static int ultimoRiesgo = -1;
  if ((int)state.estadoSistema == ultimoEstado &&
      state.nivelRiesgo == ultimoRiesgo &&
      millis() - lastLCDUpdate < 1500) {
    return;
  }
  ultimoEstado = (int)state.estadoSistema;
  ultimoRiesgo = state.nivelRiesgo;
  lastLCDUpdate = millis();
  lcd.clear();

  switch (state.estadoSistema) {
    case ESTADO_NORMAL:
      lcd.setCursor(0, 0);
      lcd.print("Estado:NORMAL");
      lcd.setCursor(0, 1);
      lcd.print("Q:");
      lcd.print(state.flujoLmin, 1);
      lcd.print(" P:");
      lcd.print(state.presionKPa, 0);
      break;
    case ESTADO_ALERTA:
      lcd.setCursor(0, 0);
      lcd.print("Estado:ALERTA");
      lcd.setCursor(0, 1);
      lcd.print("Riesgo:");
      lcd.print(state.nivelRiesgo);
      lcd.print("%");
      break;
    case ESTADO_FUGA:
      lcd.setCursor(0, 0);
      lcd.print("FUGA CONFIRMADA");
      lcd.setCursor(0, 1);
      lcd.print("Riesgo:");
      lcd.print(state.nivelRiesgo);
      lcd.print("%");
      break;
    case ESTADO_ERROR:
      lcd.setCursor(0, 0);
      lcd.print("ERROR SENSOR");
      lcd.setCursor(0, 1);
      lcd.print("Verifique BMP180");
      break;
  }
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

static bool parseWifiCommand(const String &cmd, String &outSsid, String &outPass) {
  // Formato: WIFI <SSID>|<PASSWORD>
  if (!cmd.startsWith("WIFI ")) return false;
  String body = cmd.substring(5);
  int sep = body.indexOf('|');
  if (sep <= 0) return false;
  outSsid = body.substring(0, sep);
  outPass = body.substring(sep + 1);
  outSsid.trim();
  outPass.trim();
  return outSsid.length() > 0;
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
  }
  if (pendingCommand.length() == 0) return;
  String rawCommand = pendingCommand;
  String command = pendingCommand;
  command.toUpperCase();

  if (command == "PING") {
    Serial.println("CMD:PONG");
  } else if (command == "STATUS") {
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
  } else if (command == "WIFI?") {
    Serial.print("CMD:WIFI SSID=");
    Serial.print(wifiSsidConfig);
    Serial.print(" PASS_LEN=");
    Serial.println(wifiPasswordConfig.length());
  } else if (command.startsWith("WIFI ")) {
    String newSsid;
    String newPass;
    if (parseWifiCommand(rawCommand, newSsid, newPass)) {
      wifiSsidConfig = newSsid;
      wifiPasswordConfig = newPass;
      saveWifiConfig();
      Serial.print("CMD:WIFI_UPDATE SSID=");
      Serial.println(wifiSsidConfig);
      Serial.println("Aplicando nueva red WiFi...");
      WiFi.disconnect(true);
      delay(300);
      conectarWiFi();
      if (wifiConectado()) {
        Serial.println("CMD:WIFI_CONNECTED");
      } else {
        Serial.println("CMD:WIFI_CONNECT_FAILED");
      }
    } else {
      Serial.println("CMD:WIFI_FORMAT_INVALID Usa: WIFI <SSID>|<PASSWORD>");
    }
  } else if (command == "HELP") {
    Serial.println("CMD:HELP PING | STATUS | WIFI? | WIFI <SSID>|<PASSWORD> | FORCE NORMAL|ALERTA|FUGA|ERROR|AUTO");
  } else if (command.startsWith("FORCE ")) {
    String arg = command.substring(6);
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

// ===================== SERIAL JSON =====================
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

// ===================== INTERRUPCION / SETUP / LOOP =====================
void IRAM_ATTR onPulse() {
  state.pulseCount++;
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println();
  Serial.println("Iniciando sistema...");
  loadWifiConfig();

  initActuadores();
  initSensores(bmp, state);
  initDisplay(lcd, state);

  attachInterrupt(digitalPinToInterrupt(flowPin), onPulse, RISING);
  Serial.println("Interrupcion OK");

  initWiFi();

  lastMeasure = millis();
  lastSend = millis();
  lastCommandPoll = millis();
  lastBlink = millis();

  Serial.println("Sistema listo");
  Serial.println("Comandos seriales: HELP, PING, STATUS, FORCE NORMAL|ALERTA|FUGA|ERROR|AUTO");
}

void loop() {
  unsigned long now = millis();

  handleCommands(state);

  if (now - lastMeasure >= SENSOR_READ_INTERVAL_MS) {
    unsigned long sampleIntervalMs = now - lastMeasure;
    readSensores(bmp, state, sampleIntervalMs);
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

    actualizarLCD(lcd, state, lastLCDUpdate);

    Serial.print("Estado: ");       Serial.println(estadoTexto(state.estadoSistema));
    Serial.print("Nivel riesgo: "); Serial.println(state.nivelRiesgo);
    Serial.print("Cnt alerta: ");   Serial.println(state.contadorAlerta);
    Serial.print("Cnt critico: ");  Serial.println(state.contadorCritico);
    printJsonEstado(state);
    Serial.println();

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
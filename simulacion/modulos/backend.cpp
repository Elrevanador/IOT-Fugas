#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <cstring>
#include "modulos/config.h"
#include "modulos/backend.h"
#include "modulos/wifi_mod.h"

#ifndef BACKEND_ALLOW_INSECURE_TLS
#define BACKEND_ALLOW_INSECURE_TLS 1
#endif

#ifndef BACKEND_ROOT_CA_PEM
#define BACKEND_ROOT_CA_PEM ""
#endif

// Backoff exponencial para reintentos.
static unsigned long s_backoffMs = 0;
static const unsigned long BACKOFF_MAX_MS = 30000;
static const unsigned long BACKOFF_BASE_MS = 1000;

String backendBaseUrl() {
  return BACKEND_MODE == BACKEND_PUBLIC ? String(BACKEND_BASE_URL_PUBLIC) : String(BACKEND_BASE_URL_LOCAL);
}

String backendReadingsUrl() {
  return backendBaseUrl() + "/api/readings";
}

String backendPendingCommandsUrl() {
  String url = backendBaseUrl() + "/api/commands/pending?";
  if (DEVICE_ID > 0) {
    url += "deviceId=" + String(DEVICE_ID);
  } else {
    url += "deviceName=" + String(DEVICE_NAME);
  }
  if (String(DEVICE_HARDWARE_UID).length() > 0) {
    url += "&hardwareUid=" + String(DEVICE_HARDWARE_UID);
  }
  return url;
}

String backendCommandResponseUrl(unsigned long commandId) {
  return backendBaseUrl() + "/api/commands/" + String(commandId) + "/response";
}

String backendModeTexto() {
  return BACKEND_MODE == BACKEND_PUBLIC ? "PUBLIC" : "LOCAL";
}

static bool backendUsaHttps(const String &url) {
  return url.startsWith("https://");
}

static void updateBackoff(bool success) {
  if (success) {
    s_backoffMs = 0;
  } else {
    if (s_backoffMs == 0) {
      s_backoffMs = BACKOFF_BASE_MS;
    } else {
      s_backoffMs = min(s_backoffMs * 2, BACKOFF_MAX_MS);
    }
  }
}

static bool shouldRetryHttpCode(int code) {
  // 429 Too Many Requests, 500 Internal, 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout
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

static bool beginBackendHttp(HTTPClient &http, WiFiClient &client, WiFiClientSecure &secureClient, const String &url, SystemState &state) {
  http.setTimeout(BACKEND_TIMEOUT_MS);

  if (backendUsaHttps(url)) {
#if BACKEND_ALLOW_INSECURE_TLS
    secureClient.setInsecure();
#else
    if (std::strlen(BACKEND_ROOT_CA_PEM) > 0) {
      secureClient.setCACert(BACKEND_ROOT_CA_PEM);
    } else {
      state.backendOnline = false;
      state.backendLastCode = -2;
      state.backendLastMsg = "TLS seguro requiere BACKEND_ROOT_CA_PEM";
      Serial.println("TLS seguro habilitado, pero falta BACKEND_ROOT_CA_PEM.");
      Serial.println("Define BACKEND_ROOT_CA_PEM o usa BACKEND_ALLOW_INSECURE_TLS=1 solo en desarrollo.");
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

  // Aplicar backoff si el backend ha estado fallando.
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
    if (needsComma) {
      payload += ",";
    }
    payload += fragment;
    needsComma = true;
  };

  if (DEVICE_ID > 0) {
    appendField("\"deviceId\":" + String(DEVICE_ID));
  }

  if (HOUSE_ID > 0) {
    appendField("\"houseId\":" + String(HOUSE_ID));
  }

  appendField("\"deviceName\":\"" + String(DEVICE_NAME) + "\"");

  if (String(DEVICE_TYPE).length() > 0) {
    appendField("\"deviceType\":\"" + String(DEVICE_TYPE) + "\"");
  }

  if (String(DEVICE_FIRMWARE_VERSION).length() > 0) {
    appendField("\"firmwareVersion\":\"" + String(DEVICE_FIRMWARE_VERSION) + "\"");
  }

  if (String(DEVICE_HARDWARE_UID).length() > 0) {
    appendField("\"hardwareUid\":\"" + String(DEVICE_HARDWARE_UID) + "\"");
  }

  if (SENSOR_ID > 0) {
    appendField("\"sensorId\":" + String(SENSOR_ID));
  }

  appendField("\"flow_lmin\":" + String(state.flujoLmin, 2));
  appendField("\"pressure_kpa\":" + String(state.presionKPa, 2));
  appendField("\"risk\":" + String(state.nivelRiesgo));
  appendField("\"state\":\"" + estadoTexto(state.estadoSistema) + "\"");
  payload += "}";

  Serial.println(">>> Enviando lectura al backend...");
  Serial.print("Transporte: ");
  Serial.println(backendUsaHttps(url) ? "HTTPS (Railway)" : "HTTP");
  Serial.println(url);
  Serial.print("deviceId="); Serial.println(DEVICE_ID);
  Serial.print("houseId="); Serial.println(HOUSE_ID);
  Serial.print("sensorId="); Serial.println(SENSOR_ID);
  Serial.print("deviceType="); Serial.println(DEVICE_TYPE);
  Serial.print("firmwareVersion="); Serial.println(DEVICE_FIRMWARE_VERSION);
  Serial.print("hardwareUid="); Serial.println(DEVICE_HARDWARE_UID);
  Serial.println(payload);

  if (!beginBackendHttp(http, client, secureClient, url, state)) {
    state.backendOnline = false;
    state.backendLastCode = -1;
    state.backendLastMsg = "No se pudo iniciar HTTP/HTTPS";
    Serial.println("No se pudo iniciar HTTP/HTTPS");
    updateBackoff(false);
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
      updateBackoff(true);
      Serial.print("Envios backend OK: ");
      Serial.println(state.backendEnvios);
    } else if (shouldRetryHttpCode(httpCode)) {
      updateBackoff(false);
      Serial.print("HTTP ");
      Serial.print(httpCode);
      Serial.print(" detectado. Backoff aumentado a ");
      Serial.print(s_backoffMs);
      Serial.println(" ms.");
    }
  } else {
    state.backendOnline = false;
    state.backendLastMsg = http.errorToString(httpCode);
    Serial.print("Error HTTP: ");
    Serial.println(http.errorToString(httpCode));
    updateBackoff(false);
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

static bool responderComandoBackend(SystemState &state, unsigned long commandId, const String &codigo, const String &mensaje) {
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
    if (needsComma) {
      payload += ",";
    }
    payload += fragment;
    needsComma = true;
  };

  if (DEVICE_ID > 0) {
    appendField("\"deviceId\":" + String(DEVICE_ID));
  }

  appendField("\"deviceName\":\"" + escapeJson(String(DEVICE_NAME)) + "\"");
  if (String(DEVICE_HARDWARE_UID).length() > 0) {
    appendField("\"hardwareUid\":\"" + escapeJson(String(DEVICE_HARDWARE_UID)) + "\"");
  }
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
  if (!asegurarWiFi()) {
    return;
  }

  WiFiClient client;
  WiFiClientSecure secureClient;
  HTTPClient http;
  String url = backendPendingCommandsUrl();

  if (!beginBackendHttp(http, client, secureClient, url, state)) {
    Serial.println("No se pudo iniciar HTTP para consultar comandos.");
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
    return;
  }

  String response = http.getString();
  http.end();

  JsonDocument doc;
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
    if (commandId == 0 || tipo.length() == 0) {
      continue;
    }

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
      delay(250);
      ESP.restart();
    }
  }
}

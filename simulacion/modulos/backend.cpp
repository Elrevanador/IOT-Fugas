#include <WiFiClient.h>
#include <HTTPClient.h>
#include "modulos/config.h"
#include "modulos/backend.h"
#include "modulos/wifi_mod.h"

String backendBaseUrl() {
  return BACKEND_MODE == BACKEND_PUBLIC ? String(BACKEND_BASE_URL_PUBLIC) : String(BACKEND_BASE_URL_LOCAL);
}

String backendReadingsUrl() {
  return backendBaseUrl() + "/api/readings";
}

String backendModeTexto() {
  return BACKEND_MODE == BACKEND_PUBLIC ? "PUBLIC" : "LOCAL";
}

void enviarBackend(SystemState &state) {
  if (!asegurarWiFi()) {
    state.backendOnline = false;
    state.backendLastCode = 0;
    state.backendLastMsg = "WiFi desconectado";
    Serial.println("Sin WiFi. No se envio al backend.");
    return;
  }

  WiFiClient client;
  HTTPClient http;
  http.setTimeout(5000);

  String url = backendReadingsUrl();
  String payload = "{";
  payload += "\"deviceName\":\"" + String(DEVICE_NAME) + "\",";
  payload += "\"flow_lmin\":" + String(state.flujoLmin, 2) + ",";
  payload += "\"pressure_kpa\":" + String(state.presionKPa, 2) + ",";
  payload += "\"risk\":" + String(state.nivelRiesgo) + ",";
  payload += "\"state\":\"" + estadoTexto(state.estadoSistema) + "\"";
  payload += "}";

  Serial.println(">>> Enviando lectura al backend...");
  Serial.println(url);
  Serial.println(payload);

  if (!http.begin(client, url)) {
    state.backendOnline = false;
    state.backendLastCode = -1;
    state.backendLastMsg = "No se pudo iniciar HTTP";
    Serial.println("No se pudo iniciar HTTP");
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
      Serial.print("Envios backend OK: ");
      Serial.println(state.backendEnvios);
    }
  } else {
    state.backendOnline = false;
    state.backendLastMsg = http.errorToString(httpCode);
    Serial.print("Error HTTP: ");
    Serial.println(http.errorToString(httpCode));
  }

  http.end();
}

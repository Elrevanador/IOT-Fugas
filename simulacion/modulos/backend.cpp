#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
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

String backendBaseUrl() {
  return BACKEND_MODE == BACKEND_PUBLIC ? String(BACKEND_BASE_URL_PUBLIC) : String(BACKEND_BASE_URL_LOCAL);
}

String backendReadingsUrl() {
  return backendBaseUrl() + "/api/readings";
}

String backendModeTexto() {
  return BACKEND_MODE == BACKEND_PUBLIC ? "PUBLIC" : "LOCAL";
}

static bool backendUsaHttps(const String &url) {
  return url.startsWith("https://");
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
  WiFiClientSecure secureClient;
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
  Serial.print("Transporte: ");
  Serial.println(backendUsaHttps(url) ? "HTTPS (Railway)" : "HTTP");
  Serial.println(url);
  Serial.println(payload);

  bool httpIniciado = false;
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
      return;
    }
#endif
    httpIniciado = http.begin(secureClient, url);
  } else {
    httpIniciado = http.begin(client, url);
  }

  if (!httpIniciado) {
    state.backendOnline = false;
    state.backendLastCode = -1;
    state.backendLastMsg = "No se pudo iniciar HTTP/HTTPS";
    Serial.println("No se pudo iniciar HTTP/HTTPS");
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

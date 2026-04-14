#include <Arduino.h>
#include <WiFi.h>
#include "modulos/config.h"
#include "modulos/backend.h"

static bool wifiConectado() {
  return WiFi.status() == WL_CONNECTED;
}

static String ipLocalTexto() {
  if (!wifiConectado()) return "";
  return WiFi.localIP().toString();
}

static void conectarWiFi() {
  Serial.print("Conectando a WiFi");
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password, 6);

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
  WiFi.begin(ssid, password);

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

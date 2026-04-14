#include <Arduino.h>
#include <Adafruit_BMP085.h>
#include <LiquidCrystal_I2C.h>

#include "modulos/config.h"
#include "modulos/estado.h"
#include "modulos/logica.h"
#include "modulos/wifi_mod.h"
#include "modulos/sensores.h"
#include "modulos/actuadores.h"
#include "modulos/display.h"
#include "modulos/backend.h"
#include "modulos/comandos.h"

// Nota: Arduino CLI no compila .cpp dentro de subcarpetas del sketch,
// por eso los incluimos explicitamente aqui.
#include "modulos/config.cpp"
#include "modulos/logica.cpp"
#include "modulos/wifi_mod.cpp"
#include "modulos/sensores.cpp"
#include "modulos/actuadores.cpp"
#include "modulos/display.cpp"
#include "modulos/backend.cpp"
#include "modulos/comandos.cpp"

// ---------------- Objetos ----------------
Adafruit_BMP085 bmp;
LiquidCrystal_I2C lcd(0x27, 16, 2);

// ---------------- Estado ----------------
SystemState state;

// ---------------- Temporizadores ----------------
unsigned long lastMeasure   = 0;
unsigned long lastSend      = 0;
unsigned long lastBlink     = 0;
unsigned long lastLCDUpdate = 0;

// Valores guardados para detectar cambios en la simulación
float lastReportedFlow     = -1.0;
float lastReportedPressure = -1.0;
int lastReportedRisk       = -1;
EstadoSistema lastReportedState = ESTADO_NORMAL;
bool lastReportedSensorOK  = true;

static void printJsonEstado(const SystemState &s) {
  Serial.print("{\"device\":\"");
  Serial.print(DEVICE_NAME);
  Serial.print("\",\"flow_lmin\":");
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
  Serial.println("}");
}

// ---------------- Interrupcion ----------------
void IRAM_ATTR onPulse() {
  state.pulseCount++;
}

// ---------------- Setup ----------------
void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println();
  Serial.println("Iniciando sistema...");

  initActuadores();
  initSensores(bmp, state);
  initDisplay(lcd, state);

  attachInterrupt(digitalPinToInterrupt(flowPin), onPulse, RISING);
  Serial.println("Interrupcion OK");

  initWiFi();

  lastMeasure = millis();
  lastSend    = millis();
  lastBlink   = millis();

  Serial.println("Sistema listo");
  Serial.println("Comandos seriales: HELP, PING, STATUS, FORCE NORMAL|ALERTA|FUGA|ERROR|AUTO");
}

// ---------------- Loop ----------------
void loop() {
  unsigned long now = millis();

  handleCommands(state);

  if (now - lastMeasure >= 2000) {
    readSensores(bmp, state);
    state.estadoSistema = evaluarEstado(
      state.flujoLmin,
      state.presionKPa,
      state.sensorOK,
      state.contadorAlerta,
      state.contadorCritico,
      state.nivelRiesgo
    );

    // Permite demostrar actuadores y cambios de estado desde monitor serial.
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
    lastReportedFlow = state.flujoLmin;
    lastReportedPressure = state.presionKPa;
    lastReportedRisk = state.nivelRiesgo;
    lastReportedState = state.estadoSistema;
    lastReportedSensorOK = state.sensorOK;
  }
}

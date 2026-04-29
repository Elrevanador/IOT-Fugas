#include <Arduino.h>
#include "modulos/comandos.h"

static String pendingCommand = "";
static bool forcedStateEnabled = false;
static EstadoSistema forcedStateValue = ESTADO_NORMAL;

static bool parseForcedState(const String &rawState, EstadoSistema &outState) {
  if (rawState == "NORMAL") {
    outState = ESTADO_NORMAL;
    return true;
  }
  if (rawState == "ALERTA") {
    outState = ESTADO_ALERTA;
    return true;
  }
  if (rawState == "FUGA") {
    outState = ESTADO_FUGA;
    return true;
  }
  if (rawState == "ERROR") {
    outState = ESTADO_ERROR;
    return true;
  }
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

  if (pendingCommand.length() == 0) {
    return;
  }

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
    Serial.println("CMD:HELP PING | STATUS | FORCE NORMAL|ALERTA|FUGA|ERROR|AUTO");
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

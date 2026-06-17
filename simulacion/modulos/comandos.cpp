#include <Arduino.h>
#include "modulos/comandos.h"

static String pendingCommand = "";

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
    Serial.print(state.sistemaEncendido ? "ENCENDIDO " : "APAGADO ");
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
    Serial.println("CMD:HELP PING | STATUS");
  } else {
    Serial.println("CMD:UNKNOWN");
  }

  pendingCommand = "";
}

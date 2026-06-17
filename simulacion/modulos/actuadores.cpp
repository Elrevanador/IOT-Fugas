#include <Arduino.h>
#include "modulos/config.h"
#include "modulos/actuadores.h"

static void apagarBuzzer() {
  ledcWrite(buzzerPin, 0);
}

static void encenderBuzzerContinuo() {
  ledcChangeFrequency(buzzerPin, 1050, 8);
  ledcWrite(buzzerPin, 120);
}

static void encenderBuzzerError() {
  ledcChangeFrequency(buzzerPin, 650, 8);
  ledcWrite(buzzerPin, 90);
}

void initActuadores() {
  pinMode(flowPin, INPUT);
  pinMode(buttonPin, INPUT_PULLUP);
  pinMode(ledAzul, OUTPUT);
  pinMode(ledVerde, OUTPUT);
  pinMode(ledNaranja, OUTPUT);
  pinMode(ledRojo, OUTPUT);
  pinMode(relayPin, OUTPUT);
  pinMode(valveIndicatorPin, OUTPUT);

  digitalWrite(ledAzul, LOW);
  digitalWrite(ledVerde, LOW);
  digitalWrite(ledNaranja, LOW);
  digitalWrite(ledRojo, LOW);
  digitalWrite(relayPin, LOW);
  digitalWrite(valveIndicatorPin, LOW);

  const int buzzerFreq = 1050;
  const int buzzerResolution = 8;

  if (!ledcAttach(buzzerPin, buzzerFreq, buzzerResolution)) {
    Serial.println("Error al configurar buzzer");
  } else {
    Serial.println("Buzzer OK");
  }
  ledcWrite(buzzerPin, 0);
}

bool actualizarBotonEncendido(SystemState &state) {
  static bool lastReading = HIGH;
  static bool stableButtonState = HIGH;
  static unsigned long lastDebounce = 0;
  bool cambioEstado = false;

  bool reading = digitalRead(buttonPin);
  if (reading != lastReading) {
    lastDebounce = millis();
    lastReading = reading;
  }

  if (millis() - lastDebounce > 60 && reading != stableButtonState) {
    stableButtonState = reading;
    if (stableButtonState == LOW) {
      state.sistemaEncendido = !state.sistemaEncendido;
      cambioEstado = true;
      state.pulseCount = 0;
      state.contadorAlerta = 0;
      state.contadorCritico = 0;

      if (!state.sistemaEncendido) {
        state.valvulaAbierta = false;
        state.backendOnline = false;
      } else {
        state.primeraLectura = true;
        state.estadoSistema = ESTADO_NORMAL;
        state.nivelRiesgo = 0;
      }

      Serial.print("Pulsador: sistema ");
      Serial.println(state.sistemaEncendido ? "ENCENDIDO" : "APAGADO");
    }
  }

  return cambioEstado;
}

void actualizarActuadores(SystemState &state, unsigned long &lastBlink) {
  if (!state.sistemaEncendido) {
    state.valvulaAbierta = false;
    apagarBuzzer();
    digitalWrite(ledVerde, LOW);
    digitalWrite(ledNaranja, LOW);
    digitalWrite(ledRojo, LOW);
    digitalWrite(relayPin, LOW);
    digitalWrite(valveIndicatorPin, LOW);
    return;
  }

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
      encenderBuzzerError();
      digitalWrite(ledVerde, LOW);
      digitalWrite(ledNaranja, LOW);
      digitalWrite(ledRojo, LOW);
      break;
  }
}

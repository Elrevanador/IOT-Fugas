#include <Arduino.h>
#include "modulos/config.h"
#include "modulos/actuadores.h"

static void apagarBuzzer() {
  ledcWrite(buzzerPin, 0);
}

static void encenderBuzzerContinuo() {
  ledcWrite(buzzerPin, 128);
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

  if (!ledcAttach(buzzerPin, buzzerFreq, buzzerResolution)) {
    Serial.println("Error al configurar buzzer");
  } else {
    Serial.println("Buzzer OK");
  }
  ledcWrite(buzzerPin, 0);
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

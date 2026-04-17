#include <Arduino.h>
#include <Wire.h>
#include "modulos/config.h"
#include "modulos/sensores.h"

void initSensores(Adafruit_BMP085 &bmp, SystemState &state) {
  Wire.begin(21, 22);
  Serial.println("I2C OK");

  if (!bmp.begin()) {
    state.sensorOK = false;
    Serial.println("Error BMP180");
  } else {
    Serial.println("BMP180 OK");
  }

}

void readSensores(Adafruit_BMP085 &bmp, SystemState &state, unsigned long sampleIntervalMs) {
  noInterrupts();
  uint32_t pulses = state.pulseCount;
  state.pulseCount = 0;
  interrupts();

  if (pulses > 0) {
    state.flujoRealDetectado = true;
  }

  long presionPa = bmp.readPressure();

  float sampleSeconds = sampleIntervalMs / 1000.0f;
  if (sampleSeconds <= 0.0f) {
    sampleSeconds = 1.0f;
  }

  float frequencyHz = pulses / sampleSeconds;
  float nuevoFlujo = frequencyHz / 7.5;
  float nuevaPresion = 0.0;

  if (presionPa > 0) {
    nuevaPresion = presionPa / 1000.0;
    state.sensorOK = true;
  } else {
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
    // Hacemos el suavizado asimetrico:
    // cuando el sistema parece recuperarse, priorizamos mucho mas la lectura nueva
    // para que cambios manuales de presion/flujo se reflejen casi de inmediato.
    float deltaFlujo = nuevoFlujo - state.flujoLmin;
    float deltaPresion = nuevaPresion - state.presionKPa;

    float pesoNuevoFlujo = nuevoFlujo < state.flujoLmin ? 0.97f : 0.80f;
    float pesoNuevoPresion = nuevaPresion > state.presionKPa ? 0.97f : 0.80f;

    // Si hay una recuperacion marcada, aplicamos casi un "snap" al valor nuevo.
    if (deltaPresion >= 1.5f) {
      pesoNuevoPresion = 1.0f;
    }
    if (deltaFlujo <= -0.8f) {
      pesoNuevoFlujo = 1.0f;
    }

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

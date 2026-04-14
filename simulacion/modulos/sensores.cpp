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

void readSensores(Adafruit_BMP085 &bmp, SystemState &state) {
  noInterrupts();
  uint32_t pulses = state.pulseCount;
  state.pulseCount = 0;
  interrupts();

  if (pulses > 0) {
    state.flujoRealDetectado = true;
  }

  long presionPa = bmp.readPressure();

  float frequencyHz = pulses / 2.0;
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
    state.flujoLmin  = state.flujoLmin * 0.40 + nuevoFlujo * 0.60;
    state.presionKPa = state.presionKPa * 0.40 + nuevaPresion * 0.60;
  }

  Serial.println("----- LECTURA -----");
  Serial.print("Pulsos: ");               Serial.println(pulses);
  Serial.print("Flujo real detectado: "); Serial.println(state.flujoRealDetectado ? "SI" : "NO");
  Serial.print("Flujo (L/min): ");        Serial.println(state.flujoLmin, 2);
  Serial.print("Presion (kPa): ");        Serial.println(state.presionKPa, 2);
  Serial.print("Sensor OK: ");            Serial.println(state.sensorOK ? "SI" : "NO");
}

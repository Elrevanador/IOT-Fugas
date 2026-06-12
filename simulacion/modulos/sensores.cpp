#include <Arduino.h>
#include "modulos/config.h"
#include "modulos/sensores.h"

static float limitarPresion(float valor, float minimo, float maximo) {
  if (valor < minimo) return minimo;
  if (valor > maximo) return maximo;
  return valor;
}

static int leerAdcPromediado(int pin, int muestras, unsigned int pausaUs) {
  long suma = 0;
  for (int i = 0; i < muestras; i++) {
    suma += analogRead(pin);
    delayMicroseconds(pausaUs);
  }
  return (int)(suma / muestras);
}

static float calcularPresionVirtualPorFlujo(float flujoLmin) {
  float ratioFuga = limitarPresion(
    (flujoLmin - DEMO_FLUJO_NORMAL_LMIN) /
    (DEMO_FLUJO_FUGA_LMIN - DEMO_FLUJO_NORMAL_LMIN),
    0.0f,
    1.0f
  );
  float presion = DEMO_PRESION_VIRTUAL_MAX_KPA -
                  ratioFuga * (DEMO_PRESION_VIRTUAL_MAX_KPA - DEMO_PRESION_VIRTUAL_MIN_KPA);
  float ondulacion = sin(millis() / 700.0f) * 0.6f;

  if (flujoLmin <= 0.15f) {
    presion = DEMO_PRESION_VIRTUAL_MAX_KPA + ondulacion;
  } else {
    presion += ondulacion;
  }

  return limitarPresion(presion, DEMO_PRESION_VIRTUAL_MIN_KPA, DEMO_PRESION_VIRTUAL_MAX_KPA);
}

static void aplicarLecturaSuavizada(SystemState &state, float nuevoFlujo, float nuevaPresion) {
  if (nuevoFlujo < 0.0f) nuevoFlujo = 0.0f;
  if (nuevoFlujo > 15.0f) nuevoFlujo = 15.0f;
  if (nuevaPresion < 0.0f) nuevaPresion = 0.0f;
  if (nuevaPresion > 690.0f) nuevaPresion = 690.0f;

  if (state.primeraLectura) {
    state.flujoLmin = nuevoFlujo;
    state.presionKPa = nuevaPresion;
    state.primeraLectura = false;
    return;
  }

  float deltaFlujo = nuevoFlujo - state.flujoLmin;
  float deltaPresion = nuevaPresion - state.presionKPa;

  float pesoNuevoFlujo = 0.95f;
  float pesoNuevoPresion = 0.95f;

  // En demo, los controles manuales deben reflejarse casi de inmediato.
  if (abs(deltaPresion) >= 20.0f) {
    pesoNuevoPresion = 1.0f;
  }
  if (abs(deltaFlujo) >= 0.5f) {
    pesoNuevoFlujo = 1.0f;
  }

  state.flujoLmin = state.flujoLmin * (1.0f - pesoNuevoFlujo) + nuevoFlujo * pesoNuevoFlujo;
  state.presionKPa = state.presionKPa * (1.0f - pesoNuevoPresion) + nuevaPresion * pesoNuevoPresion;
}

void initSensores(SystemState &state) {
  pinMode(flowControlPin, INPUT);
  pinMode(pressurePin, INPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(flowControlPin, ADC_11db);
  analogSetPinAttenuation(pressurePin, ADC_11db);
  state.sensorOK = true;
  Serial.println("Transductor 100 PSI OK");
  Serial.println("Control analogico de caudal OK");
}

void readSensores(SystemState &state, unsigned long sampleIntervalMs) {
  noInterrupts();
  uint32_t pulses = state.pulseCount;
  state.pulseCount = 0;
  interrupts();

  if (pulses > 0) {
    state.flujoRealDetectado = true;
  }

  float sampleSeconds = sampleIntervalMs / 1000.0f;
  if (sampleSeconds <= 0.0f) {
    sampleSeconds = 1.0f;
  }

  float frequencyHz = pulses / sampleSeconds;
  float flujoPorPulsos = frequencyHz / 7.5;
  int rawFlowControl = analogRead(flowControlPin);
  int flowControlPercent = (int)((rawFlowControl * 100L) / 4095L);
  float flujoPorControl = (rawFlowControl / 4095.0f) * 5.0f;
  float nuevoFlujo = max(flujoPorPulsos, flujoPorControl);
  int rawPressure = leerAdcPromediado(pressurePin, 20, 200);
  float adcVoltage = (rawPressure / 4095.0f) * 3.3f;
  float sensorVoltage = adcVoltage * PRESSURE_DIVIDER_FACTOR;
  int pressurePercent = (int)((rawPressure * 100L) / 4095L);
  float pressureRatio = (sensorVoltage - PRESSURE_SENSOR_MIN_V) /
                        (PRESSURE_SENSOR_MAX_V - PRESSURE_SENSOR_MIN_V);
  float pressurePsi = limitarPresion(pressureRatio, 0.0f, 1.0f) * PRESSURE_SENSOR_MAX_PSI;
  if (pressurePsi < PRESSURE_DEAD_ZONE_PSI) {
    pressurePsi = 0.0f;
  }
  float presionRealKPa = pressurePsi * 6.89476f;
  float presionVirtualKPa = calcularPresionVirtualPorFlujo(nuevoFlujo);
  float nuevaPresion = DEMO_PRESION_VIRTUAL_DESDE_FLUJO ? presionVirtualKPa : presionRealKPa;

  state.sensorOK = DEMO_PRESION_VIRTUAL_DESDE_FLUJO ||
                   (sensorVoltage >= (PRESSURE_SENSOR_MIN_V - 0.05f) &&
                    sensorVoltage <= (PRESSURE_SENSOR_MAX_V + 0.05f));

  aplicarLecturaSuavizada(state, nuevoFlujo, nuevaPresion);

  Serial.println("----- LECTURA -----");
  Serial.print("Pulsos: ");               Serial.println(pulses);
  Serial.print("Pot caudal (%): ");       Serial.println(flowControlPercent);
  Serial.print("Flujo pulsos (L/min): "); Serial.println(flujoPorPulsos, 2);
  Serial.print("Flujo control (L/min): "); Serial.println(flujoPorControl, 2);
  Serial.print("ADC presion: ");          Serial.println(rawPressure);
  Serial.print("Pot presion (%): ");      Serial.println(pressurePercent);
  Serial.print("V transductor: ");        Serial.println(sensorVoltage, 2);
  Serial.print("Presion (PSI): ");        Serial.println(pressurePsi, 2);
  Serial.print("Presion virtual (kPa): "); Serial.println(presionVirtualKPa, 2);
  Serial.print("Flujo real detectado: "); Serial.println(state.flujoRealDetectado ? "SI" : "NO");
  Serial.print("Flujo (L/min): ");        Serial.println(state.flujoLmin, 2);
  Serial.print("Presion (kPa): ");        Serial.println(state.presionKPa, 2);
  Serial.print("Sensor OK: ");            Serial.println(state.sensorOK ? "SI" : "NO");
}

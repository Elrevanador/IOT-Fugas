#ifndef LOGICA_H
#define LOGICA_H

#include <Arduino.h>

enum EstadoSistema {
  ESTADO_NORMAL = 0,
  ESTADO_ALERTA = 1,
  ESTADO_FUGA   = 2,
  ESTADO_ERROR  = 3
};

#ifndef DEMO_SENSIBLE
#define DEMO_SENSIBLE 1
#endif

const float UMBRAL_ALERTA_FLUJO_IN = DEMO_SENSIBLE ? 10.0 : 1.0;
const float UMBRAL_ALERTA_PRES_IN  = DEMO_SENSIBLE ? 35.0 : 250.0;
const float UMBRAL_CRITICO_FLUJO = DEMO_SENSIBLE ? 13.0 : 2.2;
const float UMBRAL_CRITICO_PRES  = DEMO_SENSIBLE ? 12.0 : 180.0;
const float UMBRAL_NORMAL_FLUJO_OUT = DEMO_SENSIBLE ? 9.5 : 0.85;
const float UMBRAL_NORMAL_PRES_OUT  = DEMO_SENSIBLE ? 45.0 : 280.0;
const float PRESION_RECUPERACION_NORMAL = DEMO_SENSIBLE ? 45.0 : 290.0;
const float UMBRAL_SIN_PASO_FLUJO_MAX = DEMO_SENSIBLE ? 0.15 : 0.05;
const float UMBRAL_SIN_PASO_PRES_MIN = DEMO_SENSIBLE ? 20.0 : 320.0;
const int LECTURAS_SIN_FLUJO_REQUERIDAS = DEMO_SENSIBLE ? 3 : 6;
const int LECTURAS_ALERTA_REQUERIDAS   = 1;
const int LECTURAS_CRITICAS_REQUERIDAS = 1;

String estadoTexto(EstadoSistema estado);
int calcularRiesgoContinuo(float flujo, float presion, bool sensorOK);
EstadoSistema evaluarEstado(
  float flujoLmin,
  float presionKPa,
  bool sensorOK,
  int &contadorAlerta,
  int &contadorCritico,
  int &nivelRiesgo
);

#endif

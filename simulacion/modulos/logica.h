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

const float UMBRAL_ALERTA_FLUJO_IN = DEMO_SENSIBLE ? 4.5 : 1.0;
const float UMBRAL_ALERTA_PRES_IN  = DEMO_SENSIBLE ? 18.0 : 250.0;
const float UMBRAL_CRITICO_FLUJO = DEMO_SENSIBLE ? 7.0 : 2.2;
const float UMBRAL_CRITICO_PRES  = DEMO_SENSIBLE ? 12.0 : 180.0;
const float UMBRAL_NORMAL_FLUJO_OUT = DEMO_SENSIBLE ? 3.8 : 0.85;
const float UMBRAL_NORMAL_PRES_OUT  = DEMO_SENSIBLE ? 20.0 : 280.0;
const float PRESION_RECUPERACION_NORMAL = DEMO_SENSIBLE ? 20.0 : 290.0;
const float UMBRAL_REPOSO_FLUJO_DEMO_MAX = DEMO_SENSIBLE ? 1.2 : 0.0;
const float UMBRAL_REPOSO_PRES_DEMO_MIN = DEMO_SENSIBLE ? 15.0 : 0.0;
const float UMBRAL_SIN_PASO_FLUJO_MAX = DEMO_SENSIBLE ? 0.15 : 0.05;
const float UMBRAL_SIN_PASO_PRES_MIN = DEMO_SENSIBLE ? 20.0 : 320.0;
const int LECTURAS_SIN_FLUJO_REQUERIDAS = DEMO_SENSIBLE ? 3 : 6;
const int LECTURAS_ALERTA_REQUERIDAS   = 1;
const int LECTURAS_CRITICAS_REQUERIDAS = DEMO_SENSIBLE ? 6 : 3;

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

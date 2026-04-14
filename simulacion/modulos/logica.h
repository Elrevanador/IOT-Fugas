#ifndef LOGICA_H
#define LOGICA_H

#include <Arduino.h>

enum EstadoSistema {
  ESTADO_NORMAL = 0,
  ESTADO_ALERTA = 1,
  ESTADO_FUGA   = 2,
  ESTADO_ERROR  = 3
};

const float UMBRAL_ALERTA_FLUJO_IN = 1.0;
const float UMBRAL_ALERTA_PRES_IN  = 101.5;
const float UMBRAL_CRITICO_FLUJO = 2.2;
const float UMBRAL_CRITICO_PRES  = 99.0;
const float UMBRAL_NORMAL_FLUJO_OUT = 0.85;
const float UMBRAL_NORMAL_PRES_OUT  = 101.0;
const float PRESION_RECUPERACION_NORMAL = 101.5;
const int LECTURAS_ALERTA_REQUERIDAS   = 2;
const int LECTURAS_CRITICAS_REQUERIDAS = 2;

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

#ifndef ESTADO_H
#define ESTADO_H

#include <Arduino.h>
#include "modulos/logica.h"

struct SystemState {
  volatile uint32_t pulseCount = 0;
  float flujoLmin   = 0.0;
  float presionKPa  = 0.0;
  bool sensorOK           = true;
  bool ledBlinkState      = false;
  bool primeraLectura     = true;
  bool flujoRealDetectado = false;
  uint32_t backendEnvios = 0;
  int backendLastCode = 0;
  bool backendOnline = false;
  String backendLastMsg = "Sin intentos";
  int contadorAlerta  = 0;
  int contadorCritico = 0;
  int nivelRiesgo     = 20;
  EstadoSistema estadoSistema = ESTADO_NORMAL;
};

#endif

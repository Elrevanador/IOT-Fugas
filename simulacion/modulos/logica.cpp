#include <Arduino.h>
#include "modulos/logica.h"

static float limitarFloat(float valor, float minimo, float maximo) {
  if (valor < minimo) return minimo;
  if (valor > maximo) return maximo;
  return valor;
}

String estadoTexto(EstadoSistema estado) {
  switch (estado) {
    case ESTADO_NORMAL: return "NORMAL";
    case ESTADO_ALERTA: return "ALERTA";
    case ESTADO_FUGA:   return "FUGA";
    case ESTADO_ERROR:  return "ERROR";
    default: return "DESCONOCIDO";
  }
}

int calcularRiesgoContinuo(float flujo, float presion, bool sensorOK) {
  float scoreFlujo = limitarFloat((flujo - 0.6) / (2.8 - 0.6), 0.0, 1.0);
  float scorePres  = limitarFloat((300.0 - presion) / (300.0 - 170.0), 0.0, 1.0);

  float riesgo = (scoreFlujo * 0.55 + scorePres * 0.45) * 100.0;

  if (!sensorOK) return 5;
  return (int)limitarFloat(riesgo, 0.0, 100.0);
}

EstadoSistema evaluarEstado(
  float flujoLmin,
  float presionKPa,
  bool sensorOK,
  int &contadorAlerta,
  int &contadorCritico,
  int &nivelRiesgo
) {
  nivelRiesgo = calcularRiesgoContinuo(flujoLmin, presionKPa, sensorOK);

  if (!sensorOK) {
    contadorAlerta = 0;
    contadorCritico = 0;
    nivelRiesgo = 5;
    return ESTADO_ERROR;
  }

  bool flujoAnomalo = flujoLmin >= UMBRAL_ALERTA_FLUJO_IN;
  bool flujoCritico = flujoLmin >= UMBRAL_CRITICO_FLUJO;
  bool presionBaja = presionKPa <= UMBRAL_ALERTA_PRES_IN;
  bool presionCritica = presionKPa <= UMBRAL_CRITICO_PRES;

  // Recuperacion rapida: solo volvemos a NORMAL cuando presion y flujo estan sanos.
  if (presionKPa >= PRESION_RECUPERACION_NORMAL &&
      flujoLmin <= UMBRAL_NORMAL_FLUJO_OUT) {
    contadorAlerta = 0;
    contadorCritico = 0;
    nivelRiesgo = min(nivelRiesgo, 15);
    return ESTADO_NORMAL;
  }

  bool condicionCritica =
    (flujoCritico && presionBaja) ||
    (flujoAnomalo && presionCritica);

  bool condicionAlerta =
    flujoAnomalo ||
    presionBaja ||
    (nivelRiesgo >= 35);

  bool condicionNormal =
    (flujoLmin <= UMBRAL_NORMAL_FLUJO_OUT &&
     presionKPa >= UMBRAL_NORMAL_PRES_OUT &&
     nivelRiesgo < 35);

  if (condicionCritica) {
    contadorCritico = min(contadorCritico + 1, 10);
    contadorAlerta  = min(contadorAlerta + 1, 10);

    if (contadorCritico >= LECTURAS_CRITICAS_REQUERIDAS) {
      return ESTADO_FUGA;
    }
    return ESTADO_ALERTA;
  }

  if (condicionAlerta) {
    contadorAlerta = min(contadorAlerta + 1, 10);
    contadorCritico = max(contadorCritico - 1, 0);

    if (contadorAlerta >= LECTURAS_ALERTA_REQUERIDAS) {
      return ESTADO_ALERTA;
    }
    return ESTADO_NORMAL;
  }

  if (condicionNormal) {
    contadorAlerta = 0;
    contadorCritico = 0;
    nivelRiesgo = min(nivelRiesgo, 20);
    return ESTADO_NORMAL;
  }

  contadorAlerta  = max(contadorAlerta - 1, 0);
  contadorCritico = max(contadorCritico - 1, 0);

  if (contadorCritico >= LECTURAS_CRITICAS_REQUERIDAS) {
    return ESTADO_FUGA;
  }
  if (contadorAlerta >= 1) {
    return ESTADO_ALERTA;
  }
  return ESTADO_NORMAL;
}

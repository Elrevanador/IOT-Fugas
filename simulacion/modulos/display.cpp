#include <Arduino.h>
#include "modulos/display.h"

void initDisplay(LiquidCrystal_I2C &lcd, const SystemState &state) {
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Iniciando...");
  lcd.setCursor(0, 1);
  lcd.print("Sistema IoT");

  if (!state.sensorOK) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Error BMP180");
  }

  Serial.println("LCD OK");
}

void actualizarLCD(LiquidCrystal_I2C &lcd, const SystemState &state, unsigned long &lastLCDUpdate) {
  static int ultimoEstado = -1;
  static int ultimoRiesgo = -1;

  if ((int)state.estadoSistema == ultimoEstado &&
      state.nivelRiesgo == ultimoRiesgo &&
      millis() - lastLCDUpdate < 1500) {
    return;
  }

  ultimoEstado = (int)state.estadoSistema;
  ultimoRiesgo = state.nivelRiesgo;
  lastLCDUpdate = millis();

  lcd.clear();

  switch (state.estadoSistema) {
    case ESTADO_NORMAL:
      lcd.setCursor(0, 0);
      lcd.print("Estado:NORMAL");
      lcd.setCursor(0, 1);
      lcd.print("Q:");
      lcd.print(state.flujoLmin, 1);
      lcd.print(" P:");
      lcd.print(state.presionKPa, 0);
      break;

    case ESTADO_ALERTA:
      lcd.setCursor(0, 0);
      lcd.print("Estado:ALERTA");
      lcd.setCursor(0, 1);
      lcd.print("Riesgo:");
      lcd.print(state.nivelRiesgo);
      lcd.print("%");
      break;

    case ESTADO_FUGA:
      lcd.setCursor(0, 0);
      lcd.print("FUGA CONFIRMADA");
      lcd.setCursor(0, 1);
      lcd.print("Riesgo:");
      lcd.print(state.nivelRiesgo);
      lcd.print("%");
      break;

    case ESTADO_ERROR:
      lcd.setCursor(0, 0);
      lcd.print("ERROR SENSOR");
      lcd.setCursor(0, 1);
      lcd.print("Verifique BMP180");
      break;
  }
}

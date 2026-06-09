#include <Arduino.h>
#include <Wire.h>
#include "modulos/display.h"

void initDisplay(Adafruit_SSD1306 &display, const SystemState &state) {
  Wire.begin(21, 22);
  Wire.setClock(100000);

  // Address 0x3C is standard for 128x64 SSD1306 OLED
  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("Fallo al iniciar SSD1306");
    return;
  }

  display.ssd1306_command(SSD1306_DISPLAYOFF);
  display.ssd1306_command(SSD1306_SETDISPLAYOFFSET);
  display.ssd1306_command(0x00);
  display.ssd1306_command(SSD1306_SETSTARTLINE | 0x00);
  display.ssd1306_command(SSD1306_SEGREMAP | 0x01);
  display.ssd1306_command(SSD1306_COMSCANDEC);
  display.ssd1306_command(SSD1306_DISPLAYON);
  
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(10, 10);
  display.print("Iniciando...");
  display.setCursor(10, 30);
  display.print("Sistema IoT v1.0");
  
  if (!state.sensorOK) {
    display.clearDisplay();
    display.setCursor(0, 10);
    display.print("Error de Presion");
    display.setCursor(0, 30);
    display.print("Verificar sensor!");
  }
  display.display();
  Serial.println("OLED OK");
}

void actualizarOLED(Adafruit_SSD1306 &display, const SystemState &state, unsigned long &lastDisplayUpdate) {
  static int ultimoEstado = -1;
  static int ultimoRiesgo = -1;
  static int ultimoFlujo10 = -1;
  static int ultimaPresion = -1;
  static bool ultimoBackendOnline = false;
  static bool ultimaValvula = false;

  int flujo10 = (int)(state.flujoLmin * 10.0f);
  int presion = (int)(state.presionKPa + 0.5f);

  if ((int)state.estadoSistema == ultimoEstado &&
      state.nivelRiesgo == ultimoRiesgo &&
      flujo10 == ultimoFlujo10 &&
      presion == ultimaPresion &&
      state.backendOnline == ultimoBackendOnline &&
      state.valvulaAbierta == ultimaValvula &&
      millis() - lastDisplayUpdate < 500) {
    return;
  }

  ultimoEstado = (int)state.estadoSistema;
  ultimoRiesgo = state.nivelRiesgo;
  ultimoFlujo10 = flujo10;
  ultimaPresion = presion;
  ultimoBackendOnline = state.backendOnline;
  ultimaValvula = state.valvulaAbierta;
  lastDisplayUpdate = millis();

  display.clearDisplay();

  // Dibujar un borde o linea de cabecera
  display.drawRect(0, 0, 128, 64, SSD1306_WHITE);
  display.drawLine(0, 14, 128, 14, SSD1306_WHITE);

  // Cabecera: Nombre o Estado
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  
  display.setCursor(5, 4);
  switch (state.estadoSistema) {
    case ESTADO_NORMAL:
      display.print("SISTEMA: NORMAL");
      break;
    case ESTADO_ALERTA:
      display.print("SISTEMA: ALERTA");
      break;
    case ESTADO_FUGA:
      display.print("SISTEMA: !FUGA!");
      break;
    case ESTADO_ERROR:
      display.print("SISTEMA: ERROR");
      break;
  }

  // Indicador de Cloud/Conexion
  display.setCursor(98, 4);
  if (state.backendOnline) {
    display.print("ON");
  } else {
    display.print("OFF");
  }

  // Contenido de mediciones
  display.setCursor(8, 20);
  display.print("Flujo: ");
  display.print(state.flujoLmin, 1);
  display.print(" L/min");

  display.setCursor(8, 31);
  display.print("Pres.: ");
  display.print(state.presionKPa, 0);
  display.print(" kPa");

  display.setCursor(8, 42);
  display.print("Riesgo: ");
  display.print(state.nivelRiesgo);
  display.print("%");

  // Estado de la electroválvula
  display.setCursor(8, 53);
  display.print("Valvula: ");
  if (state.valvulaAbierta) {
    display.print("ABIERTA");
  } else {
    display.print("CERRADA");
  }

  display.display();
}

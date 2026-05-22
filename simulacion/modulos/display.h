#ifndef DISPLAY_H
#define DISPLAY_H

#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "modulos/estado.h"

void initDisplay(Adafruit_SSD1306 &display, const SystemState &state);
void actualizarOLED(Adafruit_SSD1306 &display, const SystemState &state, unsigned long &lastDisplayUpdate);

#endif


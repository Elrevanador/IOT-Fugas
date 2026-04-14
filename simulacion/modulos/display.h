#ifndef DISPLAY_H
#define DISPLAY_H

#include <LiquidCrystal_I2C.h>
#include "modulos/estado.h"

void initDisplay(LiquidCrystal_I2C &lcd, const SystemState &state);
void actualizarLCD(LiquidCrystal_I2C &lcd, const SystemState &state, unsigned long &lastLCDUpdate);

#endif

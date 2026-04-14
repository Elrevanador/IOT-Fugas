#ifndef SENSORES_H
#define SENSORES_H

#include <Adafruit_BMP085.h>
#include "modulos/estado.h"

void initSensores(Adafruit_BMP085 &bmp, SystemState &state);
void readSensores(Adafruit_BMP085 &bmp, SystemState &state);

#endif

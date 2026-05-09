#ifndef SENSORES_H
#define SENSORES_H

#include "modulos/estado.h"

void initSensores(SystemState &state);
void readSensores(SystemState &state, unsigned long sampleIntervalMs);

#endif

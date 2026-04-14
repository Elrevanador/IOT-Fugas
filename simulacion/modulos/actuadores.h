#ifndef ACTUADORES_H
#define ACTUADORES_H

#include "modulos/estado.h"

void initActuadores();
void actualizarActuadores(SystemState &state, unsigned long &lastBlink);

#endif

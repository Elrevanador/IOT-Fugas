#ifndef ACTUADORES_H
#define ACTUADORES_H

#include "modulos/estado.h"

void initActuadores();
bool actualizarBotonEncendido(SystemState &state);
void actualizarActuadores(SystemState &state, unsigned long &lastBlink);

#endif

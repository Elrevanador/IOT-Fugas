#ifndef COMANDOS_H
#define COMANDOS_H

#include "modulos/estado.h"

void handleCommands(SystemState &state);
bool commandHasForcedState();
EstadoSistema commandForcedState();

#endif

#ifndef BACKEND_H
#define BACKEND_H

#include <Arduino.h>
#include "modulos/estado.h"

String backendBaseUrl();
String backendReadingsUrl();
String backendModeTexto();

void enviarBackend(SystemState &state);
void consultarComandosBackend(SystemState &state);

#endif

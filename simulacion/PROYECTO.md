# Paso 1. Definir el proyecto

- **Nombre del proyecto:** Monitoreo de fugas de agua con ESP32
- **Problema que busca resolver:** detectar fugas y condiciones anómalas de flujo/presión en tiempo real.
- **Sensores:** YF-S201 (flujo), BMP180 (presión).
- **Actuadores:** LEDs de estado, buzzer y LCD.
- **Dato a enviar a internet:** flujo (L/min), presión (kPa), riesgo (%) y estado (NORMAL/ALERTA/FUGA/ERROR).
- **Acción remota:** confirmar alertas desde el panel web (operador).

# Paso 2. Identificar responsabilidades del firmware

- **WiFi:** `initWiFi()` y `asegurarWiFi()` se encargan de conexión/reconexión.
- **Sensores:** `readSensors()` / `leerSensores()` toman datos del YF-S201 y BMP180.
- **Actuadores:** `controlActuators()` / `actualizarActuadores()` controlan LEDs y buzzer.
- **Envio de datos:** `sendData()` / `enviarBackend()` prepara y envía JSON al backend.
- **Comandos:** `handleCommands()` recibe comandos simulados por Serial (`PING`, `STATUS`).

# Paso 3. Estructura inicial del código

La logica queda separada en un modulo propio y el firmware se divide por responsabilidad:

- `simulacion/modulos/logica.h`
- `simulacion/modulos/logica.cpp`
- `simulacion/modulos/config.h`
- `simulacion/modulos/config.cpp`
- `simulacion/modulos/estado.h`
- `simulacion/modulos/wifi_mod.h/.cpp`
- `simulacion/modulos/sensores.h/.cpp`
- `simulacion/modulos/actuadores.h/.cpp`
- `simulacion/modulos/display.h/.cpp`
- `simulacion/modulos/backend.h/.cpp`
- `simulacion/modulos/comandos.h/.cpp`

Funciones principales en `simulacion/simulacion.ino`:

- `initWiFi()`
- `readSensors()`
- `controlActuators()`
- `sendData()`
- `handleCommands()`

# Paso 4. Primera version funcional

- Se conecta a WiFi e informa por Serial.
- Lee flujo y presión y calcula el estado.
- Activa LEDs y buzzer según condiciones simples.
- Envía un JSON al backend (`POST /api/readings`).
- Simula comandos con Serial: escribe `PING` o `STATUS` para ver respuesta.

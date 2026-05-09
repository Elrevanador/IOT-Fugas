# Paso 1. Definir el proyecto

- **Nombre del proyecto:** Monitoreo de fugas de agua con ESP32
- **Problema que busca resolver:** detectar fugas y condiciones anómalas de flujo/presión en tiempo real.
- **Sensores:** YF-S201 (flujo) y transductor de presión 100 PSI con divisor 10k/20k hacia ADC del ESP32.
- **Actuadores:** electroválvula 12V mediante relé, LEDs de estado, buzzer y LCD 16x2 I2C.
- **Dato a enviar a internet:** flujo (L/min), presión (kPa), riesgo (%) y estado (NORMAL/ALERTA/FUGA/ERROR).
- **Acción remota:** confirmar alertas desde el panel web y enviar comandos de válvula al ESP32 simulado.

# Paso 2. Identificar responsabilidades del firmware

- **WiFi:** `initWiFi()` y `asegurarWiFi()` se encargan de conexión/reconexión.
- **Sensores:** `readSensors()` / `leerSensores()` toman pulsos del YF-S201 y presión analógica del transductor 100 PSI.
- **Actuadores:** `controlActuators()` / `actualizarActuadores()` controlan LEDs, buzzer, relé y electroválvula.
- **Envio de datos:** `sendData()` / `enviarBackend()` prepara y envía JSON al backend.
- **Comandos seriales:** `handleCommands()` recibe comandos de demostración por Serial (`PING`, `STATUS`, `FORCE ...`).
- **Comandos backend:** `consultarComandosBackend()` consulta `GET /api/commands/pending` con `x-device-key` y `hardwareUid`, ejecuta comandos remotos y responde en `POST /api/commands/:id/response`.

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
- Consulta comandos remotos del backend cada 2 segundos.
- Ejecuta comandos de válvula (`ABRIR_VALVULA`, `CERRAR_VALVULA`) y responde al backend.
- Si defines `SENSOR_ID_VALUE`, las lecturas quedan asociadas a la tabla `sensores`.
- Por defecto `DEVICE_ID_VALUE=0` y `HOUSE_ID_VALUE=0`, así el backend crea o encuentra el dispositivo por `deviceName` sin depender de IDs locales. Si ya tienes una casa/dispositivo fijo, sobreescribe esos valores al compilar.
- Tambien reporta `deviceType`, `firmwareVersion` y `hardwareUid` para mantener actualizada la tabla `devices`.
- Simula comandos locales con Serial: escribe `PING`, `STATUS` o `FORCE ALERTA` para ver respuesta.
- Para una demo mas controlada, cambia el caudal desde el potenciómetro `Caudal demo` y la presión desde el potenciómetro del transductor, sin escribir comandos por Serial.
- En Wokwi, el flujo se representa con un generador de pulsos conectado al pin 27 y un potenciómetro de caudal conectado a GPIO35; el firmware usa el valor mas alto entre ambos. El transductor de presión se simula con un potenciómetro hacia GPIO34.
- El pulsador en GPIO13 alterna manualmente la electroválvula; ante `ESTADO_FUGA` el firmware la cierra automáticamente.

# Ver serial desde terminal

El proyecto ya imprime por `Serial` a `115200` desde `setup()` y luego en cada ciclo de lectura.

Si el monitor serial de Wokwi no te muestra nada, puedes abrir la consola serie desde terminal porque `wokwi.toml` ya expone `rfc2217ServerPort = 4001`.
Esto aplica cuando la simulacion corre localmente con Wokwi CLI o la integracion del editor; si solo la abres en la web, ese puerto local no existe.

Con la simulacion ya corriendo:

```bash
./ver_serial_terminal.sh
```

Opcionalmente puedes cambiar host, puerto o baudios:

```bash
./ver_serial_terminal.sh 127.0.0.1 4001 115200
```

Desde esa terminal tambien puedes escribir comandos como:

```text
PING
STATUS
HELP
```

# Arrancar simulacion y serial

Deje un helper para hacer el flujo completo:

```bash
./simular_y_serial.sh
```

Comportamiento:

- Si tienes `wokwi-cli` y `WOKWI_CLI_TOKEN`, compila y levanta la simulacion en la misma terminal con `--interactive`.
- Si no tienes `wokwi-cli`, compila y espera el puerto `4000` para conectarse al serial de una simulacion abierta desde VS Code.

Variables utiles:

```bash
WOKWI_RUN_MODE=cli|serial|auto
WOKWI_SKIP_BUILD=1
WOKWI_TIMEOUT_MS=600000
WOKWI_SERIAL_WAIT_SECONDS=20
```

Si existe el archivo local `.env.wokwi`, el script tambien toma de ahi `WOKWI_CLI_TOKEN` automaticamente, para no tener que hacer `export` antes de cada corrida.

Ejemplos:

```bash
./simular_y_serial.sh
WOKWI_RUN_MODE=serial WOKWI_SKIP_BUILD=1 ./simular_y_serial.sh
WOKWI_RUN_MODE=cli WOKWI_TIMEOUT_MS=120000 ./simular_y_serial.sh
```

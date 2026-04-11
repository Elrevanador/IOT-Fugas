# Arquitectura IoT — Deteccion de Fugas de Agua

## Diagrama de arquitectura (6 capas)

```mermaid
flowchart LR
  subgraph C1[1. Capa de Dispositivos]
    S1[YF-S201<br/>Sensor de flujo]
    S2[BMP180<br/>Sensor de presion]
    A1[Actuadores<br/>LEDs + Buzzer + LCD]
  end

  subgraph C2[2. Capa de Control / MCU]
    M1[ESP32 Dev Module]
    L1[Logica local:<br/>fugas, riesgo, alertas]
  end

  subgraph C3[3. Capa de Conectividad]
    N1[WiFi 2.4 GHz]
  end

  subgraph C4[4. Capa de Transporte / Mensajeria]
    T1[HTTP/REST]
    T2[ThingSpeak API]
  end

  subgraph C5[5. Capa de Backend / Almacenamiento]
    B1[ThingSpeak Channel]
    B2[Base de datos<br/>(PostgreSQL/MySQL)]
  end

  subgraph C6[6. Capa de Aplicacion / Visualizacion]
    V1[Dashboard web<br/>(ESP32 + LittleFS)]
    V2[Graficas ThingSpeak]
  end

  S1 --> M1
  S2 --> M1
  M1 --> A1
  M1 --> L1
  M1 --> N1 --> T1 --> T2 --> B1 --> V2
  M1 --> V1
  B1 --> B2
  B2 --> V1
```

## Componentes por capa
- **Capa 1 (Dispositivos):** YF-S201 (flujo), BMP180 (presion), LEDs, buzzer y LCD 16x2.
- **Capa 2 (Control):** ESP32 con logica de deteccion de fuga, calculo de riesgo, estados y alertas.
- **Capa 3 (Conectividad):** WiFi (red local).
- **Capa 4 (Transporte):** HTTP/REST hacia ThingSpeak; servicio web local del ESP32 para el dashboard.
- **Capa 5 (Backend/Almacenamiento):** ThingSpeak como backend de ingestion y almacenamiento; base de datos propia para historico/analitica.
- **Capa 6 (Aplicacion/Visualizacion):** Dashboard web servido por ESP32 y graficas de ThingSpeak.

## Flujo de informacion
1. Los sensores capturan flujo y presion.
2. El ESP32 filtra, evalua umbrales y calcula riesgo.
3. El ESP32 publica datos por HTTP a ThingSpeak y sirve el dashboard local.
4. ThingSpeak almacena historico y expone graficas.
5. El usuario visualiza en el dashboard local o en ThingSpeak.
6. La logica local activa actuadores (LEDs, buzzer, LCD) segun el estado.

## Respuestas solicitadas
- **¿Que dato captura el sistema?** Flujo de agua (L/min) y presion (kPa), mas estado/riesgo derivado.
- **¿Como viaja ese dato?** Sensor -> ESP32 -> HTTP/REST -> ThingSpeak; localmente a traves del servidor web del ESP32.
- **¿Donde se almacena?** En ThingSpeak (canal) y, opcionalmente, en una base de datos propia para historico.
- **¿Como lo ve el usuario?** En el dashboard web (ESP32 + LittleFS) y en graficas de ThingSpeak.
- **¿Que accion o decision puede tomar el sistema?** Confirmar fuga, activar buzzer/LEDs, mantener alertas y registrar eventos.

## Diseno de base de datos (propuesta)

### Tabla `devices`
- `id` (PK, UUID)
- `name` (text)
- `location` (text)
- `installed_at` (timestamp)
- `status` (text)

### Tabla `readings`
- `id` (PK, bigint)
- `device_id` (FK -> devices.id)
- `ts` (timestamp)
- `flow_lmin` (numeric)
- `pressure_kpa` (numeric)
- `risk` (int)
- `state` (text)  // NORMAL, ALERTA, FUGA, ERROR

### Tabla `alerts`
- `id` (PK, bigint)
- `device_id` (FK -> devices.id)
- `ts` (timestamp)
- `severity` (text)  // ALERTA, FUGA, ERROR
- `message` (text)
- `acknowledged` (bool)
- `ack_at` (timestamp)

### Tabla `events`
- `id` (PK, bigint)
- `device_id` (FK -> devices.id)
- `ts` (timestamp)
- `event_type` (text) // WIFI_DOWN, SENSOR_FAIL, THINGSPEAK_POST_OK, etc.
- `details` (json)


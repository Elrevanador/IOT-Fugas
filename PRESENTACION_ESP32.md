# Presentación ESP32: Sistema de detección de fugas de agua

## Diapositiva 1. Título

**Sistema IoT de detección de fugas de agua con ESP32**

Proyecto basado en un ESP32 físico conectado a sensores, actuadores, backend y panel web para monitorear flujo, presión y estado del sistema en tiempo real.

---

## Diapositiva 2. Problema

Las fugas de agua pueden causar:

- Desperdicio de agua.
- Daños en viviendas o instalaciones.
- Aumento en costos de consumo.
- Dificultad para detectar fallas a tiempo.

El objetivo del proyecto es detectar condiciones anómalas de flujo y presión antes de que el problema sea mayor.

---

## Diapositiva 3. Objetivo del sistema

Diseñar e implementar un sistema IoT con ESP32 capaz de:

- Medir el flujo de agua.
- Medir la presión de la tubería.
- Calcular un nivel de riesgo.
- Identificar estados como `NORMAL`, `ALERTA`, `FUGA` o `ERROR`.
- Enviar datos al backend.
- Mostrar información en pantalla.
- Activar alertas locales con LEDs, buzzer y electroválvula.
- Recibir comandos remotos desde una plataforma web.

---

## Diapositiva 4. Componentes principales

El sistema utiliza:

- **ESP32:** controlador principal y conexión WiFi.
- **Sensor de flujo YF-S201:** mide el paso de agua mediante pulsos.
- **Sensor de presión 100 PSI:** mide presión usando entrada analógica.
- **Pantalla OLED I2C:** muestra estado, flujo, presión y conexión.
- **LEDs de estado:** indican funcionamiento normal, alerta, fuga o error.
- **Buzzer:** genera aviso sonoro ante eventos críticos.
- **Relé:** controla la electroválvula.
- **Electroválvula:** permite abrir o cerrar el paso de agua.
- **Pulsador:** permite alternar manualmente la válvula.

---

## Diapositiva 5. Arquitectura general

El flujo del proyecto es:

1. El ESP32 lee sensores de flujo y presión.
2. El firmware calcula el riesgo de fuga.
3. El sistema activa LEDs, buzzer y relé según el estado.
4. El ESP32 envía datos al backend por HTTP/HTTPS.
5. El backend almacena las lecturas y alertas.
6. El frontend web muestra el estado del sistema.
7. El panel puede enviar comandos remotos al ESP32.

---

## Diapositiva 6. Pines usados en el ESP32

| Elemento | Pin |
|---|---:|
| Sensor de flujo | GPIO 27 |
| Sensor de presión | GPIO 34 |
| LED azul / indicador de válvula | GPIO 5 |
| LED verde | GPIO 4 |
| LED naranja | GPIO 15 |
| LED rojo | GPIO 2 |
| Buzzer | GPIO 16 |
| Relé / electroválvula | GPIO 17 |
| Pulsador | GPIO 13 |
| Pantalla OLED | I2C |

---

## Diapositiva 7. Lectura de sensores

El firmware realiza lecturas periódicas:

- El sensor de flujo cuenta pulsos para estimar litros por minuto.
- El sensor de presión usa el ADC del ESP32.
- La presión se convierte a una escala útil en kPa.
- Las lecturas se filtran para evitar falsas alertas durante el arranque.

Intervalos principales:

- Lectura de sensores: cada 500 ms.
- Envío al backend: cada 2000 ms.
- Consulta de comandos remotos: cada 5000 ms.

---

## Diapositiva 8. Estados del sistema

El sistema maneja cuatro estados:

| Estado | Significado |
|---|---|
| `NORMAL` | Flujo y presión dentro de rangos seguros. |
| `ALERTA` | Se detectan señales anómalas, pero no críticas. |
| `FUGA` | Condición crítica de posible fuga. |
| `ERROR` | Fallo de sensor, comunicación o lectura inválida. |

Estos estados permiten tomar decisiones automáticas y mostrarlas al usuario.

---

## Diapositiva 9. Cálculo de riesgo

El firmware calcula un porcentaje de riesgo usando:

- Nivel de flujo.
- Nivel de presión.
- Estado del sensor.
- Umbrales de alerta y fuga.
- Lecturas consecutivas para evitar falsos positivos.

El riesgo se expresa de 0 a 100 % y se envía al backend junto con el estado.

---

## Diapositiva 10. Respuesta local ante eventos

Cuando el ESP32 detecta una condición importante:

- Cambia los LEDs de estado.
- Activa el buzzer si hay alerta o fuga.
- Cierra la electroválvula si el estado llega a `FUGA`.
- Muestra información en la pantalla OLED.
- Mantiene registro del último estado y del resultado del backend.

Esto permite que el sistema funcione aunque el usuario no esté mirando el panel web.

---

## Diapositiva 11. Comunicación con internet

El ESP32 se conecta a WiFi y se comunica con el backend.

Datos enviados:

```json
{
  "deviceName": "ESP32-FISICO-01",
  "hardwareUid": "HW-ESP32-FISICO-01",
  "flow_lmin": 1.8,
  "pressure_kpa": 100.4,
  "risk": 62,
  "state": "ALERTA"
}
```

La comunicación usa una clave de dispositivo para validar que los datos provienen del ESP32 autorizado.

---

## Diapositiva 12. Backend y panel web

El backend recibe, valida y guarda la información del ESP32.

Funciones principales:

- Guardar lecturas de sensores.
- Registrar alertas e incidentes.
- Consultar el estado más reciente.
- Gestionar comandos remotos.
- Proteger endpoints con autenticación.

El frontend permite visualizar el estado del sistema desde una interfaz web.

---

## Diapositiva 13. Comandos remotos

El ESP32 puede consultar comandos pendientes del backend.

Ejemplos:

- Abrir válvula.
- Cerrar válvula.
- Confirmar ejecución del comando.
- Reportar estado de respuesta.

Esto permite controlar el sistema desde el panel web sin estar físicamente junto al dispositivo.

---

## Diapositiva 14. Seguridad del sistema

El proyecto incluye medidas como:

- Clave de autenticación para el dispositivo.
- Validación del origen de datos en el backend.
- Comunicación HTTP/HTTPS según el entorno.
- Separación entre configuración local y pública.
- Identificación por nombre, tipo, firmware y hardware UID.

Para producción, las claves deben cambiarse por valores nuevos y privados.

---

## Diapositiva 15. Modo demostración

El firmware incluye parámetros de demostración para facilitar pruebas:

- Umbrales más sensibles.
- Estimación de flujo cuando no hay pulsos reales.
- Filtro de arranque para evitar alertas falsas.
- Lecturas consecutivas para confirmar alerta o fuga.

Esto ayuda a presentar el funcionamiento del sistema sin depender de una instalación hidráulica real.

---

## Diapositiva 16. Ventajas del proyecto

- Monitoreo en tiempo real.
- Respuesta automática ante fuga.
- Control remoto de la electroválvula.
- Integración con backend y frontend.
- Sistema ampliable a varias casas o dispositivos.
- Uso de tecnologías accesibles: ESP32, sensores, Node.js y Angular.

---

## Diapositiva 17. Posibles mejoras

El proyecto puede crecer con:

- Notificaciones por correo, WhatsApp o app móvil.
- Dashboard histórico con gráficas avanzadas.
- Calibración automática de sensores.
- Batería de respaldo.
- Carcasa física para instalación real.
- Certificados TLS configurados para producción.
- Integración con múltiples zonas de una vivienda.

---

## Diapositiva 18. Conclusión

El sistema con ESP32 permite detectar fugas de agua usando mediciones de flujo y presión, procesarlas localmente y enviarlas a una plataforma web.

La combinación de sensores, actuadores, backend y frontend convierte el proyecto en una solución IoT completa, capaz de alertar, registrar eventos y actuar automáticamente ante una fuga.


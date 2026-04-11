# Proyecto Wokwi - Deteccion de Fugas con ESP32

Este proyecto ya quedo listo para usar con Wokwi en VS Code.

Archivos principales:

- `IOt.ino`: codigo principal del ESP32
- `data/`: dashboard web servido desde LittleFS
- `diagram.json`: circuito de Wokwi
- `libraries.txt`: bibliotecas externas del sketch
- `partitions.csv`: tabla de particiones usada por el proyecto
- `wokwi.toml`: configuracion para Wokwi en VS Code
- `build_wokwi_bundle.sh`: build reproducible para firmware + LittleFS
- `build/IOt.ino.bin`: firmware compilado
- `build/IOt.ino.elf`: ELF compilado
- `build/littlefs.bin`: imagen LittleFS generada desde `data/`
- `build/IOt.ino.merged.bin`: binario final para Wokwi

## Lo que incluye

- ESP32 Dev Module
- BMP180 por I2C
- LCD 16x2 por I2C
- Generador de pulsos en el pin 27 para simular flujo
- LED verde, naranja y rojo
- Buzzer
- Pagina web servida por el ESP32
- Envio HTTP a ThingSpeak

## Estado actual

Wokwi usa `build/IOt.ino.merged.bin`, que incluye bootloader, particiones, aplicacion y el filesystem LittleFS con el dashboard de `data/`.

## Como abrirlo en VS Code

1. Abre la carpeta `/home/duvan/IOt`
2. No uses `F5`
3. Ejecuta `Wokwi: Start Simulator`

## Build reproducible

Si cambias `IOt.ino` o cualquier archivo dentro de `data/`, ejecuta:

```bash
./build_wokwi_bundle.sh
```

Ese script recompila el sketch y vuelve a generar:

- `build/IOt.ino.bin`
- `build/IOt.ino.elf`
- `build/littlefs.bin`
- `build/IOt.ino.merged.bin`

No basta con recompilar solo la aplicacion si el dashboard cambio, porque Wokwi lee el binario merged que ya trae LittleFS.

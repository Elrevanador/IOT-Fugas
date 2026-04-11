#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClient.h>
#include <WebServer.h>
#include <LittleFS.h>
#include <Wire.h>
#include <Adafruit_BMP085.h>
#include <LiquidCrystal_I2C.h>

// ---------------- WiFi / ThingSpeak ----------------
const char* ssid     = "Wokwi-GUEST";
const char* password = "";
String writeApiKey   = "NNVV6NM3KK0V2F7R";

// ---------------- Pines ----------------
const int flowPin    = 27;
const int ledVerde   = 2;
const int ledNaranja = 15;
const int ledRojo    = 4;
const int buzzerPin  = 16;

// ---------------- Objetos ----------------
Adafruit_BMP085 bmp;
LiquidCrystal_I2C lcd(0x27, 16, 2);
WebServer server(80);

// ---------------- Estados ----------------
enum EstadoSistema {
  ESTADO_NORMAL = 0,
  ESTADO_ALERTA = 1,
  ESTADO_FUGA   = 2,
  ESTADO_ERROR  = 3
};

EstadoSistema estadoSistema = ESTADO_NORMAL;

// ---------------- Variables ----------------
volatile uint32_t pulseCount = 0;

float flujoLmin   = 0.0;
float presionKPa  = 0.0;
bool sensorOK           = true;
bool ledBlinkState      = false;
bool primeraLectura     = true;
bool flujoRealDetectado = false;
uint32_t thingSpeakEnvios = 0;

// ---------------- Temporizadores ----------------
unsigned long lastMeasure   = 0;
unsigned long lastSend      = 0;
unsigned long lastBlink     = 0;
unsigned long lastLCDUpdate = 0;

// ---------------- Contadores ----------------
int contadorAlerta  = 0;
int contadorCritico = 0;
int nivelRiesgo     = 20;

// ---------------- Umbrales ----------------
const float UMBRAL_ALERTA_FLUJO_IN = 1.0;
const float UMBRAL_ALERTA_PRES_IN  = 101.5;

const float UMBRAL_CRITICO_FLUJO = 2.2;
const float UMBRAL_CRITICO_PRES  = 99.0;

const float UMBRAL_NORMAL_FLUJO_OUT = 0.85;
const float UMBRAL_NORMAL_PRES_OUT  = 101.0;

// NUEVO: si la presión sube a este valor o más, el sistema vuelve a NORMAL
const float PRESION_RECUPERACION_NORMAL = 101.5;

const int LECTURAS_ALERTA_REQUERIDAS   = 2;
const int LECTURAS_CRITICAS_REQUERIDAS = 2;

// ---------------- Utilidades ----------------
String estadoTexto() {
  switch (estadoSistema) {
    case ESTADO_NORMAL: return "NORMAL";
    case ESTADO_ALERTA: return "ALERTA";
    case ESTADO_FUGA:   return "FUGA";
    case ESTADO_ERROR:  return "ERROR";
    default: return "DESCONOCIDO";
  }
}

String estadoClase() {
  switch (estadoSistema) {
    case ESTADO_NORMAL: return "normal";
    case ESTADO_ALERTA: return "alerta";
    case ESTADO_FUGA:   return "fuga";
    case ESTADO_ERROR:  return "error";
    default: return "error";
  }
}

int estadoGraficaThingSpeak() {
  switch (estadoSistema) {
    case ESTADO_NORMAL: return 20;
    case ESTADO_ALERTA: return 60;
    case ESTADO_FUGA:   return 100;
    case ESTADO_ERROR:  return 5;
    default: return 0;
  }
}

float limitarFloat(float valor, float minimo, float maximo) {
  if (valor < minimo) return minimo;
  if (valor > maximo) return maximo;
  return valor;
}

int calcularRiesgoContinuo(float flujo, float presion) {
  float scoreFlujo = limitarFloat((flujo - 0.6) / (2.8 - 0.6), 0.0, 1.0);
  float scorePres  = limitarFloat((104.0 - presion) / (104.0 - 95.0), 0.0, 1.0);

  float riesgo = (scoreFlujo * 0.55 + scorePres * 0.45) * 100.0;

  if (!sensorOK) return 5;
  return (int)limitarFloat(riesgo, 0.0, 100.0);
}

bool wifiConectado() {
  return WiFi.status() == WL_CONNECTED;
}

String ipLocalTexto() {
  if (!wifiConectado()) return "";
  return WiFi.localIP().toString();
}

// ---------------- Interrupcion ----------------
void IRAM_ATTR onPulse() {
  pulseCount++;
}

// ---------------- Buzzer ----------------
void apagarBuzzer() {
  ledcWrite(buzzerPin, 0);
}

void encenderBuzzerContinuo() {
  ledcWrite(buzzerPin, 128);
}

// ---------------- WiFi ----------------
void conectarWiFi() {
  Serial.print("Conectando a WiFi");
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 30) {
    delay(300);
    Serial.print(".");
    intentos++;
  }

  Serial.println();

  if (wifiConectado()) {
    Serial.println("WiFi conectado");
    Serial.print("IP: ");
    Serial.println(ipLocalTexto());
    Serial.print("Web local: http://");
    Serial.println(ipLocalTexto());
  } else {
    Serial.println("No se pudo conectar a WiFi");
  }
}

bool asegurarWiFi() {
  if (wifiConectado()) return true;

  Serial.println("WiFi caido. Reconectando...");
  WiFi.disconnect(true);
  delay(500);
  WiFi.begin(ssid, password);

  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 10000) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();

  if (wifiConectado()) {
    Serial.println("WiFi reconectado");
    Serial.print("IP: ");
    Serial.println(ipLocalTexto());
    return true;
  }

  Serial.println("No fue posible reconectar WiFi");
  return false;
}

// ---------------- Sensores ----------------
void leerSensores() {
  noInterrupts();
  uint32_t pulses = pulseCount;
  pulseCount = 0;
  interrupts();

  if (pulses > 0) {
    flujoRealDetectado = true;
  }

  long presionPa = bmp.readPressure();

  float frequencyHz = pulses / 2.0;
  float nuevoFlujo = frequencyHz / 7.5;
  float nuevaPresion = 0.0;

  if (presionPa > 0) {
    nuevaPresion = presionPa / 1000.0;
    sensorOK = true;
  } else {
    sensorOK = false;
  }

  nuevoFlujo   = limitarFloat(nuevoFlujo, 0.0, 5.0);
  nuevaPresion = limitarFloat(nuevaPresion, 0.0, 115.0);

  if (primeraLectura) {
    flujoLmin = nuevoFlujo;
    presionKPa = nuevaPresion;
    primeraLectura = false;
  } else {
    flujoLmin  = flujoLmin * 0.40 + nuevoFlujo * 0.60;
    presionKPa = presionKPa * 0.40 + nuevaPresion * 0.60;
  }

  Serial.println("----- LECTURA -----");
  Serial.print("Pulsos: ");               Serial.println(pulses);
  Serial.print("Flujo real detectado: "); Serial.println(flujoRealDetectado ? "SI" : "NO");
  Serial.print("Flujo (L/min): ");        Serial.println(flujoLmin, 2);
  Serial.print("Presion (kPa): ");        Serial.println(presionKPa, 2);
  Serial.print("Sensor OK: ");            Serial.println(sensorOK ? "SI" : "NO");
}

// ---------------- Logica ----------------
void evaluarEstado() {
  nivelRiesgo = calcularRiesgoContinuo(flujoLmin, presionKPa);

  if (!sensorOK) {
    estadoSistema = ESTADO_ERROR;
    contadorAlerta = 0;
    contadorCritico = 0;
    nivelRiesgo = 5;
    return;
  }

  // Si la presion sube lo suficiente, vuelve a NORMAL
  if (presionKPa >= PRESION_RECUPERACION_NORMAL) {
    contadorAlerta = 0;
    contadorCritico = 0;
    estadoSistema = ESTADO_NORMAL;
    nivelRiesgo = min(nivelRiesgo, 20);
    return;
  }

  bool condicionCritica =
    (flujoLmin >= UMBRAL_CRITICO_FLUJO && presionKPa <= UMBRAL_CRITICO_PRES);

  bool condicionAlerta =
    (flujoLmin >= UMBRAL_ALERTA_FLUJO_IN && presionKPa <= UMBRAL_ALERTA_PRES_IN) ||
    (nivelRiesgo >= 45);

  bool condicionNormal =
    (flujoLmin <= UMBRAL_NORMAL_FLUJO_OUT &&
     presionKPa >= UMBRAL_NORMAL_PRES_OUT &&
     nivelRiesgo < 35);

  if (condicionCritica) {
    contadorCritico = min(contadorCritico + 1, 10);
    contadorAlerta  = min(contadorAlerta + 1, 10);

    if (contadorCritico >= LECTURAS_CRITICAS_REQUERIDAS) {
      estadoSistema = ESTADO_FUGA;
    } else {
      estadoSistema = ESTADO_ALERTA;
    }
    return;
  }

  if (condicionAlerta) {
    contadorAlerta = min(contadorAlerta + 1, 10);
    contadorCritico = max(contadorCritico - 1, 0);

    if (contadorAlerta >= LECTURAS_ALERTA_REQUERIDAS) {
      estadoSistema = ESTADO_ALERTA;
    } else {
      estadoSistema = ESTADO_NORMAL;
    }
    return;
  }

  if (condicionNormal) {
    contadorAlerta = 0;
    contadorCritico = 0;
    estadoSistema = ESTADO_NORMAL;
    nivelRiesgo = min(nivelRiesgo, 20);
    return;
  }

  // Zona intermedia: descargar contadores y permitir volver de estado
  contadorAlerta  = max(contadorAlerta - 1, 0);
  contadorCritico = max(contadorCritico - 1, 0);

  if (contadorCritico >= LECTURAS_CRITICAS_REQUERIDAS) {
    estadoSistema = ESTADO_FUGA;
  } else if (contadorAlerta >= 1) {
    estadoSistema = ESTADO_ALERTA;
  } else {
    estadoSistema = ESTADO_NORMAL;
  }
}

// ---------------- Actuadores ----------------
void actualizarActuadores() {
  switch (estadoSistema) {
    case ESTADO_NORMAL:
      apagarBuzzer();
      digitalWrite(ledVerde, HIGH);
      digitalWrite(ledNaranja, LOW);
      digitalWrite(ledRojo, LOW);
      break;

    case ESTADO_ALERTA:
      apagarBuzzer();
      digitalWrite(ledVerde, LOW);
      digitalWrite(ledRojo, LOW);

      if (millis() - lastBlink >= 300) {
        lastBlink = millis();
        ledBlinkState = !ledBlinkState;
        digitalWrite(ledNaranja, ledBlinkState);
      }
      break;

    case ESTADO_FUGA:
      digitalWrite(ledVerde, LOW);
      digitalWrite(ledNaranja, LOW);
      digitalWrite(ledRojo, HIGH);
      encenderBuzzerContinuo();
      break;

    case ESTADO_ERROR:
      apagarBuzzer();
      digitalWrite(ledVerde, LOW);
      digitalWrite(ledNaranja, LOW);

      if (millis() - lastBlink >= 700) {
        lastBlink = millis();
        ledBlinkState = !ledBlinkState;
        digitalWrite(ledRojo, ledBlinkState);
      }
      break;
  }
}

// ---------------- LCD ----------------
void actualizarLCD() {
  static int ultimoEstado = -1;
  static int ultimoRiesgo = -1;

  if ((int)estadoSistema == ultimoEstado &&
      nivelRiesgo == ultimoRiesgo &&
      millis() - lastLCDUpdate < 1500) {
    return;
  }

  ultimoEstado = (int)estadoSistema;
  ultimoRiesgo = nivelRiesgo;
  lastLCDUpdate = millis();

  lcd.clear();

  switch (estadoSistema) {
    case ESTADO_NORMAL:
      lcd.setCursor(0, 0);
      lcd.print("Estado:NORMAL");
      lcd.setCursor(0, 1);
      lcd.print("Q:");
      lcd.print(flujoLmin, 1);
      lcd.print(" P:");
      lcd.print(presionKPa, 0);
      break;

    case ESTADO_ALERTA:
      lcd.setCursor(0, 0);
      lcd.print("Estado:ALERTA");
      lcd.setCursor(0, 1);
      lcd.print("Riesgo:");
      lcd.print(nivelRiesgo);
      lcd.print("%");
      break;

    case ESTADO_FUGA:
      lcd.setCursor(0, 0);
      lcd.print("FUGA CONFIRMADA");
      lcd.setCursor(0, 1);
      lcd.print("Riesgo:");
      lcd.print(nivelRiesgo);
      lcd.print("%");
      break;

    case ESTADO_ERROR:
      lcd.setCursor(0, 0);
      lcd.print("ERROR SENSOR");
      lcd.setCursor(0, 1);
      lcd.print("Verifique BMP180");
      break;
  }
}

// ---------------- Web ----------------
void handleRoot() {
  File file = LittleFS.open("/index.html", "r");
  if (!file) {
    server.send(500, "text/plain", "index.html no encontrado");
    return;
  }
  server.streamFile(file, "text/html");
  file.close();
}

void handleDatos() {
  bool wifiOK = wifiConectado();
  String json = "{";
  json += "\"flujo\":\"" + String(flujoLmin, 2) + "\",";
  json += "\"presion\":\"" + String(presionKPa, 2) + "\",";
  json += "\"riesgo\":\"" + String(nivelRiesgo) + "\",";
  json += "\"sensorOK\":" + String(sensorOK ? "true" : "false") + ",";
  json += "\"contadorAlerta\":\"" + String(contadorAlerta) + "\",";
  json += "\"contadorCritico\":\"" + String(contadorCritico) + "\",";
  json += "\"estadoTexto\":\"" + estadoTexto() + "\",";
  json += "\"estadoClase\":\"" + estadoClase() + "\",";
  json += "\"wifiOK\":" + String(wifiOK ? "true" : "false") + ",";
  json += "\"ip\":\"" + ipLocalTexto() + "\",";
  json += "\"thingSpeakEnvios\":" + String(thingSpeakEnvios) + ",";
  json += "\"uptimeSeg\":" + String(millis() / 1000UL) + ",";
  json += "\"flujoRealDetectado\":" + String(flujoRealDetectado ? "true" : "false");
  json += "}";

  server.send(200, "application/json", json);
}

void iniciarServidorWeb() {
  server.on("/", handleRoot);
  server.on("/datos", handleDatos);
  server.serveStatic("/", LittleFS, "/");
  server.begin();
  Serial.println("Servidor web iniciado");
}

// ---------------- ThingSpeak ----------------
void enviarThingSpeak() {
  if (!asegurarWiFi()) {
    Serial.println("Sin WiFi. No se envio a ThingSpeak.");
    return;
  }

  WiFiClient client;
  HTTPClient http;
  http.setTimeout(10000);

  String url = "http://api.thingspeak.com/update";
  String postData = "api_key=" + writeApiKey +
                    "&field1=" + String(flujoLmin, 2) +
                    "&field2=" + String(presionKPa, 2) +
                    "&field3=" + String(estadoGraficaThingSpeak()) +
                    "&field4=" + String(nivelRiesgo);

  Serial.println(">>> Enviando a ThingSpeak...");
  Serial.println(postData);

  if (!http.begin(client, url)) {
    Serial.println("No se pudo iniciar HTTP");
    return;
  }

  http.addHeader("Content-Type", "application/x-www-form-urlencoded");

  int httpCode = http.POST(postData);
  Serial.print("HTTP Code: ");
  Serial.println(httpCode);

  if (httpCode > 0) {
    String resp = http.getString();
    Serial.print("Respuesta ThingSpeak: ");
    Serial.println(resp);
    if (httpCode == 200) {
      thingSpeakEnvios++;
      Serial.print("Envios ThingSpeak OK: ");
      Serial.println(thingSpeakEnvios);
    }
  } else {
    Serial.print("Error HTTP: ");
    Serial.println(http.errorToString(httpCode));
  }

  http.end();
}

// ---------------- Setup ----------------
void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println();
  Serial.println("Iniciando sistema...");

  pinMode(flowPin, INPUT_PULLUP);
  pinMode(ledVerde, OUTPUT);
  pinMode(ledNaranja, OUTPUT);
  pinMode(ledRojo, OUTPUT);

  digitalWrite(ledVerde, LOW);
  digitalWrite(ledNaranja, LOW);
  digitalWrite(ledRojo, LOW);

  const int buzzerFreq = 1500;
  const int buzzerResolution = 8;

  if (!ledcAttach(buzzerPin, buzzerFreq, buzzerResolution)) {
    Serial.println("Error al configurar buzzer");
  } else {
    Serial.println("Buzzer OK");
  }
  ledcWrite(buzzerPin, 0);

  if (!LittleFS.begin()) {
    Serial.println("Error LittleFS");
  } else {
    Serial.println("LittleFS OK");
  }
  Wire.begin(21, 22);
  Serial.println("I2C OK");

  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Iniciando...");
  lcd.setCursor(0, 1);
  lcd.print("Sistema IoT");
  Serial.println("LCD OK");

  if (!bmp.begin()) {
    sensorOK = false;
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Error BMP180");
    Serial.println("Error BMP180");
  } else {
    Serial.println("BMP180 OK");
  }

  attachInterrupt(digitalPinToInterrupt(flowPin), onPulse, RISING);
  Serial.println("Interrupcion OK");

  conectarWiFi();
  iniciarServidorWeb();

  lastMeasure = millis();
  lastSend    = millis() - 15000;
  lastBlink   = millis();

  Serial.println("Sistema listo");
}

// ---------------- Loop ----------------
void loop() {
  unsigned long now = millis();

  server.handleClient();

  if (now - lastMeasure >= 2000) {
    leerSensores();
    evaluarEstado();
    actualizarLCD();

    Serial.print("Estado: ");       Serial.println(estadoTexto());
    Serial.print("Nivel riesgo: "); Serial.println(nivelRiesgo);
    Serial.print("Cnt alerta: ");   Serial.println(contadorAlerta);
    Serial.print("Cnt critico: ");  Serial.println(contadorCritico);
    Serial.println();

    lastMeasure = now;
  }

  actualizarActuadores();

  if (now - lastSend >= 15000) {
    enviarThingSpeak();
    lastSend = now;
  }
}

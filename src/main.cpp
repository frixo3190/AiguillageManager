#include <Arduino.h>
#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <ESPmDNS.h>
#include <NmraDcc.h>
#include <ArduinoOTA.h>
#include "secrets.h"

const char* ssid = WIFI_SSID;
const char* password = WIFI_PASSWORD;

AsyncWebServer server(80);

NmraDcc Dcc;

#define DCC_PIN 16
#define DCC_SIGNAL_TIMEOUT 500

unsigned long pinTimers[40] = {0};
int switchStates[6] = {0};
int switchDccAddresses[6] = {1, 2, 3, 4, 5, 6};
AsyncEventSource * events;
unsigned long lastDccSignal = 0;
bool signalPresent = true;
int dccPinLastState = -1;
unsigned long lastDccPinEvent = 0;
bool dccPinLogEnabled = false;
bool emergencyStopActive = false;
unsigned long emergencyStartTime = 0;
uint16_t lastUnknownAddr = 0;
uint8_t lastUnknownCmd = 0;
unsigned long lastUnknownTime = 0;

const int pinsAiguillages[6][2] = {
  {26, 17}, 
  {18, 19}, 
  {21, 22}, 
  {23, 25}, 
  {27, 32}, 
  {33, 14}  
};

void loadDccAddresses() {
  File configFile = LittleFS.open("/config.json", "r");
  if (configFile) {
    StaticJsonDocument<2048> doc;
    DeserializationError error = deserializeJson(doc, configFile);
    if (!error) {
      JsonArray switches = doc["switches"];
      int i = 0;
      for (JsonObject sw : switches) {
        if (i >= 6) break;
        switchDccAddresses[i] = sw["dccAddress"] | (i + 1);
        i++;
      }
      for (; i < 6; i++) {
        switchDccAddresses[i] = i + 1;
      }
    }
    configFile.close();
  }
}

void notifyDccMsg(DCC_MSG * msg) {
  lastDccSignal = millis();
  if (emergencyStopActive && emergencyStartTime > 0 && (millis() - emergencyStartTime > 2000)) {
    emergencyStopActive = false;
  }
  if (!signalPresent) {
    signalPresent = true;
    events->send("{\"present\":true}", "dcc-signal");
  }
  
  if (msg->Size >= 3) {
    uint16_t addr = (msg->Data[0] << 8) | msg->Data[1];
    uint8_t cmd = msg->Data[2];
    
    int calcSwitch = (((addr - 32768) >> 2) ^ 4) * 4 + (cmd & 3) + 1;
    int mode = (addr % 2) + 1;
    
    int switchId = -1;
    for (int i = 0; i < 6; i++) {
      if (switchDccAddresses[i] == addr) {
        switchId = i;
        break;
      }
    }
    if (switchId < 0 && calcSwitch >= 1 && calcSwitch <= 6) {
      switchId = calcSwitch - 1;
    }
    
    if (switchId >= 0) {
      int pinIndex = mode - 1;
      int pinToPulse = pinsAiguillages[switchId][pinIndex];
      
      Serial.println("DCC: Aiguillage " + String(calcSwitch) + " mode " + String(mode));
      
      switchStates[switchId] = mode - 1;
      
      digitalWrite(pinToPulse, HIGH);
      pinTimers[pinToPulse] = millis();
      if (pinTimers[pinToPulse] == 0) pinTimers[pinToPulse] = 1;
      
      char jsonBuf[200];
      snprintf(jsonBuf, sizeof(jsonBuf), "{\"id\":%d,\"state\":%d,\"source\":\"dcc\",\"address\":%d,\"cmd\":%d}", switchId, switchStates[switchId], addr, cmd);
      events->send(jsonBuf, "dcc-switch");
    } else {
      if (addr == lastUnknownAddr && cmd == lastUnknownCmd && millis() - lastUnknownTime < 1000) {
        // already reported, skip
      } else {
        lastUnknownAddr = addr;
        lastUnknownCmd = cmd;
        lastUnknownTime = millis();
        Serial.printf("DCC: Adresse inconnue %d\n", addr);
        char jsonBuf[100];
        snprintf(jsonBuf, sizeof(jsonBuf), "{\"address\":%d,\"cmd\":%d}", addr, cmd);
        events->send(jsonBuf, "dcc-unknown");
      }
    }
  }
}

void notifyDccSpeed(uint16_t addr, DCC_ADDR_TYPE addrType, uint8_t speed, DCC_DIRECTION dir, DCC_SPEED_STEPS speedSteps) {
  lastDccSignal = millis();
  if (!signalPresent) {
    signalPresent = true;
    events->send("{\"present\":true}", "dcc-signal");
  }
  
  if (speed == 1) {
    emergencyStopActive = true;
    emergencyStartTime = millis();
    Serial.println("DCC: ARRET D'URGENCE - Loc " + String(addr));
    events->send("{\"active\":true}", "emergency-stop");
    events->send("{\"active\":1}", "dcc-emergency");
  } else {
    emergencyStopActive = false;
  }
}

void notifyDccNormalOperation(uint16_t addr, DCC_ADDR_TYPE addrType) {
  lastDccSignal = millis();
  emergencyStopActive = false;
  events->send("{\"active\":false}", "emergency-stop");
}

void notifyDccSubsystemStop(uint8_t StopState) {
  lastDccSignal = millis();
  emergencyStopActive = (StopState == 1);
  if (emergencyStopActive) emergencyStartTime = millis();
  Serial.print("DCC: SUBSYSTEM STOP - ");
  Serial.println(StopState);
  char jsonBuf[100];
  snprintf(jsonBuf, sizeof(jsonBuf), "{\"active\":%d}", StopState == 1 ? 1 : 0);
  events->send(jsonBuf, "emergency-stop");
  if (emergencyStopActive) {
    events->send(jsonBuf, "dcc-emergency");
  }
}

void setup() {
  Serial.begin(115200);

  for(int i = 0; i < 6; i++) {
    pinMode(pinsAiguillages[i][0], OUTPUT);
    digitalWrite(pinsAiguillages[i][0], LOW);
    
    pinMode(pinsAiguillages[i][1], OUTPUT);
    digitalWrite(pinsAiguillages[i][1], LOW);
  }

  if (!LittleFS.begin(true)) {
    Serial.println("Erreur LittleFS");
    return;
  }

  // --- NOUVEAU : Synchronisation physique au démarrage ---
  Serial.println("Initialisation physique des aiguillages...");
  File configFile = LittleFS.open("/config.json", "r");
  if (configFile) {
    StaticJsonDocument<2048> doc; 
    DeserializationError error = deserializeJson(doc, configFile);
    
    if (!error) {
      JsonArray switches = doc["switches"];
      int id = 0;
      for (JsonObject sw : switches) {
        if (id >= 6) break;
        
        int state = sw["state"]; // 0 (Mode 1) ou 1 (Mode 2)
        int pinToPulse = pinsAiguillages[id][state];
        
        Serial.println("Synchro au demarrage - Aiguillage " + String(id + 1) + " : pin " + String(pinToPulse));
        
        digitalWrite(pinToPulse, HIGH);
        delay(500); // Impulsion de 500ms
        digitalWrite(pinToPulse, LOW);
        
        delay(600); // Attente de 600ms pour soulager l'alimentation
        id++;
      }
    }
    configFile.close();
    Serial.println("Synchronisation terminee.");
  } else {
    Serial.println("Aucun fichier config.json, passage avec les valeurs par defaut.");
  }
  // -------------------------------------------------------
  
  loadDccAddresses();

  pinMode(DCC_PIN, INPUT);
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, HIGH); // éteinte au départ
  Dcc.pin(DCC_PIN, 0);
  Dcc.init(MAN_ID_DIY, 10, FLAGS_DCC_ACCESSORY_DECODER, 0);

  lastDccSignal = millis();

  events = new AsyncEventSource("/events");
  events->onConnect([](AsyncEventSourceClient * client) {
    client->send("connected", NULL, millis(), 1000);
  });
  server.addHandler(events);

  DefaultHeaders::Instance().addHeader("Cache-Control", "no-cache, no-store, must-revalidate");

  WiFi.setHostname("AiguillageManager");
  WiFi.begin(ssid, password);
  Serial.print("Connexion WiFi a ");
  Serial.println(ssid);
  Serial.println("(non-bloquant, le serveur demarre sans attendre le WiFi)");

  ArduinoOTA.setHostname("AiguillageManager");
  ArduinoOTA.onStart([]() { Serial.println("OTA: mise a jour..."); });
  ArduinoOTA.onEnd([]() { Serial.println("OTA: termine"); });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("OTA: %u%%\r", (progress * 100) / total);
  });
  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("OTA: erreur %u\n", error);
  });
  ArduinoOTA.begin();

  server.on("/switch", HTTP_GET, [](AsyncWebServerRequest *request){
    if(request->hasParam("id") && request->hasParam("mode")){
      int id = request->getParam("id")->value().toInt();
      int mode = request->getParam("mode")->value().toInt();
      
      Serial.println("aiguillage " + String(id) + " : mode " + String(mode)); 

      if (id >= 1 && id <= 6 && (mode == 1 || mode == 2)) {
        int pinIndex = mode - 1; 
        int pinToPulse = pinsAiguillages[id - 1][pinIndex]; 
        
        digitalWrite(pinToPulse, HIGH); 
        
        pinTimers[pinToPulse] = millis(); 
        if(pinTimers[pinToPulse] == 0) pinTimers[pinToPulse] = 1;

        switchStates[id - 1] = mode - 1;

        String user = request->hasParam("user") ? request->getParam("user")->value() : "";
        char jsonBuf[200];
        snprintf(jsonBuf, sizeof(jsonBuf), "{\"id\":%d,\"state\":%d,\"source\":\"web\",\"user\":\"%s\"}", id - 1, mode - 1, user.c_str());
        events->send(jsonBuf, "dcc-switch");
      }
    }
    request->send(200, "text/plain", "OK");
  });

  server.on("/save", HTTP_POST, [](AsyncWebServerRequest *request){}, NULL, 
    [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
      File file = LittleFS.open("/config.json", "w");
      if (file) {
        file.write(data, len);
        file.close();
        loadDccAddresses();
        String saveId = request->hasParam("_save") ? request->getParam("_save")->value() : "";
        String saveUser = request->hasParam("_user") ? request->getParam("_user")->value() : "";
        String sseMsg = "{\"_save\":\"" + saveId + "\",\"_user\":\"" + saveUser + "\"}";
        events->send(sseMsg.c_str(), "config-update");
        request->send(200, "text/plain", "OK");
      } else {
        request->send(500, "text/plain", "Erreur");
      }
  });

  server.on("/upload", HTTP_POST, [](AsyncWebServerRequest *request){},
    [](AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final) {
      static File uploadFile;
      if (!index) {
        uploadFile = LittleFS.open("/fond.jpg", "w");
        if (!uploadFile) {
          Serial.println("Upload: ECHEC ouverture fichier");
        } else {
          Serial.println("Upload: ouverture fichier OK");
        }
      }
      if (uploadFile) {
        uploadFile.write(data, len);
      }
      if (final) {
        if (uploadFile) {
          uploadFile.close();
          Serial.println("Upload: termine OK");
          request->send(200, "text/plain", "OK");
        } else {
          request->send(500, "text/plain", "Erreur ecriture fichier");
        }
      }
  });
  
  server.on("/config.json", HTTP_GET, [](AsyncWebServerRequest *request){
    if (LittleFS.exists("/config.json")) {
      AsyncWebServerResponse *response = request->beginResponse(LittleFS, "/config.json", "application/json");
      response->addHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      request->send(response);
    } else {
      request->send(404, "text/plain", "Not found");
    }
  });

  server.on("/fond.jpg", HTTP_GET, [](AsyncWebServerRequest *request){
    if (!LittleFS.exists("/fond.jpg")) {
      request->send(404, "text/plain", "Not found");
      return;
    }
    AsyncWebServerResponse *response = request->beginResponse(LittleFS, "/fond.jpg", "image/jpeg");
    request->send(response);
  });

  server.on("/icone.png", HTTP_GET, [](AsyncWebServerRequest *request){
    if (LittleFS.exists("/icone.png")) {
      AsyncWebServerResponse *response = request->beginResponse(LittleFS, "/icone.png", "image/png");
      response->addHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      request->send(response);
    } else {
      request->send(404, "text/plain", "Not found");
    }
  });

  server.on("/manifest.json", HTTP_GET, [](AsyncWebServerRequest *request){
    if (LittleFS.exists("/manifest.json")) {
      AsyncWebServerResponse *response = request->beginResponse(LittleFS, "/manifest.json", "application/json");
      response->addHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      response->addHeader("Pragma", "no-cache");
      response->addHeader("Expires", "0");
      request->send(response);
    } else {
      request->send(404, "text/plain", "Not found");
    }
  });

  server.on("/delete-plan", HTTP_GET, [](AsyncWebServerRequest *request){
    if (LittleFS.exists("/fond.jpg")) {
      LittleFS.remove("/fond.jpg");
      Serial.println("Plan de fond supprimé");
    }
    request->send(200, "text/plain", "OK");
  });

  server.on("/dccpinlog", HTTP_GET, [](AsyncWebServerRequest *request){
    if (request->hasParam("on")) {
      dccPinLogEnabled = request->getParam("on")->value() == "1";
      if (dccPinLogEnabled) events->send("{\"test\":true}", "dcc-pin");
      request->send(200, "text/plain", "OK");
    } else {
      request->send(400, "text/plain", "Missing param");
    }
  });

  server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html").setCacheControl("no-store");

  server.begin();
}

unsigned long lastWifiCheck = 0;
unsigned long lastHeartbeat = 0;
bool wifiWasConnected = false;

void loop() {
  ArduinoOTA.handle();

  unsigned long now = millis();
  if (now - lastHeartbeat >= 5000) {
    lastHeartbeat = now;
    events->send("{\"heartbeat\":true}", "dcc-ping");
  }
  Dcc.process();
  if (now - lastWifiCheck >= 3000) {
    lastWifiCheck = now;
    int s = WiFi.status();
    if (s == WL_CONNECTED) {
      if (!wifiWasConnected) {
        wifiWasConnected = true;
        Serial.print("WiFi connecte ! IP: ");
        Serial.println(WiFi.localIP().toString());
        MDNS.begin("AiguillageManager");
      }
    } else {
      if (wifiWasConnected) {
        wifiWasConnected = false;
        Serial.println("WiFi perdu, reconnexion...");
      }
      if (s == WL_DISCONNECTED || s == WL_CONNECTION_LOST || s == WL_CONNECT_FAILED) {
        WiFi.disconnect();
        delay(100);
        WiFi.begin(ssid, password);
      }
    }
  }

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(LED_BUILTIN, HIGH);
  } else {
    if ((now / 500) % 2 == 0) {
      digitalWrite(LED_BUILTIN, LOW);
    } else {
      digitalWrite(LED_BUILTIN, HIGH);
    }
  }

  int cur = digitalRead(DCC_PIN);
  if (cur != dccPinLastState && (now - lastDccPinEvent >= 50)) {
    dccPinLastState = cur;
    lastDccPinEvent = now;
    if (dccPinLogEnabled) {
      char buf[50];
      snprintf(buf, sizeof(buf), "{\"pin\":%d,\"state\":%d}", DCC_PIN, cur);
      events->send(buf, "dcc-pin");
    }
  }
  
  if (emergencyStopActive && emergencyStartTime > 0 && (millis() - emergencyStartTime >= 10000)) {
    emergencyStopActive = false;
  }
  
  if (signalPresent && !emergencyStopActive && (millis() - lastDccSignal >= DCC_SIGNAL_TIMEOUT)) {
    signalPresent = false;
    events->send("{\"present\":false}", "dcc-signal");
  }
  
  for (int i = 0; i < 40; i++) {
    if (pinTimers[i] > 0 && (millis() - pinTimers[i] >= 500)) {
      digitalWrite(i, LOW); 
      pinTimers[i] = 0;     
    }
  }
}
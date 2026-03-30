#include <Arduino.h>
#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <ESPmDNS.h>

const char* ssid = "TON_NOM_DE_WIFI";
const char* password = "TON_MOT_DE_PASSE";

AsyncWebServer server(80);

unsigned long pinTimers[40] = {0};

const int pinsAiguillages[6][2] = {
  {26, 17}, 
  {18, 19}, 
  {21, 22}, 
  {23, 25}, 
  {27, 32}, 
  {33, 14}  
};

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

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.print(".");
  }
  Serial.println("\nConnecté ! IP: " + WiFi.localIP().toString());

  if (!MDNS.begin("aiguillage")) {
    Serial.println("Erreur mDNS");
  } else {
    Serial.println("Alias mDNS démarré (http://aiguillage.local)");
  }

  server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html");

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
        request->send(200, "text/plain", "OK");
      } else {
        request->send(500, "text/plain", "Erreur");
      }
  });

  server.begin();
}

void loop() {
  for (int i = 0; i < 40; i++) {
    if (pinTimers[i] > 0 && (millis() - pinTimers[i] >= 500)) {
      digitalWrite(i, LOW); 
      pinTimers[i] = 0;     
    }
  }
}
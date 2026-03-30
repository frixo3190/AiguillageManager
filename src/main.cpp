#include <Arduino.h>
#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <ESPmDNS.h> // NOUVEAU : Bibliothèque pour l'alias

const char* ssid = "TON_NOM_DE_WIFI";
const char* password = "TON_MOT_DE_PASSE";

AsyncWebServer server(80);

void setup() {
  Serial.begin(115200);

  if (!LittleFS.begin(true)) {
    Serial.println("Erreur LittleFS");
    return;
  }

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.print(".");
  }
  Serial.println("\nConnecté ! IP: " + WiFi.localIP().toString());

  // NOUVEAU : Configuration de l'alias mDNS (http://aiguillage.local)
  if (!MDNS.begin("aiguillage")) {
    Serial.println("Erreur de configuration mDNS");
  } else {
    Serial.println("Alias mDNS démarré ! Tape http://aiguillage.local dans ton navigateur.");
  }

  server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html");

  // NOUVEAU : Route déclenchée quand un aiguillage est cliqué
  server.on("/switch", HTTP_GET, [](AsyncWebServerRequest *request){
    if(request->hasParam("id") && request->hasParam("mode")){
      String id = request->getParam("id")->value();
      String mode = request->getParam("mode")->value();
      
      // Affiche : "aiguillage 1 : mode 1" dans la console
      Serial.println("aiguillage " + id + " : mode " + mode); 
    }
    request->send(200, "text/plain", "OK");
  });

  // Route pour sauvegarder le fichier JSON
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
  // Rien ici
}
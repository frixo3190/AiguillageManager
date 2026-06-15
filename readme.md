# 🚂 AiguillageManager — TCO Wi-Fi & Décodeur DCC pour Aiguillages

**ESP32** pilotant 6 aiguillages à double solénoïde via une interface Web tactile et/ou commandes DCC (Roco MultiMAUS, Lenz, etc.).

---

## ✨ Fonctionnalités

### Interface Web (TCO tactile)
- Design glassmorphism, fond de plan personnalisable
- Mode Utilisateur / Mode Configuration
- Drag & drop des switchs, masquage, redimensionnement
- Zoom ×2 à ×10, zoom libre
- Panneau **Historique** des actions
- Panneau **DCC log** : toutes les commandes DCC reçues, avec filtre "aiguillages uniquement"
- **Gyrophare rouge** et sirène 3s quand le signal DCC est perdu
- Badge DCC OK / KO / Arrêt Urgence 🚨
- Bouton **Muette** 🔊/🔇 l'alerte sonore
- Clic sur "DCC OK" → historique DCC ; clic sur 📜 → historique actions

### DCC
- Détection et décodage des adresses d'aiguillage (formule universelle `((addr-33016)/256)*4 + ((addr-33016)%256)/2 + 1`)
- Mapping configurable : chaque switch peut répondre à n'importe quelle adresse DCC (1-99)
- Ordres d'ouverture / fermeture avec sons distincts (notes ascendantes/descendantes)
- Arrêt d'urgence (overlay rouge + badge clignotant + son)
- `logdcc(true/false)` — log brut en console
- `logPin(true/false)` — monitoring de la pin DCC

### WiFi
- Connexion non-bloquante (le serveur démarre sans attendre le WiFi)
- Reconnexion automatique
- LED interne clignote si WiFi perdu
- OTA (mise à jour firmware et filesystem par WiFi)
- Heartbeat toutes les 5s avec timeout 15s (détection de perte de connexion)

### Console navigateur
| Commande | Description |
|----------|-------------|
| `help()` | Affiche l'aide |
| `logdcc(true/false)` | Log DCC brut dans la console |
| `logPin(true/false)` | Active la surveillance pin DCC |
| `cancel_detect_dcc_off(true/false)` | Ignore la perte de signal DCC |

---

## 🛠️ Hardware

- ESP32 (Wemos D1 mini32)
- Optocoupleur 6N137 pour isolation DCC
- 12 MOSFETs pour piloter 6 aiguillages double-bobine
- Protection anti-surchauffe (impulsions 500ms)
- Synchronisation physique au démarrage (impulsions espacées 600ms)

---

## 🔐 Fichier `secrets.h` (obligatoire)

Avant de compiler, crée le fichier `src/secrets.h` avec tes identifiants WiFi :

```cpp
#ifndef SECRETS_H
#define SECRETS_H

#define WIFI_SSID "ton_ssid"
#define WIFI_PASSWORD "ton_mot_de_passe"

#endif
```

Ce fichier est dans `.gitignore` → pas de risque de l'uploader sur GitHub.

---

## 📦 Upload & Flash

### Première fois (filaire USB)
```bash
pio run -t upload           # Flash firmware
pio run --target uploadfs   # Upload filesystem (HTML/CSS/JS/images)
```

### OTA (mise à jour WiFi)
```bash
pio run -t upload --upload-port AiguillageManager.local
pio run --target uploadfs --upload-port AiguillageManager.local
```

---

## 🔧 Configuration

### Attribution d'adresse DCC
1. Passer en **Mode Configuration**
2. Cliquer droit sur un switch → "Attribuer une adresse d'aiguillage"
3. Saisir un numéro (1-99)
4. Le numéro s'affiche sur le switch

### Plan de fond
1. Mode Configuration → "Plan" → Upload/Photo
2. L'image est redimensionnée à 1920px max et stockée sur l'ESP

---

## 🔄 Historique des versions

- **v1.15+** : Mapping DCC configurable, panneau DCC log, gyrophare, sirène, OTA, heartbeat, badges DCC OK/KO/Urgence

---

## 🧩 Licence & Crédits

Développé sous supervision humaine, code généré par IA.
Librairies : NmraDcc, ESPAsyncWebServer, ArduinoJson.

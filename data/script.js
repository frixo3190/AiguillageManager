let isEditing = false;
let config = { switches: [] };
let eventSource = null;

const map = document.getElementById('layout-map');
const modeBtn = document.getElementById('mode-btn');
const adminPanel = document.getElementById('admin-panel');
const bgUpload = document.getElementById('bg-upload');

// --- NOUVEAU : Éléments de l'historique ---
const historyBtn = document.getElementById('history-btn');
const historyPanel = document.getElementById('history-panel');
const historyList = document.getElementById('history-list');

// Fonction pour ajouter un message à l'historique
function logAction(message) {
    const now = new Date();
    const timeString = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    const li = document.createElement('li');
    li.className = 'history-item';
    li.innerHTML = `<span class="history-time">${timeString}</span><span>${message}</span>`;
    
    historyList.prepend(li); // Ajoute en haut de la liste

    // On limite à 50 messages pour la fluidité
    if (historyList.children.length > 50) {
        historyList.removeChild(historyList.lastChild);
    }
}

// Afficher/Cacher le panneau d'historique
historyBtn.onclick = () => {
    historyPanel.classList.toggle('hidden');
};
// ------------------------------------------

function initEventSource() {
    if (eventSource) eventSource.close();
    
    eventSource = new EventSource('/events');
    
    eventSource.addEventListener('dcc-switch', (e) => {
        try {
            const data = JSON.parse(e.data);
            handleDccSwitch(data.id, data.state);
        } catch (err) {
            console.error('SSE parse error:', err);
        }
    });
    
    eventSource.addEventListener('emergency-stop', (e) => {
        try {
            const data = JSON.parse(e.data);
            if (data.active) {
                emergencyOverlay.classList.remove('hidden');
                logAction('⚠️ ARRÊT D\'URGENCE DCC');
            } else {
                emergencyOverlay.classList.add('hidden');
                logAction('Arrêt d\'urgence levé');
            }
        } catch (err) {
            console.error('SSE parse error:', err);
        }
    });
    
    eventSource.addEventListener('dcc-signal', (e) => {
        try {
            const data = JSON.parse(e.data);
            const signalDot = signalIndicator.querySelector('.signal-dot');
            const signalText = signalIndicator.querySelector('.signal-text');
            if (data.present) {
                signalIndicator.className = 'signal-ok';
                signalText.textContent = 'DCC OK';
                logAction('Signal DCC détecté');
            } else {
                signalIndicator.className = 'signal-lost';
                signalText.textContent = 'Aucun signal';
                logAction('⚠️ Aucun signal DCC');
            }
        } catch (err) {
            console.error('SSE parse error:', err);
        }
    });
    
    eventSource.onerror = () => {
        console.log('SSE reconnecting...');
    };
}

function handleDccSwitch(switchId, state) {
    config.switches[switchId].state = state;
    renderSwitches();
    logAction(`Aiguillage ${switchId + 1} basculé en Mode ${state + 1} (DCC)`);
    saveConfig();
}

const emergencyOverlay = document.getElementById('emergency-overlay');
const signalIndicator = document.getElementById('signal-indicator');

let imgTest = new Image();
imgTest.src = `/fond.jpg?t=${new Date().getTime()}`;
imgTest.onload = () => map.style.backgroundImage = `url('${imgTest.src}')`;
imgTest.onerror = () => {
    let savedBg = localStorage.getItem('trainBg');
    if (savedBg) map.style.backgroundImage = `url('${savedBg}')`;
};

fetch('/config.json')
    .then(response => {
        if (!response.ok) throw new Error("Fichier absent");
        return response.json();
    })
    .then(data => {
        config = data;
        localStorage.setItem('trainConfig', JSON.stringify(config)); 
        renderSwitches();
        logAction("Système démarré et synchronisé");
        initEventSource();
    })
    .catch(error => {
        let savedConfig = localStorage.getItem('trainConfig');
        if (savedConfig) {
            config = JSON.parse(savedConfig);
            logAction("Démarrage sur config de secours");
        } else {
            config = {
                switches: [
                    { x: 100, y: 100, state: 0, visible: true },
                    { x: 200, y: 100, state: 0, visible: true },
                    { x: 300, y: 100, state: 0, visible: true },
                    { x: 400, y: 100, state: 0, visible: true },
                    { x: 500, y: 100, state: 0, visible: true },
                    { x: 600, y: 100, state: 0, visible: true }
                ]
            };
            logAction("Démarrage sur config par défaut");
        }
        renderSwitches();
    });

function renderSwitches() {
    map.innerHTML = ''; 
    config.switches.forEach((sw, index) => {
        let btn = document.createElement('div');
        btn.className = 'switch';
        btn.style.left = sw.x + 'px';
        btn.style.top = sw.y + 'px';
        btn.style.backgroundColor = sw.state === 0 ? "#34c759" : "#ffcc00"; 
        
        btn.innerHTML = index + 1;

        if (sw.visible === false) {
            btn.classList.add('hidden-switch');
        }

        let hideBtn = document.createElement('div');
        hideBtn.className = 'hide-btn';
        hideBtn.innerHTML = sw.visible === false ? '👁️' : '❌';
        hideBtn.onpointerdown = (e) => {
            e.stopPropagation(); 
            config.switches[index].visible = config.switches[index].visible === false ? true : false;
            
            // Log d'action
            logAction(config.switches[index].visible ? `Aiguillage ${index + 1} affiché` : `Aiguillage ${index + 1} masqué`);
            
            renderSwitches();
            saveConfig();
        };
        btn.appendChild(hideBtn);
        
        btn.onpointerdown = (e) => handleInteraction(e, index, btn);
        map.appendChild(btn);
    });
}

function handleInteraction(e, index, btn) {
    e.preventDefault(); 
    
    if (isEditing) {
        btn.setPointerCapture(e.pointerId);
        document.onpointermove = (eMove) => {
            let newX = eMove.clientX - map.getBoundingClientRect().left;
            let newY = eMove.clientY - map.getBoundingClientRect().top;
            btn.style.left = newX + 'px';
            btn.style.top = newY + 'px';
            config.switches[index].x = newX;
            config.switches[index].y = newY;
        };
        document.onpointerup = () => {
            document.onpointermove = null;
            document.onpointerup = null;
            btn.releasePointerCapture(e.pointerId);
            
            logAction(`Aiguillage ${index + 1} déplacé`);
            saveConfig();
        };
    } else {
        config.switches[index].state = config.switches[index].state === 0 ? 1 : 0;
        let mode = config.switches[index].state + 1; 
        
        logAction(`Aiguillage ${index + 1} basculé en Mode ${mode}`);
        
        fetch(`/switch?id=${index + 1}&mode=${mode}`).catch(()=>console.log("Mode local uniquement"));
        
        renderSwitches();
        saveConfig();
    }
}

function saveConfig() {
    localStorage.setItem('trainConfig', JSON.stringify(config));
    
    fetch('/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    }).catch(err => console.error("Erreur de sauvegarde serveur"));
}

modeBtn.onclick = () => {
    isEditing = !isEditing;
    map.classList.toggle('editing');

    if (isEditing) {
        modeBtn.innerHTML = "🔓 Mode Configuration";
        modeBtn.classList.remove('btn-user');
        modeBtn.classList.add('btn-config');
        adminPanel.classList.remove('hidden');
        logAction("Accès au Mode Configuration");
    } else {
        modeBtn.innerHTML = "🔒 Mode Utilisateur";
        modeBtn.classList.remove('btn-config');
        modeBtn.classList.add('btn-user');
        adminPanel.classList.add('hidden');
        logAction("Retour au Mode Utilisateur");
    }
};

bgUpload.addEventListener('change', function(event) {
    event.stopPropagation();
    event.preventDefault();

    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const imgData = e.target.result;
            map.style.backgroundImage = `url('${imgData}')`;
            try { localStorage.setItem('trainBg', imgData); } catch (error) {} 
        };
        reader.readAsDataURL(file);

        const formData = new FormData();
        formData.append("image", file, "fond.jpg");

        fetch('/upload', {
            method: 'POST',
            body: formData
        }).then(() => logAction("Nouvelle image de fond téléchargée"))
          .catch(err => console.error("Erreur upload"));
    }
}, false);
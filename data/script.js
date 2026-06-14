let isEditing = false;
let config = { switches: [] };
let eventSource = null;
let userName = '';
let dccLogEnabled = false;
let cancelDccOff = false;
let dccMuted = localStorage.getItem('dccMuted') === '1';
let dccAlertCtx = null;
function logdcc(enabled) { dccLogEnabled = enabled; }
function cancel_detect_dcc_off(enabled) { cancelDccOff = enabled; }
function logPin(enabled) {
    fetch('/dccpinlog?on=' + (enabled ? 1 : 0))
        .then(r => r.text())
        .then(t => console.log('[logPin] ESP repond:', t))
        .catch(e => console.error('[logPin] Erreur ESP:', e));
}
function help() {
    console.log('%c AiguillageManager - Commandes disponibles', 'font-size:14px;font-weight:700;color:#0a84ff');
    console.log('  %clogdcc(true/false)%c          →  Log DCC brut dans la console', 'color:#ffcc00', 'color:#888');
    console.log('  %clogPin(true/false)%c          →  Log changements d\'état pin DCC', 'color:#ffcc00', 'color:#888');
    console.log('  %ccancel_detect_dcc_off(true/false)%c  →  Ignore la perte de signal DCC', 'color:#ffcc00', 'color:#888');
    console.log('  %chelp()%c                      →  Affiche cette aide', 'color:#ffcc00', 'color:#888');
}

const map = document.getElementById('layout-map');
const switchesContainer = document.getElementById('switches-container');
const modeBtn = document.getElementById('mode-btn');
const adminPanel = document.getElementById('admin-panel');
const adminButtons = document.getElementById('admin-buttons');
const planBtn = document.getElementById('plan-btn');
const planMenu = document.getElementById('plan-menu');
const planDelete = document.getElementById('plan-delete');
const bgUpload = document.getElementById('bg-upload');
const bgCamera = document.getElementById('bg-camera');

// --- LOGIN MODAL ---
let dccLogEntries = [];

const loginOverlay = document.getElementById('login-overlay');
const loginInput = document.getElementById('login-input');
const loginSuggestions = document.getElementById('login-suggestions');
const loginBtn = document.getElementById('login-btn');
const userBtn = document.getElementById('user-btn');
const userMenu = document.getElementById('user-menu');

function getSavedUsers() {
    try { return JSON.parse(localStorage.getItem('trainUsers') || '[]'); } catch { return []; }
}

function saveUser(name) {
    if (!name.trim()) return;
    let users = getSavedUsers().filter(u => u !== name.trim());
    users.unshift(name.trim());
    if (users.length > 6) users = users.slice(0, 6);
    try { localStorage.setItem('trainUsers', JSON.stringify(users)); } catch {}
}

function renderSuggestions() {
    loginSuggestions.innerHTML = '';
    getSavedUsers().forEach(name => {
        const chip = document.createElement('div');
        chip.className = 'login-suggestion';
        chip.textContent = name;
        chip.onclick = () => { loginInput.value = name; doLogin(); };
        loginSuggestions.appendChild(chip);
    });
}

function doLogin() {
    const name = loginInput.value.trim();
    if (!name) return;
    setUserName(name);
    saveUser(name);
    loginOverlay.style.animation = 'login-fade-out 0.3s ease-in forwards';
    setTimeout(() => {
        loginOverlay.style.display = 'none';
        startApp();
    }, 300);
}

loginBtn.onclick = doLogin;
loginInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
loginInput.focus();
renderSuggestions();

userBtn.onclick = (e) => {
    e.stopPropagation();
    userMenu.classList.toggle('hidden');
    zoomPicker.classList.add('hidden');
    historyPanel.classList.add('hidden');
    dccLogPanel.classList.add('hidden');
};

document.addEventListener('click', () => userMenu.classList.add('hidden'));

document.getElementById('logout-btn').onclick = () => {
    userMenu.classList.add('hidden');
    userName = '';
    loginInput.value = '';
    if (typeof startApp !== 'undefined') {
        location.reload();
    }
};

function setUserName(name) {
    userName = name;
    userBtn.innerHTML = '👤 ' + name;
}
// --------------------

planBtn.onclick = (e) => {
    e.stopPropagation();
    planMenu.classList.toggle('hidden');
    const hasBg = map.style.backgroundImage && map.style.backgroundImage !== 'none';
    planDelete.style.display = hasBg ? '' : 'none';
};

document.addEventListener('click', () => planMenu.classList.add('hidden'));

document.getElementById('plan-upload').onclick = () => bgUpload.click();
document.getElementById('plan-photo').onclick = () => bgCamera.click();

planDelete.onclick = () => {
    planMenu.classList.add('hidden');
    map.style.backgroundImage = 'none';
    logAction("🗑️ Plan de fond supprimé");
    fetch('/delete-plan').catch(()=>{});
};

const otherBtn = document.getElementById('other-btn');
const otherMenu = document.getElementById('other-menu');

otherBtn.onclick = (e) => {
    e.stopPropagation();
    otherMenu.classList.toggle('hidden');
};

document.getElementById('export-btn').onclick = () => {
    otherMenu.classList.add('hidden');
    const data = JSON.stringify(config, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aiguillage_config.json';
    a.click();
    URL.revokeObjectURL(url);
    logAction("📥 Configuration exportée");
};

document.getElementById('import-btn').onclick = () => {
    otherMenu.classList.add('hidden');
    document.getElementById('import-file').click();
};

document.getElementById('import-file').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;
    this.value = '';
    uploadModal.classList.remove('hidden');
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.switches || !Array.isArray(data.switches)) {
                throw new Error("Format invalide");
            }
            config = data;
            fetch('/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            }).then(r => r.text()).then(text => {
                if (text === "OK") {
                    logAction("📤 Configuration importée avec succès");
                } else {
                    logAction("⚠ Erreur lors de l'import");
                }
                uploadModal.classList.add('hidden');
                renderSwitches();
            }).catch(() => {
                uploadModal.classList.add('hidden');
                errorText.textContent = "Erreur de communication avec l'ESP32";
                errorModal.classList.remove('hidden');
            });
        } catch (err) {
            uploadModal.classList.add('hidden');
            errorText.textContent = "Erreur : fichier de configuration invalide";
            errorModal.classList.remove('hidden');
        }
    };
    reader.readAsText(file);
});

// --- NOUVEAU : Éléments de l'historique ---
const historyBtn = document.getElementById('history-btn');
const historyPanel = document.getElementById('history-panel');
const historyList = document.getElementById('history-list');
const historyClear = document.getElementById('history-clear');
historyClear.onclick = () => { historyList.innerHTML = ''; };

const dccLogPanel = document.getElementById('dcc-log-panel');
const dccLogList = document.getElementById('dcc-log-list');
const dccLogClear = document.getElementById('dcc-log-clear');
const dccLogFilter = document.getElementById('dcc-log-filter-switch');
let dccLogFilterOn = false;
dccLogFilter.onchange = () => {
    dccLogFilterOn = dccLogFilter.checked;
    renderDccLog();
};

const uploadModal = document.getElementById('upload-modal');
const errorModal = document.getElementById('error-modal');
const errorText = document.getElementById('error-text');
const errorDismiss = document.getElementById('error-dismiss');
const addressModal = document.getElementById('address-modal');
const addressInput = document.getElementById('address-input');
const addressCancel = document.getElementById('address-cancel');
const addressValidate = document.getElementById('address-validate');
const emergencyOverlay = document.getElementById('emergency-overlay');
const signalIndicator = document.getElementById('dcc-status');
const dccBeacon = document.getElementById('dcc-beacon');
const reconnectModal = document.getElementById('reconnect-modal');
const muteBtn = document.getElementById('mute-btn');

muteBtn.textContent = dccMuted ? '🔇' : '🔊';
muteBtn.onclick = () => {
    dccMuted = !dccMuted;
    localStorage.setItem('dccMuted', dccMuted ? '1' : '0');
    muteBtn.textContent = dccMuted ? '🔇' : '🔊';
};

signalIndicator.onclick = (e) => {
    e.stopPropagation();
    dccLogPanel.classList.toggle('hidden');
    zoomPicker.classList.add('hidden');
    userMenu.classList.add('hidden');
    historyPanel.classList.add('hidden');
    if (!dccLogPanel.classList.contains('hidden')) renderDccLog();
};

dccLogClear.onclick = () => {
    dccLogEntries = [];
    dccLogList.innerHTML = '';
};

errorDismiss.onclick = () => errorModal.classList.add('hidden');

const orientationOverlay = document.getElementById('orientation-overlay');

function checkOrientation() {
    if (window.innerHeight > window.innerWidth) {
        orientationOverlay.classList.remove('hidden');
    } else {
        orientationOverlay.classList.add('hidden');
    }
}
const orientMedia = window.matchMedia('(orientation: portrait)');
orientMedia.addEventListener('change', checkOrientation);
window.addEventListener('resize', checkOrientation);
checkOrientation();

document.addEventListener('contextmenu', e => e.preventDefault());

let zoomLevel = 1;
const zoomLayer = document.getElementById('zoom-layer');
const zoomPicker = document.getElementById('zoom-picker');
const zoomBtn = document.getElementById('zoom-btn');
const zoomTabs = document.getElementById('zoom-tabs');
const zoomCancel = document.getElementById('zoom-cancel');

zoomBtn.onclick = () => {
    zoomPicker.classList.toggle('hidden');
    updateZoomCancel();
    userMenu.classList.add('hidden');
    historyPanel.classList.add('hidden');
    dccLogPanel.classList.add('hidden');
};

let freeZoomActive = false;
let pendingSaveIds = [];
let freeZoomScale = 1;
let freeZoomX = 0, freeZoomY = 0;
let lastTouchDist = 0;
let lastTouchX = 0, lastTouchY = 0;

zoomPicker.querySelectorAll('button[data-zoom]').forEach(btn => {
    btn.onclick = () => {
        freeZoomActive = false;
        zoomLevel = parseInt(btn.dataset.zoom) || 1;
        zoomPicker.classList.add('hidden');
        applyZoom();
    };
});

document.getElementById('zoom-free').onclick = () => {
    zoomPicker.classList.add('hidden');
    freeZoomActive = true;
    freeZoomScale = 1;
    freeZoomX = 0;
    freeZoomY = 0;
    applyZoom();
    zoomBtn.innerHTML = "🔓 Zoom libre";
};

function updateZoomCancel() {
    zoomCancel.classList.toggle('hidden', zoomLevel <= 1 && !freeZoomActive);
}

zoomCancel.onclick = () => {
    freeZoomActive = false;
    zoomLevel = 1;
    zoomPicker.classList.add('hidden');
    applyZoom();
};

zoomLayer.addEventListener('touchstart', (e) => {
    if (!freeZoomActive) return;
    if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDist = Math.hypot(dx, dy);
    } else if (e.touches.length === 1) {
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
    }
}, { passive: true });

zoomLayer.addEventListener('touchmove', (e) => {
    if (!freeZoomActive) return;
    e.preventDefault();
    if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        if (lastTouchDist > 0) {
            const ratio = dist / lastTouchDist;
            freeZoomScale = Math.max(1, Math.min(10, freeZoomScale * ratio));
        }
        lastTouchDist = dist;
        applyZoom();
    } else if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - lastTouchX;
        const dy = e.touches[0].clientY - lastTouchY;
        freeZoomX += dx;
        freeZoomY += dy;
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
        applyZoom();
    }
}, { passive: false });

document.addEventListener('wheel', (e) => {
    if (!freeZoomActive) return;
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    freeZoomScale = Math.max(1, Math.min(10, freeZoomScale * factor));
    const mx = e.clientX, my = e.clientY;
    freeZoomX = mx - (mx - freeZoomX) * factor;
    freeZoomY = my - (my - freeZoomY) * factor;
    applyZoom();
}, { passive: false });

let freeZoomPanning = false;
zoomLayer.addEventListener('pointerdown', (e) => {
    if (!freeZoomActive || e.target.closest('.switch')) return;
    freeZoomPanning = true;
    lastTouchX = e.clientX;
    lastTouchY = e.clientY;
    zoomLayer.setPointerCapture(e.pointerId);
});
zoomLayer.addEventListener('pointermove', (e) => {
    if (!freeZoomPanning) return;
    freeZoomX += e.clientX - lastTouchX;
    freeZoomY += e.clientY - lastTouchY;
    lastTouchX = e.clientX;
    lastTouchY = e.clientY;
    applyZoom();
});
zoomLayer.addEventListener('pointerup', () => {
    freeZoomPanning = false;
});

function applyZoom() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    if (freeZoomActive) {
        zoomLayer.style.overflow = 'hidden';
        map.style.width = '';
        map.style.height = '';
        switchesContainer.style.width = '';
        switchesContainer.style.height = '';
        zoomLayer.style.transform = `translate(${freeZoomX}px, ${freeZoomY}px) scale(${freeZoomScale})`;
        zoomLayer.style.transformOrigin = '0 0';
        zoomTabs.classList.remove('hidden');
        zoomBtn.innerHTML = `🔍 Libre ×${freeZoomScale.toFixed(1)}`;
    } else if (zoomLevel > 1) {
        zoomLayer.style.overflow = '';
        zoomLayer.style.transform = '';
        map.style.width = `${w * zoomLevel}px`;
        map.style.height = `${h * zoomLevel}px`;
        switchesContainer.style.width = `${w * zoomLevel}px`;
        switchesContainer.style.height = `${h * zoomLevel}px`;
        zoomLayer.scrollLeft = 0;
        zoomLayer.scrollTop = 0;
        zoomTabs.classList.remove('hidden');
        zoomBtn.innerHTML = `🔍 Zoom [×${zoomLevel}]`;
    } else {
        zoomLayer.style.overflow = '';
        zoomLayer.style.transform = '';
        map.style.width = '';
        map.style.height = '';
        switchesContainer.style.width = '';
        switchesContainer.style.height = '';
        zoomTabs.classList.add('hidden');
        zoomBtn.innerHTML = "🔍 Zoom";
    }

    renderSwitches();
    updateZoomCancel();
}

function renderZoomTabs() {
    zoomTabs.innerHTML = '';
    config.switches.forEach((sw, index) => {
        const tab = document.createElement('button');
        tab.className = 'zoom-tab';
        tab.style.backgroundColor = sw.state === 0 ? "#34c759" : "#ffcc00";
        tab.textContent = index + 1;
        tab.onclick = (e) => {
            e.stopPropagation();
            config.switches[index].state = config.switches[index].state === 0 ? 1 : 0;
            let mode = config.switches[index].state + 1;
            let modeLabel = mode === 1 ? 'Ouverture' : 'Fermeture';
            logAction(`Aiguillage ${index + 1} basculé en ${modeLabel} (zoom)`);
            dccPlaySwitch(modeLabel);
            fetch(`/switch?id=${index + 1}&mode=${mode}&user=${encodeURIComponent(userName)}`).catch(()=>{});
            updateSwitchAppearance(index);
            saveConfig();
        };
        zoomTabs.appendChild(tab);
    });
}

const toastContainer = document.getElementById('toast-container');

function showToast(message) {
    const el = document.createElement('div');
    el.className = 'toast';

    let icon = 'info';
    let glyph = 'ℹ️';
    if (message.includes('⚠')) { icon = 'warn'; glyph = '⚠️'; }
    else if (message.includes('✓')) { icon = 'ok'; glyph = '✓'; }
    else if (message.includes('✕') || message.includes('Erreur') || message.includes('Échec')) { icon = 'err'; glyph = '✕'; }
    else if (message.includes('⇄')) { icon = 'ok'; glyph = '🔄'; }
    else if (message.includes('Ouverture')) { icon = 'ok'; glyph = ''; }
    else if (message.includes('Fermeture')) { icon = 'warn'; glyph = ''; }
    else if (message.includes('⚡') || message.includes('ARRÊT')) { icon = 'warn'; glyph = '⚡'; }

    let svg = '';
    if (message.includes('Ouverture')) {
        svg = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 3 L12 12 L4 21" stroke="#ff3b30" stroke-width="2.8" fill="none" stroke-linecap="round"/><path d="M12 3 L12 12 L20 21" stroke="rgba(255,255,255,0.2)" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
    } else if (message.includes('Fermeture')) {
        svg = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 3 L12 12 L20 21" stroke="#ff3b30" stroke-width="2.8" fill="none" stroke-linecap="round"/><path d="M12 3 L12 12 L4 21" stroke="rgba(255,255,255,0.2)" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
    }

    el.innerHTML = `<span class="toast-icon ${icon}">${svg || glyph}</span><span>${message}</span>`;
    el.onclick = () => {
        el.classList.add('fade-out');
        setTimeout(() => el.remove(), 300);
    };
    toastContainer.appendChild(el);

    setTimeout(() => {
        if (el.isConnected) {
            el.classList.add('fade-out');
            setTimeout(() => el.remove(), 300);
        }
    }, 3000);
}

// Fonction pour ajouter un message à l'historique
function logAction(message, noToast) {
    const now = new Date();
    const timeString = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    const li = document.createElement('li');
    li.className = 'history-item';
    li.innerHTML = `<span class="history-time">${timeString}</span><span>${message}</span>`;
    
    historyList.prepend(li);

    if (historyList.children.length > 50) {
        historyList.removeChild(historyList.lastChild);
    }

    if (!noToast) showToast(message);
}

// Afficher/Cacher le panneau d'historique
historyBtn.onclick = (e) => {
    e.stopPropagation();
    historyPanel.classList.toggle('hidden');
    zoomPicker.classList.add('hidden');
    userMenu.classList.add('hidden');
    dccLogPanel.classList.add('hidden');
};

document.addEventListener('click', () => {
    if (!historyPanel.classList.contains('hidden')) {
        historyPanel.classList.add('hidden');
    }
});

historyPanel.addEventListener('click', (e) => e.stopPropagation());
// ------------------------------------------

document.addEventListener('click', () => {
    if (!dccLogPanel.classList.contains('hidden')) {
        dccLogPanel.classList.add('hidden');
    }
});

dccLogPanel.addEventListener('click', (e) => e.stopPropagation());

eventSource = new EventSource('/events');

function onSSEEvent(e) {
    espJoignable();
    return e;
}

eventSource.addEventListener('dcc-switch', (e) => {
    onSSEEvent(e);
    try {
        const data = JSON.parse(e.data);
        let key = `sw-${data.id}-${data.state}`;
        if (dccLogEnabled && key !== lastDccKey) {
            let addr = data.address !== undefined ? data.address : (data.id * 2 + 33016 + (data.state || 0));
            let cmd = data.cmd !== undefined ? data.cmd : '?';
            console.log(`[DCC] {address: ${addr}, cmd: ${cmd}, state: ${data.state}, source: "${data.source}"}`);
        }
        dccLogAdd('sw', data);
        handleDccSwitch(data.id, data.state, data.source, data.user || '');
    } catch (err) {
        console.error('SSE parse error:', err);
    }
});

eventSource.addEventListener('config-update', (e) => {
    onSSEEvent(e);
    try {
        const d = JSON.parse(e.data);
        if (d._save && pendingSaveIds.includes(d._save)) return;
        if (d._user && d._user === userName) return;
        if (d._user) {
            logAction(`👤 ${d._user} a modifié la configuration`);
        } else if (!d._user) {
            logAction("🔄 Configuration mise à jour par un autre utilisateur");
        }
    } catch (_) {
        logAction("🔄 Configuration mise à jour par un autre utilisateur");
    }
    fetch('/config.json')
        .then(r => r.json())
        .then(data => {
            config = data;
            renderSwitches();
        });
});

eventSource.addEventListener('emergency-stop', (e) => {
    onSSEEvent(e);
    try {
        const data = JSON.parse(e.data);
        const signalText = signalIndicator.querySelector('.signal-text');
        if (data.active) {
            dccSignalPresent = true;
            emergencyOverlay.classList.remove('hidden');
            signalIndicator.className = 'signal-emergency';
            signalText.textContent = 'ARRET URGENCE';
            dccBeacon.classList.add('hidden');
            logAction('⚠️ ARRÊT D\'URGENCE DCC');
        } else {
            emergencyOverlay.classList.add('hidden');
            const signalText = signalIndicator.querySelector('.signal-text');
            if (dccSignalPresent) {
                signalIndicator.className = 'signal-ok';
                signalText.textContent = 'DCC OK';
                dccBeacon.classList.add('hidden');
            } else if (!cancelDccOff) {
                signalIndicator.className = 'signal-ko';
                signalText.innerHTML = '🚨 DCC KO ou Arrêt urgence';
                dccBeacon.classList.remove('hidden');
            }
            logAction('Arrêt d\'urgence levé');
        }
    } catch (err) {
        console.error('SSE parse error:', err);
    }
});

eventSource.addEventListener('dcc-signal', (e) => {
    onSSEEvent(e);
    try {
        const data = JSON.parse(e.data);
        const signalDot = signalIndicator.querySelector('.signal-dot');
        const signalText = signalIndicator.querySelector('.signal-text');
        if (data.present) {
            dccSignalPresent = true;
            signalIndicator.className = 'signal-ok';
            signalText.textContent = 'DCC OK';
            dccBeacon.classList.add('hidden');
            logAction('Signal DCC détecté');
        } else {
            dccSignalPresent = false;
            if (emergencyOverlay.classList.contains('hidden') && !cancelDccOff) {
                signalIndicator.className = 'signal-ko';
                signalText.innerHTML = '🚨 DCC KO ou Arrêt urgence';
                dccBeacon.classList.remove('hidden');
                dccPlayAlert();
            }
            logAction('⚠️ Aucun signal DCC');
        }
    } catch (err) {
        console.error('SSE parse error:', err);
    }
});

eventSource.addEventListener('dcc-unknown', (e) => {
    onSSEEvent(e);
    try {
        const data = JSON.parse(e.data);
            let sn = dccAddrToSwitchNum(data.address, data.cmd);
        let key = `un-${data.address}-${data.cmd}`;
        if (dccLogEnabled && key !== lastDccKey) console.log(`[DCC] {address: ${data.address}, cmd: ${data.cmd}}`);
        dccLogAdd('un', data);
    } catch (err) {
        console.error('SSE parse error:', err);
    }
});

eventSource.addEventListener('dcc-emergency', (e) => {
    onSSEEvent(e);
    try {
        const data = JSON.parse(e.data);
        dccLogAdd('em', data);
        let key = `em-1`;
        if (dccLogEnabled && key !== lastDccKey) console.log('[DCC] {emergency: true}');
    } catch (err) {
        console.error('SSE parse error:', err);
    }
});

eventSource.addEventListener('dcc-pin', (e) => {
    onSSEEvent(e);
    console.log('[PIN]', e.data);
});

eventSource.addEventListener('dcc-ping', (e) => {
    onSSEEvent(e);
});

function dccPlayAlert() {
    if (dccMuted) return;
    try {
        if (!dccAlertCtx) dccAlertCtx = new (window.AudioContext || window.webkitAudioContext)();
        var o = dccAlertCtx.createOscillator();
        var g = dccAlertCtx.createGain();
        o.type = 'sawtooth';
        g.gain.value = 0.08;
        o.connect(g);
        g.connect(dccAlertCtx.destination);
        o.start();
        var t = dccAlertCtx.currentTime;
        for (var i = 0; i < 6; i++) {
            o.frequency.setValueAtTime(250, t + i * 0.5);
            o.frequency.linearRampToValueAtTime(500, t + i * 0.5 + 0.25);
            o.frequency.linearRampToValueAtTime(250, t + i * 0.5 + 0.5);
        }
        g.gain.setValueAtTime(0.08, t);
        g.gain.linearRampToValueAtTime(0.08, t + 2.8);
        g.gain.linearRampToValueAtTime(0.001, t + 3);
        o.stop(t + 3);
    } catch (_) {}
}

function dccPlaySwitch(modeLabel) {
    if (dccMuted) return;
    try {
        if (!dccAlertCtx) dccAlertCtx = new (window.AudioContext || window.webkitAudioContext)();
        var now = dccAlertCtx.currentTime;
        var isOuverture = modeLabel === 'Ouverture';
        var freq1 = isOuverture ? 440 : 660;
        var freq2 = isOuverture ? 660 : 440;
        for (var i = 0; i < 2; i++) {
            var o = dccAlertCtx.createOscillator();
            var g = dccAlertCtx.createGain();
            o.type = 'triangle';
            o.frequency.value = i === 0 ? freq1 : freq2;
            g.gain.value = 0.08;
            o.connect(g);
            g.connect(dccAlertCtx.destination);
            o.start(now + i * 0.15);
            g.gain.setValueAtTime(0.08, now + i * 0.15);
            g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.12);
            o.stop(now + i * 0.15 + 0.12);
        }
    } catch (_) {}
}

let dccSignalPresent = true;
let lastHeartbeat = Date.now();

let reconnectModalTime = 0;

function espJoignable() {
    lastHeartbeat = Date.now();
    reconnectModal.classList.add('hidden');
    reconnectModalTime = 0;
}

function espNonJoignable() {
    if (!reconnectModal.classList.contains('hidden')) return;
    reconnectModal.classList.remove('hidden');
    reconnectModalTime = Date.now();
    console.log("esp non joignable");
}

eventSource.onopen = espJoignable;
eventSource.onerror = espNonJoignable;

setInterval(() => {
    if (Date.now() - lastHeartbeat > 15000) {
        if (!reconnectModal.classList.contains('hidden')) {
            if (reconnectModalTime > 0 && Date.now() - reconnectModalTime > 30000) {
                console.log("ESP toujours pas joignable apres 30s, rechargement...");
                location.reload();
            }
            return;
        }
        reconnectModal.classList.remove('hidden');
        reconnectModalTime = Date.now();
        console.log("esp non joignable");
    }
}, 3000);

function dccAddrToSwitchNum(addr, cmd) {
    let base = addr - 33016;
    let n = Math.floor(base / 256) * 4 + Math.floor((base % 256) / 2) + 1;
    if (n >= 1 && n <= 99) return n;
    return null;
}

function dccOrderType(addr) {
    return (addr % 2) + 1;
}

let lastDccKey = null;

function dccLogAdd(type, data) {
    let key;
    if (type === 'sw') key = `sw-${data.id}-${data.state}`;
    else if (type === 'em') key = 'em';
    else key = `un-${data.address}-${data.cmd}`;
    if (key === lastDccKey) return;
    lastDccKey = key;
    dccLogEntries.push({ type, data, time: new Date() });
    renderDccLog();
}

function renderDccLog() {
    if (dccLogPanel.classList.contains('hidden')) return;
    let entries = dccLogFilterOn
        ? dccLogEntries.filter(e => e.type === 'em' || e.type === 'sw' || dccAddrToSwitchNum(e.data.address, e.data.cmd) !== null)
        : dccLogEntries;
    entries = [...entries].reverse();
    dccLogList.innerHTML = entries.map(e => {
        let time = e.time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        let isSwitch = false;
        let label, icon, detail;
        let rowClass = '';
        if (e.type === 'em') {
            rowClass = 'dcc-log-item-em';
            label = 'ARRÊT D\'URGENCE';
            detail = 'Stop général reçu de la centrale';
            icon = '<span class="dcc-log-icon material-symbols-outlined">report</span>';
        } else if (e.type === 'sw') {
            isSwitch = true;
            let mode = (e.data.state || 0) + 1;
            let modeLabel = mode === 1 ? 'Ouverture' : 'Fermeture';
            label = `Aiguillage ${e.data.id + 1}`;
            let rawAddr = e.data.address || ((e.data.id) * 2 + 33016 + (mode - 1));
            let rawCmd = e.data.cmd !== undefined ? e.data.cmd : '';
            detail = `${modeLabel} (adresse ${rawAddr}${rawCmd ? `, cmd: ${rawCmd}` : ''})`;
            icon = '<span class="dcc-log-icon material-symbols-outlined">fork_right</span>';
        } else {
            let sn = dccAddrToSwitchNum(e.data.address, e.data.cmd);
            isSwitch = sn !== null;
            let suffix = sn ? ` => aiguillage ${sn}` : '';
            label = `adresse ${e.data.address}${suffix}`;
            if (isSwitch) {
                let mode = dccOrderType(e.data.address);
                let modeLabel = mode === 1 ? 'Ouverture' : 'Fermeture';
                detail = `${modeLabel} (adresse ${e.data.address}, cmd: ${e.data.cmd})`;
            } else {
                detail = `cmd: ${e.data.cmd}`;
            }
            if (isSwitch) {
                icon = '<span class="dcc-log-icon material-symbols-outlined">fork_right</span>';
            } else {
                icon = '<span class="dcc-log-icon unknown material-symbols-outlined">help</span>';
            }
        }
        return `<li class="dcc-log-item ${rowClass}">${icon}<div><span class="dcc-log-time">${time}</span><span class="dcc-log-addr ${isSwitch ? 'known' : 'unknown'}">${label}</span><span class="dcc-log-detail">${detail}</span></div></li>`;
    }).join('');
}

function updateSwitchAppearance(index) {
    const btn = switchesContainer.querySelector(`.switch:nth-child(${index + 1})`);
    if (btn) {
        const sw = config.switches[index];
        btn.style.backgroundColor = sw.state === 0 ? "rgba(52,199,89,0.35)" : "rgba(255,204,0,0.35)";
    }
    const tab = zoomTabs.querySelector(`button:nth-child(${index + 1})`);
    if (tab) {
        const sw = config.switches[index];
        tab.style.backgroundColor = sw.state === 0 ? "#34c759" : "#ffcc00";
    }
}

function handleDccSwitch(switchId, state, source, user) {
    if (!config.switches || !config.switches[switchId]) return;

    let modeLabel = state === 0 ? 'Ouverture' : 'Fermeture';
    if (config.switches[switchId].state === state) return;

    config.switches[switchId].state = state;
    updateSwitchAppearance(switchId);
    dccPlaySwitch(modeLabel);

    let displayAddr = config.switches[switchId].dccAddress || (switchId + 1);

    if (source === 'web') {
        logAction(`⇄ ${user || 'Inconnu'} a basculé l'aiguillage ${displayAddr} en ${modeLabel}`);
    } else {
        logAction(`⚡ Aiguillage ${displayAddr} basculé en ${modeLabel} (DCC)`);
    }

    saveConfig();
}

function startApp() {
setUserName(userName);

let imgTest = new Image();
imgTest.src = `/fond.jpg?t=${new Date().getTime()}`;
imgTest.onload = () => {
    map.style.backgroundImage = `url('${imgTest.src}')`;
    logAction("✓ Carte chargée depuis ESP32");
};
imgTest.onerror = () => {
    logAction("⚠ Pas de plan de fond sur l'ESP32");
};

fetch('/config.json')
    .then(response => {
        if (!response.ok) throw new Error("Fichier absent");
        return response.json();
    })
    .then(data => {
        config = data;
        renderSwitches();
        console.log('%c[AiguillageManager] ESP prêt ✓', 'color:#34c759;font-weight:700');
    })
    .catch(error => {
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
        logAction("⚠ ESP32 injoignable, config par défaut");
        renderSwitches();
        console.log('%c[AiguillageManager] Mode hors-ligne (ESP injoignable)', 'color:#ffcc00;font-weight:700');
    });
}

const switchMenu = document.getElementById('switch-menu');
const sizeSubmenu = document.getElementById('size-submenu');
let menuSwitchIndex = -1;

function closeSwitchMenu() {
    switchMenu.classList.add('hidden');
    sizeSubmenu.classList.add('hidden');
}

document.addEventListener('click', (e) => {
    if (!switchMenu.contains(e.target)) closeSwitchMenu();
});

switchMenu.querySelector('[data-action="toggle-visibility"]').onclick = () => {
    if (menuSwitchIndex < 0) return;
    const sw = config.switches[menuSwitchIndex];
    sw.visible = sw.visible === false ? true : false;
    logAction(sw.visible ? `Aiguillage ${menuSwitchIndex + 1} affiché` : `Aiguillage ${menuSwitchIndex + 1} masqué`);
    closeSwitchMenu();
    renderSwitches();
    saveConfig();
};

switchMenu.querySelector('[data-action="size"]').onclick = () => {
    sizeSubmenu.classList.toggle('hidden');
};

switchMenu.querySelectorAll('[data-size]').forEach(btn => {
    btn.onclick = () => {
        if (menuSwitchIndex < 0) return;
        config.switches[menuSwitchIndex].size = parseInt(btn.dataset.size);
        logAction(`Aiguillage ${menuSwitchIndex + 1} : taille ${['Normal','Petit','Très petit'][config.switches[menuSwitchIndex].size - 1]}`);
        closeSwitchMenu();
        renderSwitches();
        saveConfig();
    };
});

let addressModalIndex = -1;

switchMenu.querySelector('[data-action="assign-address"]').onclick = () => {
    if (menuSwitchIndex < 0) return;
    addressModalIndex = menuSwitchIndex;
    closeSwitchMenu();
    addressInput.value = config.switches[addressModalIndex].dccAddress || (addressModalIndex + 1);
    addressModal.classList.remove('hidden');
    setTimeout(() => addressInput.focus(), 100);
};

function closeAddressModal() {
    addressModal.classList.add('hidden');
    addressModalIndex = -1;
}

addressCancel.onclick = closeAddressModal;

addressValidate.onclick = () => {
    if (addressModalIndex < 0) return;
    const val = parseInt(addressInput.value);
    if (isNaN(val) || val < 1 || val > 99) {
        closeAddressModal();
        errorText.textContent = "Veuillez saisir un nombre entre 1 et 99";
        errorModal.classList.remove('hidden');
        return;
    }
    const conflict = config.switches.find((sw, i) => i !== addressModalIndex && sw.dccAddress === val);
    if (conflict) {
        const conflictIndex = config.switches.indexOf(conflict);
        closeAddressModal();
        errorText.textContent = `L'adresse ${val} est déjà attribuée à l'aiguillage ${conflictIndex + 1}`;
        errorModal.classList.remove('hidden');
        return;
    }
    config.switches[addressModalIndex].dccAddress = val;
    logAction(`Aiguillage ${addressModalIndex + 1} : adresse DCC → ${val}`);
    closeAddressModal();
    renderSwitches();
    saveConfig();
};

function renderSwitches() {
    closeSwitchMenu();
    switchesContainer.innerHTML = ''; 
    config.switches.forEach((sw, index) => {
        if (sw.dccAddress === undefined) sw.dccAddress = index + 1;
        let btn = document.createElement('div');
        btn.className = 'switch';
        if (sw.size > 1) btn.classList.add(`size-${sw.size}`);
        btn.style.backgroundColor = sw.state === 0 ? "rgba(52,199,89,0.35)" : "rgba(255,204,0,0.35)"; 
        btn.innerHTML = sw.dccAddress;

        if (sw.visible === false) {
            btn.classList.add('hidden-switch');
        }

        let hideBtn = document.createElement('div');
        hideBtn.className = 'hide-btn';
        hideBtn.innerHTML = `<span class="material-symbols-outlined">${sw.visible === false ? 'visibility_off' : 'visibility'}</span>`;
        hideBtn.onpointerdown = (e) => {
            e.stopPropagation(); 
            config.switches[index].visible = config.switches[index].visible === false ? true : false;
            
            logAction(config.switches[index].visible ? `Aiguillage ${index + 1} affiché` : `Aiguillage ${index + 1} masqué`);
            
            renderSwitches();
            saveConfig();
        };
        btn.appendChild(hideBtn);

        btn.oncontextmenu = (e) => {
            e.preventDefault();
            if (!isEditing) return;
            menuSwitchIndex = index;
            const rect = btn.getBoundingClientRect();
            const menuW = 220;
            let left = rect.left + rect.width / 2;
            if (left < menuW / 2) left = menuW / 2;
            if (left > window.innerWidth - menuW / 2) left = window.innerWidth - menuW / 2;
            switchMenu.style.left = `${left}px`;
            const arrow = switchMenu.querySelector('.menu-arrow');
            const spaceAbove = rect.top;
            if (spaceAbove > 200) {
                switchMenu.style.top = `${rect.top - 8}px`;
                switchMenu.style.transform = 'translateX(-50%) translateY(-100%)';
                arrow.style.bottom = '-6px';
                arrow.style.top = 'auto';
                arrow.style.borderLeft = 'none';
                arrow.style.borderTop = 'none';
                arrow.style.borderRight = '1px solid rgba(255,255,255,0.12)';
                arrow.style.borderBottom = '1px solid rgba(255,255,255,0.12)';
            } else {
                switchMenu.style.top = `${rect.bottom + 8}px`;
                switchMenu.style.transform = 'translateX(-50%)';
                arrow.style.top = '-6px';
                arrow.style.bottom = 'auto';
                arrow.style.borderLeft = '1px solid rgba(255,255,255,0.12)';
                arrow.style.borderTop = '1px solid rgba(255,255,255,0.12)';
                arrow.style.borderRight = 'none';
                arrow.style.borderBottom = 'none';
            }
            switchMenu.classList.remove('hidden');
            sizeSubmenu.classList.add('hidden');
        };
        
        btn.onpointerdown = (e) => handleInteraction(e, index, btn);
        switchesContainer.appendChild(btn);
    });
    
    if (zoomLevel > 1) renderZoomTabs();

    updateSwitchPositions();
}

window.addEventListener('resize', () => {
    applyZoom();
});

function handleInteraction(e, index, btn) {
    e.preventDefault(); 
    
    if (isEditing) {
        const startX = e.clientX, startY = e.clientY;
        let moved = false;
        let longPress = setTimeout(() => {
            if (!moved) {
                document.removeEventListener('pointermove', onMove);
                document.removeEventListener('pointerup', onUp);
                btn.dispatchEvent(new PointerEvent('contextmenu', { bubbles: true, clientX: startX, clientY: startY }));
            }
        }, 800);

        function onMove(eMove) {
            if (Math.abs(eMove.clientX - startX) > 8 || Math.abs(eMove.clientY - startY) > 8) {
                moved = true;
                if (longPress) { clearTimeout(longPress); longPress = null; }
            }
            if (!moved) return;
            eMove.preventDefault();
            let newX = eMove.clientX - map.getBoundingClientRect().left;
            let newY = eMove.clientY - map.getBoundingClientRect().top;
            if (newY < 30) newY = 30;
            btn.style.left = newX + 'px';
            btn.style.top = newY + 'px';
            config.switches[index].x = newX;
            config.switches[index].y = newY;
        }

        function onUp() {
            if (longPress) { clearTimeout(longPress); longPress = null; }
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            if (!moved) return;
            config.switches[index].x = parseFloat(btn.style.left);
            config.switches[index].y = parseFloat(btn.style.top);
            logAction(`Aiguillage ${index + 1} déplacé`);
            savePositions(index);
        }

        document.addEventListener('pointermove', onMove, { passive: false });
        document.addEventListener('pointerup', onUp);
    } else {
        config.switches[index].state = config.switches[index].state === 0 ? 1 : 0;
        let mode = config.switches[index].state + 1;
        let modeLabel = mode === 1 ? 'Ouverture' : 'Fermeture';
        
        logAction(`Aiguillage ${index + 1} basculé en ${modeLabel}`);
        dccPlaySwitch();
        
        fetch(`/switch?id=${index + 1}&mode=${mode}&user=${encodeURIComponent(userName)}`).catch(()=>console.log("Mode local uniquement"));
        
        updateSwitchAppearance(index);
        saveConfig();
    }
}

function getMapSize() {
    const rect = map.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
}

function savePositions(movedIndex) {
    const mapSize = getMapSize();
    if (mapSize.width > 0 && mapSize.height > 0 && movedIndex !== undefined) {
        const sw = config.switches[movedIndex];
        sw.xPercent = (sw.x / mapSize.width) * 100;
        sw.yPercent = (sw.y / mapSize.height) * 100;
    }
    saveConfig();
}

function saveConfig() {
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    pendingSaveIds.push(id);
    setTimeout(() => { pendingSaveIds = pendingSaveIds.filter(s => s !== id); }, 5000);
    fetch('/save?_save=' + id + '&_user=' + encodeURIComponent(userName), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    }).catch(err => console.error("Erreur de sauvegarde serveur"));
}

function updateSwitchPositions() {
    if (config.switches.length === 0) return;

    const mapSize = getMapSize();
    if (mapSize.width <= 0 || mapSize.height <= 0) return;

    config.switches.forEach((sw, i) => {
        const btn = switchesContainer.querySelector(`.switch:nth-child(${i + 1})`);
        if (!btn) return;
        let pctX = sw.xPercent, pctY = sw.yPercent;
        if (pctX === undefined && sw.x !== undefined) {
            pctX = (sw.x / mapSize.width) * 100;
            pctY = (sw.y / mapSize.height) * 100;
        }
        if (pctX === undefined) return;
        btn.style.left = `${(pctX / 100) * mapSize.width}px`;
        btn.style.top = `${Math.max(30, (pctY / 100) * mapSize.height)}px`;
    });
}

modeBtn.onclick = () => {
    isEditing = !isEditing;
    zoomLayer.classList.toggle('editing');

    if (isEditing) {
        modeBtn.innerHTML = "🔓 Mode Configuration";
        modeBtn.classList.remove('btn-user');
        modeBtn.classList.add('btn-config');
        adminButtons.classList.remove('hidden');
        adminPanel.classList.remove('hidden');
        logAction("Accès au Mode Configuration");
    } else {
        modeBtn.innerHTML = "🔒 Mode Utilisateur";
        modeBtn.classList.remove('btn-config');
        modeBtn.classList.add('btn-user');
        adminButtons.classList.add('hidden');
        adminPanel.classList.add('hidden');
        logAction("Retour au Mode Utilisateur");
    }
};

function handleBgFile(file) {
    if (!file) return;
    planMenu.classList.add('hidden');
    uploadModal.classList.remove('hidden');

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            try {
                const canvas = document.createElement('canvas');
                const MAX = 1920;
                let w = img.width, h = img.height;
                if (w > MAX || h > MAX) {
                    const ratio = Math.min(MAX / w, MAX / h);
                    w = Math.round(w * ratio);
                    h = Math.round(h * ratio);
                }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                const compressed = canvas.toDataURL('image/jpeg', 0.85);

                canvas.toBlob(function(blob) {
                    const formData = new FormData();
                    formData.append("image", blob, "fond.jpg");
                    fetch('/upload', {
                        method: 'POST',
                        body: formData
                    }).then(r => r.text()).then(text => {
                        if (text === "OK") {
                            map.style.backgroundImage = `url('${compressed}')`;
                            logAction("Nouveau plan de fond téléchargé sur l'ESP32");
                        } else {
                            logAction("⚠ ESP32 a répondu: " + text);
                        }
                        uploadModal.classList.add('hidden');
                    }).catch(() => {
                        uploadModal.classList.add('hidden');
                        errorText.textContent = "Échec de la connexion à l'ESP32 pour l'upload";
                        errorModal.classList.remove('hidden');
                    });
                }, 'image/jpeg', 0.85);
            } catch (err) {
                uploadModal.classList.add('hidden');
                errorText.textContent = "Erreur lors de la compression de l'image";
                errorModal.classList.remove('hidden');
            }
        };
        img.onerror = function() {
            uploadModal.classList.add('hidden');
            errorText.textContent = "Impossible de lire l'image sélectionnée";
            errorModal.classList.remove('hidden');
        };
        img.src = e.target.result;
    };
    reader.onerror = function() {
        uploadModal.classList.add('hidden');
        errorText.textContent = "Erreur de lecture du fichier";
        errorModal.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

bgUpload.addEventListener('change', function(event) {
    event.stopPropagation();
    event.preventDefault();
    const file = event.target.files[0];
    bgUpload.value = '';
    handleBgFile(file);
}, false);

bgCamera.addEventListener('change', function(event) {
    event.stopPropagation();
    event.preventDefault();
    const file = event.target.files[0];
    bgCamera.value = '';
    handleBgFile(file);
}, false);

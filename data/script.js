let isEditing = false;
let config = { switches: [] };
let eventSource = null;

const map = document.getElementById('layout-map');
const switchesContainer = document.getElementById('switches-container');
const modeBtn = document.getElementById('mode-btn');
const adminPanel = document.getElementById('admin-panel');
const planBtn = document.getElementById('plan-btn');
const planMenu = document.getElementById('plan-menu');
const planDelete = document.getElementById('plan-delete');
const bgUpload = document.getElementById('bg-upload');
const bgCamera = document.getElementById('bg-camera');

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

// --- NOUVEAU : Éléments de l'historique ---
const historyBtn = document.getElementById('history-btn');
const historyPanel = document.getElementById('history-panel');
const historyList = document.getElementById('history-list');

const uploadModal = document.getElementById('upload-modal');
const errorModal = document.getElementById('error-modal');
const errorText = document.getElementById('error-text');
const errorDismiss = document.getElementById('error-dismiss');

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

zoomBtn.onclick = () => zoomPicker.classList.toggle('hidden');

let freeZoomActive = false;
let lastSaveId = null;
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
            logAction(`Aiguillage ${index + 1} basculé en Mode ${mode} (zoom)`);
            fetch(`/switch?id=${index + 1}&mode=${mode}`).catch(()=>{});
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
    else if (message.includes('⚡') || message.includes('ARRÊT')) { icon = 'warn'; glyph = '⚡'; }

    el.innerHTML = `<span class="toast-icon ${icon}">${glyph}</span><span>${message}</span>`;
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

    showToast(message);
}

// Afficher/Cacher le panneau d'historique
historyBtn.onclick = (e) => {
    e.stopPropagation();
    historyPanel.classList.toggle('hidden');
};

document.addEventListener('click', () => {
    if (!historyPanel.classList.contains('hidden')) {
        historyPanel.classList.add('hidden');
    }
});

historyPanel.addEventListener('click', (e) => e.stopPropagation());
// ------------------------------------------

function initEventSource() {
    if (eventSource) eventSource.close();
    
    eventSource = new EventSource('/events');
    
    eventSource.addEventListener('dcc-switch', (e) => {
        try {
            const data = JSON.parse(e.data);
            handleDccSwitch(data.id, data.state, data.source);
        } catch (err) {
            console.error('SSE parse error:', err);
        }
    });

    eventSource.addEventListener('config-update', (e) => {
        try {
            const d = JSON.parse(e.data);
            if (d._save && d._save === lastSaveId) return;
        } catch (_) {}
        logAction("🔄 Configuration mise à jour par un autre utilisateur");
        fetch('/config.json')
            .then(r => r.json())
            .then(data => {
                config = data;
                renderSwitches();
            });
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

function updateSwitchAppearance(index) {
    const btn = switchesContainer.querySelector(`.switch:nth-child(${index + 1})`);
    if (btn) {
        const sw = config.switches[index];
        btn.style.backgroundColor = sw.state === 0 ? "#34c759" : "#ffcc00";
    }
    const tab = zoomTabs.querySelector(`button:nth-child(${index + 1})`);
    if (tab) {
        const sw = config.switches[index];
        tab.style.backgroundColor = sw.state === 0 ? "#34c759" : "#ffcc00";
    }
}

function handleDccSwitch(switchId, state, source) {
    if (config.switches[switchId].state === state) return;

    config.switches[switchId].state = state;
    updateSwitchAppearance(switchId);

    if (source === 'web') {
        logAction(`⇄ Aiguillage ${switchId + 1} → Mode ${state + 1} (sync)`);
    } else {
        logAction(`⚡ Aiguillage ${switchId + 1} basculé en Mode ${state + 1} (DCC)`);
    }

    saveConfig();
}

const emergencyOverlay = document.getElementById('emergency-overlay');
const signalIndicator = document.getElementById('signal-indicator');

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
        const sw = config.switches[0];
        const posInfo = sw ? `pos:${Math.round(sw.xPercent||0)}%,${Math.round(sw.yPercent||0)}%` : 'pas de sw';
        logAction(`✓ config ESP32 chargée - ${posInfo}`);
        renderSwitches();
        initEventSource();
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
        initEventSource();
    });

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

function renderSwitches() {
    closeSwitchMenu();
    switchesContainer.innerHTML = ''; 
    const mapSize = getMapSize();
    config.switches.forEach((sw, index) => {
        let btn = document.createElement('div');
        btn.className = 'switch';
        if (sw.size > 1) btn.classList.add(`size-${sw.size}`);
        btn.style.backgroundColor = sw.state === 0 ? "#34c759" : "#ffcc00"; 
        btn.innerHTML = index + 1;

        if (sw.visible === false) {
            btn.classList.add('hidden-switch');
        }

        if (sw.xPercent !== undefined && mapSize.width > 0) {
            btn.style.left = `${(sw.xPercent / 100) * mapSize.width}px`;
            btn.style.top = `${(sw.yPercent / 100) * mapSize.height}px`;
        } else if (sw.x !== undefined) {
            btn.style.left = `${sw.x}px`;
            btn.style.top = `${sw.y}px`;
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
        let longPress = setTimeout(() => {
            document.onpointermove = null;
            document.onpointerup = null;
            btn.releasePointerCapture(e.pointerId);
            btn.dispatchEvent(new PointerEvent('contextmenu', { bubbles: true, clientX: e.clientX, clientY: e.clientY }));
        }, 500);

        btn.setPointerCapture(e.pointerId);
        document.onpointermove = (eMove) => {
            if (Math.abs(eMove.clientX - e.clientX) > 10 || Math.abs(eMove.clientY - e.clientY) > 10) {
                if (longPress) { clearTimeout(longPress); longPress = null; }
            }
            let newX = eMove.clientX - map.getBoundingClientRect().left;
            let newY = eMove.clientY - map.getBoundingClientRect().top;
            btn.style.left = newX + 'px';
            btn.style.top = newY + 'px';
            config.switches[index].x = newX;
            config.switches[index].y = newY;
        };
        document.onpointerup = () => {
            if (longPress) { clearTimeout(longPress); longPress = null; }
            document.onpointermove = null;
            document.onpointerup = null;
            btn.releasePointerCapture(e.pointerId);
            
            const mapSize = getMapSize();
            config.switches[index].x = parseFloat(btn.style.left);
            config.switches[index].y = parseFloat(btn.style.top);
            
            logAction(`Aiguillage ${index + 1} déplacé`);
            savePositions();
        };
    } else {
        config.switches[index].state = config.switches[index].state === 0 ? 1 : 0;
        let mode = config.switches[index].state + 1; 
        
        logAction(`Aiguillage ${index + 1} basculé en Mode ${mode}`);
        
        fetch(`/switch?id=${index + 1}&mode=${mode}`).catch(()=>console.log("Mode local uniquement"));
        
        updateSwitchAppearance(index);
        saveConfig();
    }
}

function getMapSize() {
    const rect = map.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
}

function savePositions() {
    const mapSize = getMapSize();
    config.switches.forEach((sw, i) => {
        if (mapSize.width > 0 && mapSize.height > 0) {
            sw.xPercent = (sw.x / mapSize.width) * 100;
            sw.yPercent = (sw.y / mapSize.height) * 100;
        }
    });
    saveConfig();
}

function saveConfig() {
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    lastSaveId = id;
    fetch('/save?_save=' + id, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    }).catch(err => console.error("Erreur de sauvegarde serveur"));
}

function updateSwitchPositions() {
    if (config.switches.length === 0) return;
    
    const bgImg = new Image();
    bgImg.src = map.style.backgroundImage.replace(/url\(['"]?(.+?)['"]?\)/, '$1');
    
    if (!bgImg.complete || bgImg.naturalWidth === 0) {
        const mapSize = getMapSize();
        config.switches.forEach((sw, i) => {
const btn = switchesContainer.querySelector(`.switch:nth-child(${i + 1})`);
        if (btn && sw.xPercent !== undefined && sw.yPercent !== undefined && mapSize.width > 0 && mapSize.height > 0) {
            btn.style.left = `${(sw.xPercent / 100) * mapSize.width}px`;
            btn.style.top = `${(sw.yPercent / 100) * mapSize.height}px`;
            }
        });
        return;
    }
    
    const rect = map.getBoundingClientRect();
    const imgRatio = bgImg.naturalWidth / bgImg.naturalHeight;
    const containerRatio = rect.width / rect.height;
    
    let visibleWidth, visibleHeight;
    if (imgRatio > containerRatio) {
        visibleWidth = rect.width;
        visibleHeight = rect.width / imgRatio;
    } else {
        visibleHeight = rect.height;
        visibleWidth = rect.height * imgRatio;
    }
    
    const offsetX = (rect.width - visibleWidth) / 2;
    const offsetY = (rect.height - visibleHeight) / 2;
    
    config.switches.forEach((sw, i) => {
        const btn = switchesContainer.querySelector(`.switch:nth-child(${i + 1})`);
        if (btn && sw.xPercent !== undefined && sw.yPercent !== undefined) {
            const newLeft = offsetX + (sw.xPercent / 100) * visibleWidth;
            const newTop = offsetY + (sw.yPercent / 100) * visibleHeight;
            btn.style.left = `${newLeft}px`;
            btn.style.top = `${newTop}px`;
        }
    });
}

modeBtn.onclick = () => {
    isEditing = !isEditing;
    zoomLayer.classList.toggle('editing');

    if (isEditing) {
        modeBtn.innerHTML = "🔓 Mode Configuration";
        modeBtn.classList.remove('btn-user');
        modeBtn.classList.add('btn-config');
        adminPanel.classList.remove('hidden');
        signalIndicator.classList.add('hidden');
        logAction("Accès au Mode Configuration");
    } else {
        modeBtn.innerHTML = "🔒 Mode Utilisateur";
        modeBtn.classList.remove('btn-config');
        modeBtn.classList.add('btn-user');
        adminPanel.classList.add('hidden');
        signalIndicator.classList.remove('hidden');
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
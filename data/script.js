let isEditing = false;
let config = { switches: [] };

const map = document.getElementById('layout-map');
const modeBtn = document.getElementById('mode-btn');
const adminPanel = document.getElementById('admin-panel');
const bgUpload = document.getElementById('bg-upload');

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
    })
    .catch(error => {
        console.log("Passage sur la sauvegarde de secours du navigateur...");
        let savedConfig = localStorage.getItem('trainConfig');
        if (savedConfig) {
            config = JSON.parse(savedConfig);
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
        
        // --- NOUVEAU : Ajout du numéro de 1 à 6 ---
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
            saveConfig();
        };
    } else {
        config.switches[index].state = config.switches[index].state === 0 ? 1 : 0;
        let mode = config.switches[index].state + 1; 
        
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
    } else {
        modeBtn.innerHTML = "🔒 Mode Utilisateur";
        modeBtn.classList.remove('btn-config');
        modeBtn.classList.add('btn-user');
        adminPanel.classList.add('hidden');
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
        }).catch(err => console.error("Erreur upload"));
    }
}, false);
// --- CONFIGURATION ---
pcb_x = 100; 
pcb_y = 100; 
h_int = 40; 
ep = 2.5; 
marge = 3.5; // Offre 2mm de jeu de chaque côté à l'intérieur
$fn = 64; 

// Positions des 3 trous de vis PCB
trous_pcb = [[5, 95], [10, 30], [40, 28]]; 

// Positions des supports anti-torsion
supports_appui = [[10, 80], [90, 10], [90, 90], [50, 50]];

module base_boitier() {
    difference() {
        // 1. CORPS EXTERNE
        hull() {
            for(x=[0, pcb_x+11], y=[0, pcb_y+11]) 
                translate([x,y,0]) cylinder(h=h_int+ep, r=4);
        }
        
        // 2. VIDAGE INTERNE (Avec le jeu de 2mm de chaque côté)
        translate([2, 2, ep])
            cube([pcb_x+7, pcb_y+7, h_int + 5]);

        // 3. OUVERTURE USB-C (Flanc gauche)
        translate([-5, 60.5, ep+5]) cube([15, 16, 10]); 
        
        // 4. OUVERTURE BORNIERS DROITE (Aiguillages 1 à 6)
        translate([pcb_x+6, 28, ep+2]) cube([10, 75, 18]);
        
        // 5. OUVERTURES BAS
        // Ouverture J2 (DCC Rail) en bas à gauche
        translate([0, -5, ep+2]) cube([16, 15, 15]);
        
        // AJUSTEMENT ICI : Découpe resserrée sur le coin inférieur droit
        // Démarre à X=52 (au lieu de 46) pour éviter le grand vide à gauche du bornier J5
        translate([52, -5, ep+2]) cube([55, 35, 18]);

        // 6. TROUS POUR VIS DU COUVERCLE
        for(x=[0, pcb_x+11], y=[0, pcb_y+11]) {
            translate([x, y, ep + 5]) cylinder(h=h_int, r=1.4);
        }
    }

    // PLOTS DE FIXATION PCB (Centrés)
    for (t = trous_pcb) {
        translate([t[0]+5.5, t[1]+5.5, ep])
            difference() {
                cylinder(h=5, r=4);
                translate([0,0,-1]) cylinder(h=7, r=1.4); 
            }
    }

    // SUPPORTS ANTI-TORSION
    for (s = supports_appui) {
        translate([s[0]+5.5, s[1]+5.5, ep]) cylinder(h=5, r=3);
    }
}

module couvercle() {
    translate([0, -120, 0]) 
    difference() {
        // Plaque du couvercle
        hull() {
            for(x=[0, pcb_x+11], y=[0, pcb_y+11]) 
                translate([x,y,0]) cylinder(h=3, r=4);
        }
        
        // TROUS DE PASSAGE VIS M3 (fraisés)
        for(x=[0, pcb_x+11], y=[0, pcb_y+11]) {
            translate([x,y,-1]) cylinder(h=5, r=1.7); 
            translate([x,y,1.5]) cylinder(h=2, r1=1.7, r2=3.2); 
        }
            
        // FENTES D'AÉRATION (Zone MOSFETs)
        for(i=[0:8]) translate([75, 30 + i*8, -1]) cube([18, 4, 5]);
    }
}

// Appel des modules
base_boitier();
couvercle();
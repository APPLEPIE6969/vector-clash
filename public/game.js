import * as THREE from 'three';

// --- 1. SETUP SCENE ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x151520); // Dark Sci-Fi Blue/Grey
scene.fog = new THREE.Fog(0x151520, 200, 900);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows
document.body.appendChild(renderer.domElement);

// Lighting for that "Studio" look
const ambientLight = new THREE.AmbientLight(0x404040, 1.5); // Brighter ambient
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(200, 500, 300);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

// Neon Ground
const gridHelper = new THREE.GridHelper(2000, 100, 0x00ffff, 0x222222);
scene.add(gridHelper);

const floorGeo = new THREE.PlaneGeometry(2000, 2000);
const floorMat = new THREE.MeshStandardMaterial({ 
    color: 0x0a0a0a, 
    roughness: 0.1, 
    metalness: 0.5 
});
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// --- 2. ASSET GENERATOR (THE ROBOT BUILDER) ---
function createSciFiSoldier(mainColor) {
    const group = new THREE.Group();

    // Materials
    // The "Armor" uses the player's random color
    const armorMat = new THREE.MeshStandardMaterial({ 
        color: mainColor, 
        roughness: 0.3,
        metalness: 0.1,
        flatShading: true 
    });
    
    // The "Joints/Undersuit" (Dark Grey)
    const suitMat = new THREE.MeshStandardMaterial({ color: 0x333333, flatShading: true });
    
    // The "Energy/Glow" (Teal/Cyan like the picture)
    const glowMat = new THREE.MeshStandardMaterial({ 
        color: 0x00ffff, 
        emissive: 0x00ffff, 
        emissiveIntensity: 0.5 
    });
    
    // The "Visor" (Black Glass)
    const visorMat = new THREE.MeshStandardMaterial({ 
        color: 0x111111, 
        roughness: 0.0, 
        metalness: 0.8 
    });

    // --- BODY PARTS ---
    
    // 1. Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(14, 16, 8), armorMat);
    torso.position.y = 20;
    torso.castShadow = true;
    group.add(torso);

    // 2. Head
    const headGroup = new THREE.Group();
    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), armorMat);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 10.5), visorMat); // Visor sticking out slightly
    visor.position.set(0, 1, 0);
    headGroup.add(headMesh);
    headGroup.add(visor);
    headGroup.position.y = 31; // On top of torso
    group.add(headGroup);

    // 3. Backpack (The "Battery")
    const backpack = new THREE.Mesh(new THREE.BoxGeometry(10, 12, 4), suitMat);
    backpack.position.set(0, 20, -6);
    // Add a glowing strip on backpack
    const strip = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 4.5), glowMat);
    strip.position.set(0, 20, -6);
    group.add(backpack);
    group.add(strip);

    // 4. Arms
    // Right Arm (Holding Gun)
    const rArm = new THREE.Mesh(new THREE.BoxGeometry(4, 12, 4), armorMat);
    rArm.position.set(9, 20, 4);
    rArm.rotation.x = -Math.PI / 2; // Pointing forward
    group.add(rArm);

    // Left Arm
    const lArm = new THREE.Mesh(new THREE.BoxGeometry(4, 12, 4), armorMat);
    lArm.position.set(-9, 20, 4);
    lArm.rotation.x = -Math.PI / 2;
    group.add(lArm);

    // 5. Gun (Attached to Right Arm)
    const gunGroup = new THREE.Group();
    const gunBody = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 12), suitMat);
    const gunBarrel = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 4), glowMat);
    gunBarrel.position.z = 7;
    gunGroup.add(gunBody);
    gunGroup.add(gunBarrel);
    gunGroup.position.set(9, 20, 10); // End of arm
    group.add(gunGroup);

    // 6. Legs (We save these to animate them later)
    const legGeo = new THREE.BoxGeometry(5, 14, 6);
    
    const leftLeg = new THREE.Mesh(legGeo, armorMat);
    leftLeg.position.set(-4, 7, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, armorMat);
    rightLeg.position.set(4, 7, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);

    // Store references for animation
    group.userData = { leftLeg, rightLeg, headGroup };

    return group;
}

// --- 3. NETWORK & STATE ---
// @ts-ignore
const socket = io({ transports: ['websocket', 'polling'] });

let players = {};
let bullets = [];
let obstacles = [];
let myId = null;

const meshes = {
    players: {},
    bullets: [],
    obstacles: []
};

// Input
const keys = { w: false, a: false, s: false, d: false };
let mouseX = 0;
let mouseY = 0;

document.addEventListener('keydown', (e) => { if (keys.hasOwnProperty(e.key)) keys[e.key] = true; });
document.addEventListener('keyup', (e) => { if (keys.hasOwnProperty(e.key)) keys[e.key] = false; });
document.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });
document.addEventListener('mousedown', () => {
    const angle = Math.atan2(mouseY - (window.innerHeight/2), mouseX - (window.innerWidth/2));
    socket.emit('shoot', angle);
});

socket.on('connect', () => { myId = socket.id; });
socket.on('state', (state) => {
    players = state.players;
    bullets = state.bullets;
    
    // Create Obstacles (One time)
    if (meshes.obstacles.length === 0 && state.obstacles.length > 0) {
        state.obstacles.forEach(obs => {
            const geometry = new THREE.BoxGeometry(obs.w, 60, obs.h);
            // Neon Wall Material
            const material = new THREE.MeshStandardMaterial({ 
                color: 0x001133,
                emissive: 0x00ffff,
                emissiveIntensity: 0.2,
                roughness: 0.2
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(obs.x + obs.w/2, 30, obs.y + obs.h/2);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            scene.add(mesh);
            meshes.obstacles.push(mesh);
        });
    }
});

// --- 4. RENDER LOOP ---
function animate() {
    requestAnimationFrame(animate);

    // Update Players
    for (let id in meshes.players) {
        if (!players[id]) {
            scene.remove(meshes.players[id]);
            delete meshes.players[id];
        }
    }

    const now = Date.now();

    for (let id in players) {
        const p = players[id];
        let group = meshes.players[id];

        // If new player, create the SCIFI MODEL
        if (!group) {
            group = createSciFiSoldier(p.color);
            scene.add(group);
            meshes.players[id] = group;
        }

        // --- ANIMATION LOGIC ---
        // 1. Move Group
        group.position.x = p.x;
        group.position.z = p.y;
        
        // 2. Rotate Body
        // Smooth rotation
        const targetRot = -p.angle;
        let diff = targetRot - group.rotation.y;
        // Normalize angle to prevent spinning 360 unnecessarily
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        group.rotation.y += diff * 0.2;

        // 3. Leg Walking Animation
        // Check if player is moving by comparing current pos to last pos
        const isMoving = (group.userData.lastX !== p.x || group.userData.lastZ !== p.y);
        
        if (isMoving) {
            const speed = 0.015;
            const range = 0.5; // How far legs swing
            group.userData.leftLeg.rotation.x = Math.sin(now * speed) * range;
            group.userData.rightLeg.rotation.x = Math.cos(now * speed) * range;
        } else {
            // Reset to standing
            group.userData.leftLeg.rotation.x = 0;
            group.userData.rightLeg.rotation.x = 0;
        }

        // Save position for next frame check
        group.userData.lastX = p.x;
        group.userData.lastZ = p.y;
    }

    // Update Bullets
    meshes.bullets.forEach(b => scene.remove(b));
    meshes.bullets = [];

    bullets.forEach(b => {
        // Glowing Energy Bullets
        const geometry = new THREE.SphereGeometry(3);
        const material = new THREE.MeshBasicMaterial({ color: 0xff00ff });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(b.x, 20, b.y);
        // Add a light to the bullet
        const light = new THREE.PointLight(0xff00ff, 1, 50);
        light.position.set(0,0,0);
        mesh.add(light);
        
        scene.add(mesh);
        meshes.bullets.push(mesh);
    });

    // Camera Follow
    if (myId && players[myId]) {
        const p = players[myId];
        camera.position.x = p.x;
        camera.position.y = 400; // High up
        camera.position.z = p.y + 250; // Angled back
        camera.lookAt(p.x, 0, p.y);

        const dx = mouseX - (window.innerWidth / 2);
        const dy = mouseY - (window.innerHeight / 2);
        const angle = Math.atan2(dy, dx);
        
        socket.emit('input', { keys, angle });
    }

    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();

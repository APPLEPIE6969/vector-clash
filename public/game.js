import * as THREE from 'three';

// 1. SETUP THREE.JS SCENE
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111); // Dark gray sky
scene.fog = new THREE.Fog(0x111111, 200, 1000); // Distance fog

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Lights
const ambientLight = new THREE.AmbientLight(0x404040); // Soft white light
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(500, 1000, 500);
dirLight.castShadow = true;
scene.add(dirLight);

// The Floor
const floorGeo = new THREE.PlaneGeometry(1000, 1000);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2; // Lay flat
floor.position.set(400, 0, 400); // Center matches server map center (roughly)
scene.add(floor);

// 2. NETWORK & STATE
// @ts-ignore
const socket = io({ transports: ['websocket', 'polling'] });

let players = {}; // Server data
let bullets = [];
let obstacles = [];
let myId = null;

// Store 3D Meshes here to update them
const meshes = {
    players: {},
    bullets: [],
    obstacles: []
};

// Input State
const keys = { w: false, a: false, s: false, d: false };
let mouseX = 0;
let mouseY = 0;

// Listeners
document.addEventListener('keydown', (e) => { if (keys.hasOwnProperty(e.key)) keys[e.key] = true; });
document.addEventListener('keyup', (e) => { if (keys.hasOwnProperty(e.key)) keys[e.key] = false; });
document.addEventListener('mousemove', (e) => {
    // We need 3D mouse position, but for now let's keep it simple relative to screen center
    mouseX = e.clientX;
    mouseY = e.clientY;
});
document.addEventListener('mousedown', () => {
    // Calculate aiming angle based on screen center (Third Person style)
    const angle = Math.atan2(mouseY - (window.innerHeight/2), mouseX - (window.innerWidth/2));
    socket.emit('shoot', angle);
});

// Sync
socket.on('connect', () => { myId = socket.id; });
socket.on('state', (state) => {
    players = state.players;
    bullets = state.bullets;
    
    // Create Obstacles only once
    if (meshes.obstacles.length === 0 && state.obstacles.length > 0) {
        state.obstacles.forEach(obs => {
            // Server has x,y,w,h. We need 3D Box.
            // Server X/Y is Top-Left. Three.js is Center.
            const geometry = new THREE.BoxGeometry(obs.w, 50, obs.h);
            const material = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x004444 });
            const mesh = new THREE.Mesh(geometry, material);
            
            mesh.position.set(obs.x + obs.w/2, 25, obs.y + obs.h/2);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            
            scene.add(mesh);
            meshes.obstacles.push(mesh);
        });
    }
});

// 3. RENDER LOOP
function animate() {
    requestAnimationFrame(animate);

    // --- UPDATE PLAYERS ---
    // 1. Remove disconnected players
    for (let id in meshes.players) {
        if (!players[id]) {
            scene.remove(meshes.players[id]);
            delete meshes.players[id];
        }
    }

    // 2. Add/Update connected players
    for (let id in players) {
        const p = players[id];
        let mesh = meshes.players[id];

        // Create if doesn't exist
        if (!mesh) {
            const geometry = new THREE.CapsuleGeometry(15, 30, 4, 8);
            const material = new THREE.MeshStandardMaterial({ color: p.color });
            mesh = new THREE.Mesh(geometry, material);
            scene.add(mesh);
            meshes.players[id] = mesh;
        }

        // Update Position (Map 2D X/Y to 3D X/Z)
        // Lerp for smoothness (optional, using direct set for now)
        mesh.position.x = p.x;
        mesh.position.z = p.y;
        mesh.position.y = 15; // Half height
        
        // Rotate body to face aim
        mesh.rotation.y = -p.angle; // Server angle might be inverted for 3D
        
        // Update Color if changed
        mesh.material.color.set(p.color);
    }

    // --- UPDATE BULLETS ---
    // Clear old bullets from scene
    meshes.bullets.forEach(b => scene.remove(b));
    meshes.bullets = [];

    // Create new bullets
    bullets.forEach(b => {
        const geometry = new THREE.SphereGeometry(5);
        const material = new THREE.MeshBasicMaterial({ color: 0xff00ff });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(b.x, 15, b.y);
        scene.add(mesh);
        meshes.bullets.push(mesh);
    });

    // --- CAMERA FOLLOW ---
    if (myId && players[myId]) {
        const p = players[myId];
        // "Fortnite-ish" Camera: Behind and above
        const offsetHeight = 300; // How high up
        const offsetDistance = 200; // How far back (isometric style)
        
        camera.position.x = p.x;
        camera.position.y = offsetHeight;
        camera.position.z = p.y + offsetDistance;
        camera.lookAt(p.x, 0, p.y);

        // Send Input
        // Calculate angle from center of screen (where player is) to mouse
        const dx = mouseX - (window.innerWidth / 2);
        const dy = mouseY - (window.innerHeight / 2);
        const angle = Math.atan2(dy, dx);
        
        socket.emit('input', { keys, angle });
    }

    renderer.render(scene, camera);
}

// Handle Window Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();

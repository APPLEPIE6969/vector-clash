import * as THREE from 'three';

// --- 1. SETUP SCENE ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);
scene.fog = new THREE.Fog(0x111111, 100, 500);

const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(200, 500, 300);
dirLight.castShadow = true;
scene.add(dirLight);

const gridHelper = new THREE.GridHelper(2000, 100, 0x00ffff, 0x222222);
scene.add(gridHelper);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.5 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// --- 2. ASSET GENERATOR ---
function createSciFiSoldier(mainColor) {
    const group = new THREE.Group();
    group.scale.set(2.5, 2.5, 2.5);

    const armorMat = new THREE.MeshStandardMaterial({ color: mainColor, roughness: 0.2, metalness: 0.1 });
    const suitMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });

    // Body parts...
    const torso = new THREE.Mesh(new THREE.BoxGeometry(10, 12, 6), armorMat); torso.position.y = 14; torso.castShadow = true; group.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 6), armorMat); head.position.y = 22; group.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 5), glowMat); visor.position.set(0, 22, 1.5); group.add(visor);
    const rArm = new THREE.Mesh(new THREE.BoxGeometry(3, 10, 3), armorMat); rArm.position.set(7, 14, 2); rArm.rotation.x = -Math.PI / 2; group.add(rArm);
    const lArm = new THREE.Mesh(new THREE.BoxGeometry(3, 10, 3), armorMat); lArm.position.set(-7, 14, 2); lArm.rotation.x = -Math.PI / 2; group.add(lArm);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 8), suitMat); gun.position.set(7, 14, 6); group.add(gun);
    const legGeo = new THREE.BoxGeometry(3.5, 10, 4);
    const leftLeg = new THREE.Mesh(legGeo, armorMat); leftLeg.position.set(-3, 5, 0); group.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeo, armorMat); rightLeg.position.set(3, 5, 0); group.add(rightLeg);

    group.userData = { leftLeg, rightLeg };
    return group;
}

// Helper: Create Text Sprite for Name
function createNameTag(name) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 256; canvas.height = 64;
    ctx.font = "bold 40px Courier New";
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.shadowColor = "black";
    ctx.shadowBlur = 4;
    ctx.fillText(name, 128, 40);
    
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(20, 5, 1);
    sprite.position.y = 35; // Above head
    return sprite;
}

// --- 3. NETWORK ---
// @ts-ignore
const socket = io({ transports: ['websocket', 'polling'] });

let players = {};
let bullets = [];
let meshes = { players: {}, bullets: [], obstacles: [] };
let myId = null;
let isPlaying = false; // Local state

const keys = { w: false, a: false, s: false, d: false };
let mouseX = 0;
let mouseY = 0;

// UI References
const kDisplay = document.getElementById('kDisplay');
const dDisplay = document.getElementById('dDisplay');
const rDisplay = document.getElementById('rDisplay');
const lbContent = document.getElementById('lbContent');

// LOGIN LOGIC
document.getElementById('playBtn').addEventListener('click', () => {
    const name = document.getElementById('usernameInput').value || "Soldier";
    socket.emit('join_game', name);
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    isPlaying = true;
});

// Controls
document.addEventListener('keydown', (e) => { if (keys.hasOwnProperty(e.key)) keys[e.key] = true; });
document.addEventListener('keyup', (e) => { if (keys.hasOwnProperty(e.key)) keys[e.key] = false; });
document.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });
document.addEventListener('mousedown', () => {
    if (!isPlaying) return;
    const angle = Math.atan2(mouseY - (window.innerHeight/2), mouseX - (window.innerWidth/2));
    socket.emit('shoot', angle);
});

socket.on('connect', () => { myId = socket.id; });
socket.on('state', (state) => {
    players = state.players;
    bullets = state.bullets;
    
    // Init Obstacles
    if (meshes.obstacles.length === 0 && state.obstacles.length > 0) {
        state.obstacles.forEach(obs => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(obs.w, 80, obs.h), new THREE.MeshStandardMaterial({ color: 0x112233, emissive: 0x00ffff, emissiveIntensity: 0.2 }));
            mesh.position.set(obs.x + obs.w/2, 40, obs.y + obs.h/2);
            scene.add(mesh);
            meshes.obstacles.push(mesh);
        });
    }

    // UPDATE UI (Leaderboard & Stats)
    updateUI();
});

function updateUI() {
    // 1. Stats
    if (players[myId]) {
        const p = players[myId];
        kDisplay.innerText = p.kills;
        dDisplay.innerText = p.deaths;
        // Avoid division by zero
        const ratio = p.deaths === 0 ? p.kills : (p.kills / p.deaths).toFixed(2);
        rDisplay.innerText = ratio;
    }

    // 2. Leaderboard (Sort by Kills)
    const sortedPlayers = Object.values(players)
        .filter(p => p.isPlaying)
        .sort((a, b) => b.kills - a.kills)
        .slice(0, 5); // Top 5

    lbContent.innerHTML = sortedPlayers.map(p => `
        <div class="lb-row">
            <span class="lb-name">${p.name}</span>
            <span class="lb-score">${p.kills}</span>
        </div>
    `).join('');
}

// --- 4. RENDER LOOP ---
function animate() {
    requestAnimationFrame(animate);
    const now = Date.now();

    // Remove disconnected
    for (let id in meshes.players) {
        if (!players[id] || !players[id].isPlaying) {
            scene.remove(meshes.players[id]);
            delete meshes.players[id];
        }
    }

    for (let id in players) {
        const p = players[id];
        if (!p.isPlaying) continue; // Don't draw spectators

        let group = meshes.players[id];

        if (!group) {
            group = createSciFiSoldier(p.color);
            // ADD NAME TAG
            const nameTag = createNameTag(p.name);
            group.add(nameTag);
            
            scene.add(group);
            meshes.players[id] = group;
        }

        group.position.x = p.x;
        group.position.z = p.y;
        group.rotation.y = -p.angle + Math.PI / 2; // Right facing

        const isMoving = (group.userData.lastX !== p.x || group.userData.lastZ !== p.y);
        if (isMoving) {
            group.userData.leftLeg.rotation.x = Math.sin(now * 0.015) * 0.6;
            group.userData.rightLeg.rotation.x = Math.cos(now * 0.015) * 0.6;
        } else {
            group.userData.leftLeg.rotation.x = 0;
            group.userData.rightLeg.rotation.x = 0;
        }
        group.userData.lastX = p.x;
        group.userData.lastZ = p.y;
    }

    // Bullets
    meshes.bullets.forEach(b => scene.remove(b));
    meshes.bullets = [];
    bullets.forEach(b => {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(4), new THREE.MeshBasicMaterial({ color: 0xff00ff }));
        mesh.position.set(b.x, 20, b.y);
        scene.add(mesh);
        meshes.bullets.push(mesh);
    });

    // Camera
    if (isPlaying && players[myId]) {
        const p = players[myId];
        camera.position.x = p.x;
        camera.position.y = 120;
        camera.position.z = p.y + 100;
        camera.lookAt(p.x, 0, p.y);

        const dx = mouseX - (window.innerWidth / 2);
        const dy = mouseY - (window.innerHeight / 2);
        const angle = Math.atan2(dy, dx);
        socket.emit('input', { keys, angle });
    }

    renderer.render(scene, camera);
}

// FOV Logic
const fovSlider = document.getElementById('fovSlider');
const fovValue = document.getElementById('fovValue');
fovSlider.addEventListener('input', (e) => {
    const newFov = parseInt(e.target.value);
    fovValue.innerText = newFov;
    camera.fov = newFov;
    camera.updateProjectionMatrix();
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();

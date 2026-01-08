import * as THREE from 'three';

// --- 1. SETUP SCENE ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);
scene.fog = new THREE.Fog(0x111111, 100, 500);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(200, 500, 300);
dirLight.castShadow = true;
scene.add(dirLight);

// Floor
const gridHelper = new THREE.GridHelper(2000, 100, 0x00ffff, 0x222222);
scene.add(gridHelper);

const floorGeo = new THREE.PlaneGeometry(2000, 2000);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.5 });
const floor = new THREE.Mesh(floorGeo, floorMat);
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

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(10, 12, 6), armorMat);
    torso.position.y = 14; 
    torso.castShadow = true;
    group.add(torso);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 6), armorMat);
    head.position.y = 22;
    group.add(head);

    // Visor
    const visor = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 5), glowMat);
    visor.position.set(0, 22, 1.5); 
    group.add(visor);

    // Arms
    const rArm = new THREE.Mesh(new THREE.BoxGeometry(3, 10, 3), armorMat);
    rArm.position.set(7, 14, 2);
    rArm.rotation.x = -Math.PI / 2; 
    group.add(rArm);

    const lArm = new THREE.Mesh(new THREE.BoxGeometry(3, 10, 3), armorMat);
    lArm.position.set(-7, 14, 2);
    lArm.rotation.x = -Math.PI / 2;
    group.add(lArm);

    // Gun
    const gun = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 8), suitMat);
    gun.position.set(7, 14, 6);
    group.add(gun);

    // Legs
    const legGeo = new THREE.BoxGeometry(3.5, 10, 4);
    const leftLeg = new THREE.Mesh(legGeo, armorMat);
    leftLeg.position.set(-3, 5, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, armorMat);
    rightLeg.position.set(3, 5, 0);
    group.add(rightLeg);

    group.userData = { leftLeg, rightLeg };
    return group;
}

// --- 3. NETWORK ---
// @ts-ignore
const socket = io({ transports: ['websocket', 'polling'] });

let players = {};
let bullets = [];
let meshes = { players: {}, bullets: [], obstacles: [] };
let myId = null;

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
    
    if (meshes.obstacles.length === 0 && state.obstacles.length > 0) {
        state.obstacles.forEach(obs => {
            const geometry = new THREE.BoxGeometry(obs.w, 80, obs.h);
            const material = new THREE.MeshStandardMaterial({ 
                color: 0x112233, 
                emissive: 0x00ffff, 
                emissiveIntensity: 0.2 
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(obs.x + obs.w/2, 40, obs.y + obs.h/2);
            scene.add(mesh);
            meshes.obstacles.push(mesh);
        });
    }
});

// --- 4. RENDER LOOP ---
function animate() {
    requestAnimationFrame(animate);
    const now = Date.now();

    for (let id in meshes.players) {
        if (!players[id]) {
            scene.remove(meshes.players[id]);
            delete meshes.players[id];
        }
    }

    for (let id in players) {
        const p = players[id];
        let group = meshes.players[id];

        if (!group) {
            group = createSciFiSoldier(p.color);
            scene.add(group);
            meshes.players[id] = group;
        }

        group.position.x = p.x;
        group.position.z = p.y;
        
        // --- FIX IS HERE ---
        // We added "- Math.PI / 2" to rotate it 90 degrees Left.
        // If it's facing the wrong way still, change it to "+ Math.PI / 2"
        group.rotation.y = -p.angle - Math.PI / 2;
        // -------------------

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

    meshes.bullets.forEach(b => scene.remove(b));
    meshes.bullets = [];

    bullets.forEach(b => {
        const geometry = new THREE.SphereGeometry(4);
        const material = new THREE.MeshBasicMaterial({ color: 0xff00ff });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(b.x, 20, b.y);
        scene.add(mesh);
        meshes.bullets.push(mesh);
    });

    if (myId && players[myId]) {
        const p = players[myId];
        const cameraHeight = 120; 
        const cameraDistance = 100;
        
        camera.position.x = p.x;
        camera.position.y = cameraHeight;
        camera.position.z = p.y + cameraDistance;
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

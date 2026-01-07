const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 800;
canvas.height = 800;

let players = {};
let bullets = [];
let obstacles = [];
let myId = null;

// Input State
const keys = { w: false, a: false, s: false, d: false };
let mouseX = 0;
let mouseY = 0;

// Listeners
document.addEventListener('keydown', (e) => { if (keys.hasOwnProperty(e.key)) keys[e.key] = true; });
document.addEventListener('keyup', (e) => { if (keys.hasOwnProperty(e.key)) keys[e.key] = false; });
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
});
canvas.addEventListener('mousedown', () => {
    const me = players[socket.id];
    if (me) {
        const angle = Math.atan2(mouseY - me.y, mouseX - me.x);
        socket.emit('shoot', angle);
    }
});

// Sync
socket.on('connect', () => { myId = socket.id; });
socket.on('state', (state) => {
    players = state.players;
    bullets = state.bullets;
    obstacles = state.obstacles;
});

// Render Loop
function draw() {
    // 1. Clear Screen
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Draw Obstacles (Neon Walls)
    ctx.fillStyle = '#222';
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    obstacles.forEach(obs => {
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
    });

    // 3. Draw Predictive Sight (The Hook!)
    if (players[myId]) {
        drawPrediction(players[myId]);
    }

    // 4. Draw Bullets
    bullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ff00ff';
        ctx.fill();
        // Bullet Trail
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ff00ff';
    });
    ctx.shadowBlur = 0; // Reset

    // 5. Draw Players
    for (let id in players) {
        const p = players[id];
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        
        // Player Body
        ctx.beginPath();
        ctx.rect(-15, -15, 30, 30);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.stroke();
        
        ctx.restore();
    }

    // 6. Send Input
    if (myId) {
        const me = players[myId];
        const angle = Math.atan2(mouseY - me.y, mouseX - me.x);
        socket.emit('input', { keys, angle });
    }

    requestAnimationFrame(draw);
}

// The Predictive Line Logic
function drawPrediction(player) {
    let x = player.x;
    let y = player.y;
    let angle = Math.atan2(mouseY - y, mouseX - x);
    let vx = Math.cos(angle);
    let vy = Math.sin(angle);

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; // Faint line
    ctx.setLineDash([5, 5]);

    // Simulate 3 bounces
    for (let i = 0; i < 3; i++) {
        // Raycast roughly 300 pixels ahead or until hit
        let dist = 0;
        const maxDist = 300;
        let hit = false;

        while (dist < maxDist) {
            x += vx * 5;
            y += vy * 5;
            dist += 5;

            // Check collision with obstacles locally for visual
            for (let obs of obstacles) {
                if (x > obs.x && x < obs.x + obs.w && y > obs.y && y < obs.y + obs.h) {
                    
                    // Simple reflection logic for visual
                    const overlapX = (x - (obs.x + obs.w/2)) / (obs.w/2);
                    const overlapY = (y - (obs.y + obs.h/2)) / (obs.h/2);
                    
                    if (Math.abs(overlapX) > Math.abs(overlapY)) vx *= -1;
                    else vy *= -1;

                    hit = true;
                    break;
                }
            }
            if (hit) break;
            
            // Screen bounds
            if (x <= 0 || x >= 800) { vx *= -1; hit = true; break; }
            if (y <= 0 || y >= 800) { vy *= -1; hit = true; break; }
        }
        
        ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
}

draw();

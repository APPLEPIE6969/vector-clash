const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// Game State
const players = {};
const bullets = [];
const MAP_SIZE = 800;

const obstacles = [
    { x: 100, y: 100, w: 200, h: 20 },
    { x: 500, y: 300, w: 20, h: 300 },
    { x: 100, y: 500, w: 400, h: 20 },
    { x: 400, y: 100, w: 20, h: 200 } 
];

io.on('connection', (socket) => {
    console.log('Connected:', socket.id);

    // Create player entry but mark as INACTIVE (Spectator mode)
    players[socket.id] = {
        x: 0,
        y: 0,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        angle: 0,
        name: "",
        kills: 0,
        deaths: 0,
        isPlaying: false // Waiting for name
    };

    // 1. Handle "Join Game" event
    socket.on('join_game', (name) => {
        if (players[socket.id]) {
            players[socket.id].name = name.substring(0, 12); // Max 12 chars
            players[socket.id].isPlaying = true;
            // Spawn random position
            players[socket.id].x = Math.random() * 600 + 50;
            players[socket.id].y = Math.random() * 600 + 50;
        }
    });

    socket.on('input', (data) => {
        const p = players[socket.id];
        if (!p || !p.isPlaying) return; // Ignore if not playing
        
        const speed = 5;
        let newX = p.x;
        let newY = p.y;

        if (data.keys.w) newY -= speed;
        if (data.keys.s) newY += speed;
        if (data.keys.a) newX -= speed;
        if (data.keys.d) newX += speed;

        if (!checkWallCollision(newX, newY, 15)) {
            p.x = newX;
            p.y = newY;
        }
        p.angle = data.angle;
    });

    socket.on('shoot', (angle) => {
        const p = players[socket.id];
        if (!p || !p.isPlaying) return;

        bullets.push({
            x: p.x,
            y: p.y,
            vx: Math.cos(angle) * 10,
            vy: Math.sin(angle) * 10,
            owner: socket.id,
            bounces: 0,
            maxBounces: 3,
            dead: false
        });
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
    });
});

function checkWallCollision(x, y, radius) {
    if (x < 0 || x > MAP_SIZE || y < 0 || y > MAP_SIZE) return true;
    for (let obs of obstacles) {
        if (x > obs.x - radius && x < obs.x + obs.w + radius &&
            y > obs.y - radius && y < obs.y + obs.h + radius) {
            return true;
        }
    }
    return false;
}

// Physics Loop
setInterval(() => {
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        const steps = 5; 
        const stepX = b.vx / steps;
        const stepY = b.vy / steps;
        let hitWall = false;

        for (let s = 0; s < steps; s++) {
            b.x += stepX;
            b.y += stepY;

            if (b.x <= 0 || b.x >= MAP_SIZE) { b.vx *= -1; hitWall = true; }
            else if (b.y <= 0 || b.y >= MAP_SIZE) { b.vy *= -1; hitWall = true; }
            
            if (hitWall) { b.bounces++; break; }

            for (let obs of obstacles) {
                if (b.x > obs.x && b.x < obs.x + obs.w &&
                    b.y > obs.y && b.y < obs.y + obs.h) {
                    
                    const prevX = b.x - stepX;
                    const prevY = b.y - stepY;
                    const wasInX = prevX > obs.x && prevX < obs.x + obs.w;
                    const wasInY = prevY > obs.y && prevY < obs.y + obs.h;

                    if (wasInX) b.vy *= -1;
                    else if (wasInY) b.vx *= -1;
                    else { b.vx *= -1; b.vy *= -1; }

                    b.x = prevX;
                    b.y = prevY;
                    hitWall = true;
                    b.bounces++;
                    break; 
                }
            }
            if (hitWall) break;
        }

        if (!b.dead) {
            for (let id in players) {
                const p = players[id];
                // Only hit playing players
                if (id !== b.owner && p.isPlaying) {
                    const dist = Math.sqrt((b.x - p.x)**2 + (b.y - p.y)**2);
                    if (dist < 20) {
                        // 2. Update Stats
                        if (players[b.owner]) players[b.owner].kills++;
                        p.deaths++;
                        
                        // Respawn
                        p.x = Math.random() * 600 + 50;
                        p.y = Math.random() * 600 + 50;
                        
                        b.dead = true;
                        break;
                    }
                }
            }
        }

        if (b.dead || b.bounces > b.maxBounces) {
            bullets.splice(i, 1);
        }
    }

    io.emit('state', { players, bullets, obstacles });
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

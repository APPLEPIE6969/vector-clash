const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// Game State
const players = {};
const bullets = [];
const MAP_SIZE = 800;

// Simple Map Obstacles (Rectangles: x, y, w, h)
const obstacles = [
    { x: 100, y: 100, w: 200, h: 20 },
    { x: 500, y: 300, w: 20, h: 300 },
    { x: 100, y: 500, w: 400, h: 20 },
    { x: 400, y: 100, w: 20, h: 200 } // Center pillar
];

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Spawn new player
    players[socket.id] = {
        x: Math.random() * 600 + 50,
        y: Math.random() * 600 + 50,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        score: 0,
        angle: 0
    };

    socket.on('input', (data) => {
        const player = players[socket.id];
        if (!player) return;
        
        // Simple movement logic
        const speed = 5;
        let newX = player.x;
        let newY = player.y;

        if (data.keys.w) newY -= speed;
        if (data.keys.s) newY += speed;
        if (data.keys.a) newX -= speed;
        if (data.keys.d) newX += speed;

        // Wall Collision (Player)
        if (!checkWallCollision(newX, newY, 15)) {
            player.x = newX;
            player.y = newY;
        }
        player.angle = data.angle;
    });

    socket.on('shoot', (angle) => {
        bullets.push({
            x: players[socket.id].x,
            y: players[socket.id].y,
            vx: Math.cos(angle) * 10,
            vy: Math.sin(angle) * 10,
            owner: socket.id,
            bounces: 0,
            maxBounces: 3
        });
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
    });
});

function checkWallCollision(x, y, radius) {
    // Boundary check
    if (x < 0 || x > MAP_SIZE || y < 0 || y > MAP_SIZE) return true;
    
    // Obstacle check
    for (let obs of obstacles) {
        if (x > obs.x - radius && x < obs.x + obs.w + radius &&
            y > obs.y - radius && y < obs.y + obs.h + radius) {
            return true;
        }
    }
    return false;
}

// Game Loop (60 FPS)
setInterval(() => {
    // Update Bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.x += b.vx;
        b.y += b.vy;

        // Check Wall Collision & Bounce
        // Horizontal Walls
        if (b.x <= 0 || b.x >= MAP_SIZE) { b.vx *= -1; b.bounces++; }
        // Vertical Walls
        if (b.y <= 0 || b.y >= MAP_SIZE) { b.vy *= -1; b.bounces++; }

        // Obstacle Bounce
        for (let obs of obstacles) {
            if (b.x > obs.x && b.x < obs.x + obs.w &&
                b.y > obs.y && b.y < obs.y + obs.h) {
                
                // Determine which side was hit (simplified)
                const overlapX = (b.x - (obs.x + obs.w/2)) / (obs.w/2);
                const overlapY = (b.y - (obs.y + obs.h/2)) / (obs.h/2);

                if (Math.abs(overlapX) > Math.abs(overlapY)) b.vx *= -1;
                else b.vy *= -1;
                
                b.bounces++;
            }
        }

        // Check Player Hits
        for (let id in players) {
            if (id !== b.owner) {
                const p = players[id];
                const dist = Math.sqrt((b.x - p.x)**2 + (b.y - p.y)**2);
                if (dist < 20) {
                    // Reset player
                    p.x = Math.random() * 600 + 50;
                    p.y = Math.random() * 600 + 50;
                    if (players[b.owner]) players[b.owner].score++;
                    bullets.splice(i, 1); // Remove bullet
                    continue;
                }
            }
        }

        if (b.bounces > b.maxBounces) {
            bullets.splice(i, 1);
        }
    }

    io.emit('state', { players, bullets, obstacles });
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

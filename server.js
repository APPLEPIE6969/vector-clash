const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
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
    { x: 400, y: 100, w: 20, h: 200 } 
];

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

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
        
        const speed = 5;
        let newX = player.x;
        let newY = player.y;

        if (data.keys.w) newY -= speed;
        if (data.keys.s) newY += speed;
        if (data.keys.a) newX -= speed;
        if (data.keys.d) newX += speed;

        if (!checkWallCollision(newX, newY, 15)) {
            player.x = newX;
            player.y = newY;
        }
        player.angle = data.angle;
    });

    socket.on('shoot', (angle) => {
        if (!players[socket.id]) return;
        bullets.push({
            x: players[socket.id].x,
            y: players[socket.id].y,
            vx: Math.cos(angle) * 10,
            vy: Math.sin(angle) * 10,
            owner: socket.id,
            bounces: 0,
            maxBounces: 3,
            dead: false // Mark for deletion
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

// --- PHYSICS LOOP ---
setInterval(() => {
    // We iterate backwards so we can remove bullets easily
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        
        // FIX: SUB-STEPPING
        // Instead of moving 10 pixels at once, we move 2 pixels 5 times.
        // This ensures we catch the collision exactly when it enters the wall.
        const steps = 5; 
        const stepX = b.vx / steps;
        const stepY = b.vy / steps;
        let hitWall = false;

        for (let s = 0; s < steps; s++) {
            // Move one tiny step
            b.x += stepX;
            b.y += stepY;

            // 1. Check Map Boundaries
            if (b.x <= 0 || b.x >= MAP_SIZE) { b.vx *= -1; hitWall = true; }
            else if (b.y <= 0 || b.y >= MAP_SIZE) { b.vy *= -1; hitWall = true; }
            
            if (hitWall) {
                b.bounces++;
                break; // Stop stepping if we hit boundary
            }

            // 2. Check Obstacles
            for (let obs of obstacles) {
                // AABB Collision Detection (Point vs Rectangle)
                if (b.x > obs.x && b.x < obs.x + obs.w &&
                    b.y > obs.y && b.y < obs.y + obs.h) {
                    
                    // We hit a wall! 
                    // To find out WHICH side, we look at where we were 1 step ago.
                    const prevX = b.x - stepX;
                    const prevY = b.y - stepY;

                    // Was I within the horizontal range before?
                    const wasInXRange = prevX > obs.x && prevX < obs.x + obs.w;
                    // Was I within the vertical range before?
                    const wasInYRange = prevY > obs.y && prevY < obs.y + obs.h;

                    if (wasInXRange) {
                        // If I was in X range, I must have hit the Top or Bottom
                        b.vy *= -1;
                    } else if (wasInYRange) {
                        // If I was in Y range, I must have hit the Left or Right
                        b.vx *= -1;
                    } else {
                        // Hit a corner perfectly
                        b.vx *= -1;
                        b.vy *= -1;
                    }

                    // Push the bullet back to previous safe spot so it doesn't get stuck
                    b.x = prevX;
                    b.y = prevY;
                    
                    hitWall = true;
                    b.bounces++;
                    break; 
                }
            }
            if (hitWall) break; // Stop stepping if we hit an obstacle
        }

        // 3. Check Player Hits
        if (!b.dead) {
            for (let id in players) {
                if (id !== b.owner) {
                    const p = players[id];
                    const dist = Math.sqrt((b.x - p.x)**2 + (b.y - p.y)**2);
                    if (dist < 20) {
                        // Respawn Player
                        p.x = Math.random() * 600 + 50;
                        p.y = Math.random() * 600 + 50;
                        if (players[b.owner]) players[b.owner].score++;
                        b.dead = true;
                        break;
                    }
                }
            }
        }

        // Remove bullet if dead or too many bounces
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

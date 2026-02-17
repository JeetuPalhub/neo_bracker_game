const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game State
let gameRunning = false;
let score = 0;
let level = 1;
let lives = 3;
let highScore = localStorage.getItem('breakout_highScore') || 0;
let animationId;
let shakeAmount = 0;

// Audio System
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const sounds = {
    brick: { freq: 440, type: 'square', duration: 0.1 },
    paddle: { freq: 220, type: 'sine', duration: 0.15 },
    wall: { freq: 150, type: 'sine', duration: 0.1 },
    life: { freq: 100, type: 'sawtooth', duration: 0.5 },
    powerup: { freq: 880, type: 'triangle', duration: 0.2 }
};

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const s = sounds[type];
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = s.type;
    osc.frequency.setValueAtTime(s.freq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(s.freq / 2, audioCtx.currentTime + s.duration);

    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + s.duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + s.duration);
}

// Power-up System
const powerUpTypes = [
    { type: 'multi', color: '#fff', label: 'M' },
    { type: 'expand', color: '#00ff00', label: 'E' },
    { type: 'mega', color: '#ff0000', label: '!' }
];

class PowerUp {
    constructor(x, y, typeInfo) {
        this.x = x;
        this.y = y;
        this.type = typeInfo.type;
        this.color = typeInfo.color;
        this.label = typeInfo.label;
        this.width = 30;
        this.height = 30;
        this.speed = 3;
    }

    draw() {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height, 5);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fill();
        ctx.fillStyle = this.color;
        ctx.font = 'bold 18px Orbitron';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.label, this.x, this.y);
        ctx.restore();
    }

    update() {
        this.y += this.speed;
    }
}

let activePowerUps = [];
let balls = []; // Support for multiple balls
let megaBallMode = false;
let megaBallTimer = null;

// Update UI initial values
document.getElementById('high-score').innerText = highScore;

// Resize canvas to full screen
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Game Objects
const paddle = {
    x: canvas.width / 2 - 75,
    y: canvas.height - 40,
    width: 150,
    height: 15,
    color: '#00ffff',
    speed: 10,
    dx: 0
};

const ball = {
    x: canvas.width / 2,
    y: canvas.height - 60,
    radius: 10,
    speed: 6,
    dx: 4,
    dy: -4,
    color: '#ff00ff'
};

const brickInfo = {
    w: 80,
    h: 25,
    padding: 15,
    offsetX: 45,
    offsetY: 80,
    visible: true
};

let bricks = [];
const brickRowCount = 6;

function initBricks() {
    bricks = [];
    const cols = Math.floor((canvas.width - 2 * brickInfo.offsetX) / (brickInfo.w + brickInfo.padding));
    const startX = (canvas.width - (cols * (brickInfo.w + brickInfo.padding)) + brickInfo.padding) / 2;

    // Level Patterns
    const patterns = ['full', 'checker', 'pyramid', 'diamond'];
    const currentPattern = patterns[(level - 1) % patterns.length];

    for (let c = 0; c < cols; c++) {
        bricks[c] = [];
        for (let r = 0; r < brickRowCount; r++) {
            let status = 0;

            if (currentPattern === 'full') {
                status = 1;
            } else if (currentPattern === 'checker') {
                status = (c + r) % 2 === 0 ? 1 : 0;
            } else if (currentPattern === 'pyramid') {
                const mid = Math.floor(cols / 2);
                const distance = Math.abs(c - mid);
                status = (r >= distance) ? 1 : 0;
            } else if (currentPattern === 'diamond') {
                const midC = Math.floor(cols / 2);
                const midR = Math.floor(brickRowCount / 2);
                const dist = Math.abs(c - midC) + Math.abs(r - midR);
                status = (dist <= Math.max(midR, 2)) ? 1 : 0;
            }

            bricks[c][r] = {
                x: 0,
                y: 0,
                status: status,
                color: `hsl(${(c * 360 / cols) + (level * 30)}, 80%, 60%)`
            };
        }
    }
    return { cols, startX };
}

let brickLayout = initBricks();

// Particles
let particles = [];

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.radius = Math.random() * 4 + 1;
        this.color = color;
        this.velocity = {
            x: (Math.random() - 0.5) * 8,
            y: (Math.random() - 0.5) * 8
        };
        this.alpha = 1;
        this.decay = 0.02;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.closePath();
        ctx.restore();
    }

    update() {
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.alpha -= this.decay;
        this.velocity.x *= 0.99;
        this.velocity.y *= 0.99;
    }
}

// Controls
let rightPressed = false;
let leftPressed = false;

document.addEventListener('keydown', keyDownHandler);
document.addEventListener('keyup', keyUpHandler);
document.addEventListener('mousemove', mouseMoveHandler);

function keyDownHandler(e) {
    if (e.key === "Right" || e.key === "ArrowRight") rightPressed = true;
    else if (e.key === "Left" || e.key === "ArrowLeft") leftPressed = true;
}

function keyUpHandler(e) {
    if (e.key === "Right" || e.key === "ArrowRight") rightPressed = false;
    else if (e.key === "Left" || e.key === "ArrowLeft") leftPressed = false;
}

function mouseMoveHandler(e) {
    const relativeX = e.clientX - canvas.offsetLeft;
    if (relativeX > 0 && relativeX < canvas.width) {
        paddle.x = relativeX - paddle.width / 2;
    }
}

// Draw functions
function drawPaddle() {
    ctx.beginPath();
    ctx.roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 8);
    ctx.fillStyle = paddle.color;
    ctx.shadowBlur = 20;
    ctx.shadowColor = paddle.color;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.closePath();

    // Shine effect
    ctx.beginPath();
    ctx.roundRect(paddle.x + 5, paddle.y + 2, paddle.width - 10, 4, 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fill();
    ctx.closePath();
}

function drawBall(b) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fillStyle = b.color;
    ctx.shadowBlur = megaBallMode ? 30 : 20;
    ctx.shadowColor = b.color;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.closePath();
}

function drawBricks() {
    const { cols, startX } = brickLayout;
    for (let c = 0; c < cols; c++) {
        for (let r = 0; r < brickRowCount; r++) {
            if (bricks[c][r].status === 1) {
                const brickX = startX + (c * (brickInfo.w + brickInfo.padding));
                const brickY = brickInfo.offsetY + (r * (brickInfo.h + brickInfo.padding));
                bricks[c][r].x = brickX;
                bricks[c][r].y = brickY;

                ctx.beginPath();
                ctx.roundRect(brickX, brickY, brickInfo.w, brickInfo.h, 4);
                ctx.fillStyle = bricks[c][r].color;
                ctx.shadowBlur = 12;
                ctx.shadowColor = bricks[c][r].color;
                ctx.fill();

                // Brick detail
                ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                ctx.stroke();

                ctx.shadowBlur = 0;
                ctx.closePath();
            }
        }
    }
}

function createExplosion(x, y, color) {
    for (let i = 0; i < 20; i++) {
        particles.push(new Particle(x, y, color));
    }
    shakeAmount = 10;
}

function drawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i];
        if (particle.alpha <= 0) {
            particles.splice(i, 1);
        } else {
            particle.update();
            particle.draw();
        }
    }
}

function applyScreenShake() {
    if (shakeAmount > 0) {
        const dx = (Math.random() - 0.5) * shakeAmount;
        const dy = (Math.random() - 0.5) * shakeAmount;
        ctx.translate(dx, dy);
        shakeAmount *= 0.9;
        if (shakeAmount < 0.1) shakeAmount = 0;
    }
}

function collisionDetection(b) {
    const { cols } = brickLayout;
    let activeBricks = 0;

    for (let c = 0; c < cols; c++) {
        for (let r = 0; r < brickRowCount; r++) {
            const brick = bricks[c][r];
            if (brick.status === 1) {
                activeBricks++;
                if (b.x + b.radius > brick.x && b.x - b.radius < brick.x + brickInfo.w &&
                    b.y + b.radius > brick.y && b.y - b.radius < brick.y + brickInfo.h) {

                    if (!megaBallMode) {
                        const distX = Math.abs(b.x - (brick.x + brickInfo.w / 2));
                        const distY = Math.abs(b.y - (brick.y + brickInfo.h / 2));
                        if (distX > distY) b.dx = -b.dx;
                        else b.dy = -b.dy;
                    }

                    brick.status = 0;
                    score += 10;
                    updateUI();
                    createExplosion(brick.x + brickInfo.w / 2, brick.y + brickInfo.h / 2, brick.color);
                    playSound('brick');

                    if (Math.random() < 0.15) {
                        const type = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
                        activePowerUps.push(new PowerUp(brick.x + brickInfo.w / 2, brick.y + brickInfo.h / 2, type));
                    }
                    activeBricks--;
                }
            }
        }
    }

    if (activeBricks === 0) {
        nextLevel();
    }
}

function updateUI() {
    document.getElementById('score').innerText = score;
    document.getElementById('level').innerText = level;
    document.getElementById('lives').innerText = lives;

    if (score > highScore) {
        highScore = score;
        localStorage.setItem('breakout_highScore', highScore);
        document.getElementById('high-score').innerText = highScore;
    }
}

function draw() {
    if (!gameRunning) return;

    ctx.save();
    applyScreenShake();

    ctx.fillStyle = 'rgba(2, 2, 5, 0.4)';
    ctx.fillRect(-100, -100, canvas.width + 200, canvas.height + 200);

    drawBricks();
    drawPaddle();
    drawParticles();

    // Draw and Update Balls
    for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i];
        drawBall(b);

        b.x += b.dx;
        b.y += b.dy;

        // Wall Collision
        if (b.x + b.dx > canvas.width - b.radius || b.x + b.dx < b.radius) {
            b.dx = -b.dx;
            playSound('wall');
        }
        if (b.y + b.dy < b.radius) {
            b.dy = -b.dy;
            playSound('wall');
        } else if (b.y + b.dy > paddle.y - b.radius) {
            if (b.x > paddle.x && b.x < paddle.x + paddle.width) {
                let collidePoint = b.x - (paddle.x + paddle.width / 2);
                collidePoint = collidePoint / (paddle.width / 2);
                let angle = collidePoint * Math.PI / 3;
                let speed = Math.sqrt(b.dx * b.dx + b.dy * b.dy);

                b.dx = speed * Math.sin(angle);
                b.dy = -speed * Math.cos(angle);

                b.speed = Math.min(b.speed + 0.1, 15);
                createExplosion(b.x, b.y, paddle.color);
                playSound('paddle');
            } else if (b.y > canvas.height) {
                balls.splice(i, 1);
                if (balls.length === 0) {
                    handleLifeLoss();
                }
            }
        }

        collisionDetection(b);
    }

    // Draw and Update Power-ups
    for (let i = activePowerUps.length - 1; i >= 0; i--) {
        const p = activePowerUps[i];
        p.draw();
        p.update();

        // Paddle collection
        if (p.x > paddle.x && p.x < paddle.x + paddle.width && p.y > paddle.y && p.y < paddle.y + paddle.height) {
            applyPowerUp(p.type);
            activePowerUps.splice(i, 1);
            playSound('powerup');
        } else if (p.y > canvas.height) {
            activePowerUps.splice(i, 1);
        }
    }

    // Paddle Movement
    if (rightPressed && paddle.x < canvas.width - paddle.width) paddle.x += paddle.speed;
    else if (leftPressed && paddle.x > 0) paddle.x -= paddle.speed;

    ctx.restore();
    animationId = requestAnimationFrame(draw);
}

function applyPowerUp(type) {
    if (type === 'multi') {
        const mainBall = balls[0] || { x: paddle.x + paddle.width / 2, y: paddle.y - 20, dx: 4, dy: -4, radius: 10, color: '#ff00ff', speed: 6 };
        for (let i = 0; i < 2; i++) {
            balls.push({
                ...mainBall,
                dx: mainBall.dx * (Math.random() * 0.5 + 0.8) * (Math.random() < 0.5 ? 1 : -1),
                dy: -Math.abs(mainBall.dy)
            });
        }
    } else if (type === 'expand') {
        const oldWidth = paddle.width;
        paddle.width = 250;
        setTimeout(() => { paddle.width = oldWidth; }, 8000);
    } else if (type === 'mega') {
        megaBallMode = true;
        balls.forEach(b => { b.radius = 20; b.color = '#ff0000'; });
        if (megaBallTimer) clearTimeout(megaBallTimer);
        megaBallTimer = setTimeout(() => {
            megaBallMode = false;
            balls.forEach(b => { b.radius = 10; b.color = '#ff00ff'; });
        }, 6000);
    }
}

function handleLifeLoss() {
    lives--;
    updateUI();
    playSound('life');
    if (lives <= 0) {
        gameOver();
    } else {
        resetBallPaddle();
    }
}

function startGame() {
    gameRunning = true;
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-over-screen').classList.add('hidden');
    level = 1;
    score = 0;
    lives = 3;
    activePowerUps = [];
    megaBallMode = false;
    updateUI();
    brickLayout = initBricks();
    resetBallPaddle();
    draw();
}

function nextLevel() {
    level++;
    updateUI();
    activePowerUps = [];
    brickLayout = initBricks();
    resetBallPaddle();
}

function resetBallPaddle() {
    paddle.x = (canvas.width - paddle.width) / 2;
    balls = [];
    const speed = 5 + (level * 0.5);
    balls.push({
        x: canvas.width / 2,
        y: paddle.y - 20,
        radius: 10,
        color: '#ff00ff',
        speed: speed,
        dx: speed * (Math.random() < 0.5 ? 1 : -1),
        dy: -speed
    });
    particles = [];
}

function gameOver() {
    gameRunning = false;
    cancelAnimationFrame(animationId);
    document.getElementById('final-score').innerText = score;
    document.getElementById('final-level').innerText = level;
    document.getElementById('game-over-screen').classList.remove('hidden');
}

// Event Listeners
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

window.addEventListener('resize', () => {
    resizeCanvas();
    brickLayout = initBricks();
    resetBallPaddle();
});

// Initial draw
resizeCanvas();
brickLayout = initBricks();
drawBricks();
drawPaddle();

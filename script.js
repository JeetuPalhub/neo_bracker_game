const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game State
let gameRunning = false;
let score = 0;
let level = 1;
let animationId;

// Resize canvas to full screen
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Game Objects
const paddle = {
    x: canvas.width / 2 - 60,
    y: canvas.height - 30,
    width: 120,
    height: 15,
    color: '#00ffff',
    speed: 8,
    dx: 0
};

const ball = {
    x: canvas.width / 2,
    y: canvas.height - 40,
    radius: 8,
    speed: 6,
    dx: 4,
    dy: -4,
    color: '#ff00ff'
};

const brickInfo = {
    w: 75,
    h: 20,
    padding: 10,
    offsetX: 45,
    offsetY: 60,
    visible: true
};

let bricks = [];
const brickRowCount = 5;
const brickColumnCount = 12; // Will depend on width

function initBricks() {
    bricks = [];
    const cols = Math.floor((canvas.width - 2 * brickInfo.offsetX) / (brickInfo.w + brickInfo.padding));
    const startX = (canvas.width - (cols * (brickInfo.w + brickInfo.padding))) / 2;

    for (let c = 0; c < cols; c++) {
        bricks[c] = [];
        for (let r = 0; r < brickRowCount; r++) {
            bricks[c][r] = {
                x: 0,
                y: 0,
                status: 1,
                color: `hsl(${c * 30 + r * 20}, 70%, 50%)`
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
        this.radius = Math.random() * 3 + 1;
        this.color = color;
        this.velocity = {
            x: (Math.random() - 0.5) * 5,
            y: (Math.random() - 0.5) * 5
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
        ctx.fill();
        ctx.closePath();
        ctx.restore();
    }

    update() {
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.alpha -= this.decay;
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
    ctx.rect(paddle.x, paddle.y, paddle.width, paddle.height);
    ctx.fillStyle = paddle.color;
    ctx.shadowBlur = 15;
    ctx.shadowColor = paddle.color;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.closePath();
}

function drawBall() {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = ball.color;
    ctx.shadowBlur = 15;
    ctx.shadowColor = ball.color;
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
                ctx.rect(brickX, brickY, brickInfo.w, brickInfo.h);
                ctx.fillStyle = bricks[c][r].color;
                ctx.shadowBlur = 10;
                ctx.shadowColor = bricks[c][r].color;
                ctx.fill();
                ctx.shadowBlur = 0;
                ctx.closePath();
            }
        }
    }
}

function createExplosion(x, y, color) {
    for (let i = 0; i < 15; i++) {
        particles.push(new Particle(x, y, color));
    }
}

function drawParticles() {
    particles.forEach((particle, index) => {
        if (particle.alpha <= 0) {
            particles.splice(index, 1);
        } else {
            particle.update();
            particle.draw();
        }
    });
}

function collisionDetection() {
    const { cols } = brickLayout;
    let activeBricks = 0;

    for (let c = 0; c < cols; c++) {
        for (let r = 0; r < brickRowCount; r++) {
            const b = bricks[c][r];
            if (b.status === 1) {
                activeBricks++;
                if (ball.x > b.x && ball.x < b.x + brickInfo.w && ball.y > b.y && ball.y < b.y + brickInfo.h) {
                    ball.dy = -ball.dy;
                    b.status = 0;
                    score += 10;
                    document.getElementById('score').innerText = score;
                    createExplosion(b.x + brickInfo.w / 2, b.y + brickInfo.h / 2, b.color);
                    activeBricks--;
                }
            }
        }
    }

    if (activeBricks === 0) {
        nextLevel();
    }
}

function draw() {
    if (!gameRunning) return;

    // Trail effect
    ctx.fillStyle = 'rgba(5, 5, 5, 0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawBricks();
    drawPaddle();
    drawParticles();
    drawBall();

    collisionDetection();

    // Paddle Movement
    if (rightPressed && paddle.x < canvas.width - paddle.width) paddle.x += paddle.speed;
    else if (leftPressed && paddle.x > 0) paddle.x -= paddle.speed;

    // Ball Movement
    ball.x += ball.dx;
    ball.y += ball.dy;

    // Wall Collision
    if (ball.x + ball.dx > canvas.width - ball.radius || ball.x + ball.dx < ball.radius) {
        ball.dx = -ball.dx;
    }
    if (ball.y + ball.dy < ball.radius) {
        ball.dy = -ball.dy;
    } else if (ball.y + ball.dy > canvas.height - ball.radius) {
        if (ball.x > paddle.x && ball.x < paddle.x + paddle.width) {
            let collidePoint = ball.x - (paddle.x + paddle.width / 2);
            collidePoint = collidePoint / (paddle.width / 2);
            let angle = collidePoint * Math.PI / 3;
            let speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
            ball.dx = speed * Math.sin(angle);
            ball.dy = -speed * Math.cos(angle);
            ball.speed = Math.min(ball.speed + 0.1, 15);
        } else {
            gameOver();
            return;
        }
    }

    animationId = requestAnimationFrame(draw);
}

function startGame() {
    gameRunning = true;
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-over-screen').classList.add('hidden');
    level = 1;
    score = 0;
    document.getElementById('score').innerText = score;
    document.getElementById('level').innerText = level;
    brickLayout = initBricks();
    resetBallPaddle();
    draw();
}

function nextLevel() {
    level++;
    document.getElementById('level').innerText = level;
    brickLayout = initBricks();
    resetBallPaddle();
    ball.speed += 1;
}

function resetBallPaddle() {
    paddle.x = (canvas.width - paddle.width) / 2;
    ball.x = canvas.width / 2;
    ball.y = canvas.height - 30;
    let speed = 4 + (level * 0.5);
    ball.dx = speed * (Math.random() < 0.5 ? 1 : -1);
    ball.dy = -speed;
    particles = [];
}

function gameOver() {
    gameRunning = false;
    cancelAnimationFrame(animationId);
    document.getElementById('final-score').innerText = score;
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

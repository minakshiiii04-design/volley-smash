
(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  if (!canvas) {
    console.error('Canvas with id="gameCanvas" not found.');
    return;
  }

  const ctx = canvas.getContext("2d");
  const playerScoreEl = document.getElementById("playerScore");
  const cpuScoreEl = document.getElementById("cpuScore");
  const gameStatus = document.getElementById("gameStatus");
  const startOverlay = document.getElementById("startOverlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayText = document.getElementById("overlayText");
  const startBtn = document.getElementById("startBtn");

  const WIN_SCORE = 11;
  const GRAVITY = 900;
  const PLAYER_GRAVITY = 1450;
  const BALL_RADIUS = 12;
  const NET_WIDTH = 8;
  const HIT_COOLDOWN = 0.28;
  const HIT_REACH_X = 49;
  const HIT_REACH_Y = 48;
  const MAX_BALL_SPEED = 760;

  let court = {};
  let playerScore = 0;
  let cpuScore = 0;
  let running = false;
  let gameOver = false;
  let lastTime = 0;
  let pointTimer = 0;
  let serveSide = "player";
  let messageTimer = 0;
  let particles = [];

  const keys = Object.create(null);
  const touch = { left: false, right: false };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function updateCourt() {
    court.width = canvas.width;
    court.height = canvas.height;
    court.floorY = Math.min(canvas.height - 55, canvas.height * 0.88);
    court.netX = canvas.width / 2;
    court.netTop = court.floorY - canvas.height * 0.32;
    court.netWidth = NET_WIDTH;
    court.playerMin = 28;
    court.playerMax = court.netX - 28;
    court.cpuMin = court.netX + 28;
    court.cpuMax = canvas.width - 28;
  }

  updateCourt();

  const player = {
    x: canvas.width * 0.2,
    y: 0,
    w: 34,
    h: 70,
    vx: 0,
    vy: 0,
    speed: 285,
    jumpPower: 510,
    grounded: true,
    hitCooldown: 0,
    hitFlash: 0,
    facing: 1
  };

  const cpu = {
    x: canvas.width * 0.8,
    y: 0,
    w: 34,
    h: 70,
    vx: 0,
    vy: 0,
    speed: 245,
    jumpPower: 500,
    grounded: true,
    hitCooldown: 0,
    hitFlash: 0,
    facing: -1,
    reaction: 0,
    targetX: 0
  };

  const ball = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    r: BALL_RADIUS,
    active: false,
    lastHitter: null,
    trail: [],
    spin: 0
  };

  function status(message) {
    if (gameStatus) gameStatus.textContent = message;
    messageTimer = 1.4;
  }

  function showOverlay(title, message, buttonText) {
    if (!startOverlay) return;
    if (overlayTitle) overlayTitle.textContent = title;
    if (overlayText) overlayText.textContent = message;
    if (startBtn) startBtn.textContent = buttonText;
    startOverlay.classList.remove("hidden");
  }

  function hideOverlay() {
    if (startOverlay) startOverlay.classList.add("hidden");
  }

  function updateScoreboard() {
    if (playerScoreEl) playerScoreEl.textContent = playerScore;
    if (cpuScoreEl) cpuScoreEl.textContent = cpuScore;
  }

  function resetPlayer(p, x) {
    p.x = x;
    p.y = court.floorY - p.h;
    p.vx = 0;
    p.vy = 0;
    p.grounded = true;
    p.hitCooldown = 0;
    p.hitFlash = 0;
    p.facing = p === player ? 1 : -1;
  }

  function resetPlayers() {
    resetPlayer(player, clamp(canvas.width * 0.2, 70, court.netX - 55));
    resetPlayer(cpu, clamp(canvas.width * 0.8, court.netX + 55, canvas.width - 70));
    cpu.reaction = 0.15;
    cpu.targetX = cpu.x;
  }

  function resetBall() {
    ball.vx = 0;
    ball.vy = 0;
    ball.active = false;
    ball.lastHitter = null;
    ball.trail = [];
    ball.spin = 0;

    ball.x = serveSide === "player"
      ? court.netX - canvas.width * 0.23
      : court.netX + canvas.width * 0.23;

    ball.y = court.floorY - BALL_RADIUS;
  }

  function startGame() {
    playerScore = 0;
    cpuScore = 0;
    gameOver = false;
    running = true;
    pointTimer = 0;
    serveSide = "player";
    particles = [];

    resetPlayers();
    resetBall();
    updateScoreboard();
    hideOverlay();
    status("Your serve! Press X or HIT.");
  }

  function jump(p) {
    if (!running || pointTimer > 0 || !p.grounded) return;
    p.vy = -p.jumpPower;
    p.grounded = false;
  }

  function spawnHitParticles(x, y, color) {
    for (let i = 0; i < 9; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 35 + Math.random() * 140;

      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.25 + Math.random() * 0.15,
        maxLife: 0.4,
        color
      });
    }
  }

  function launchBallToTarget(side, startX, startY, isServe = false) {
    const targetX = side === "player"
      ? court.netX + 65 +
        Math.random() * Math.max(20, court.cpuMax - court.netX - 95)
      : court.playerMin + 25 +
        Math.random() * Math.max(20, court.netX - court.playerMin - 75);

    const flightTime = isServe ? 1.35 : 1.18 + Math.random() * 0.22;
    const targetY = court.floorY - ball.r;

    ball.x = startX;
    ball.y = startY;
    ball.vx = (targetX - startX) / flightTime;
    ball.vy = (
      targetY - startY -
      0.5 * GRAVITY * flightTime * flightTime
    ) / flightTime;

    const netFault = !isServe && Math.random() < 0.10;
    const timeToNet = (court.netX - startX) / ball.vx;

    if (!netFault && timeToNet > 0 && timeToNet < flightTime) {
      const safeHeight = court.netTop - ball.r - 8;
      const yAtNet =
        startY +
        ball.vy * timeToNet +
        0.5 * GRAVITY * timeToNet * timeToNet;

      if (yAtNet > safeHeight) {
        ball.vy = (
          safeHeight - startY -
          0.5 * GRAVITY * timeToNet * timeToNet
        ) / timeToNet;
      }
    }

    ball.spin = (Math.random() - 0.5) * 0.8;
  }

  function serveBall(side) {
    if (!running || gameOver || ball.active || pointTimer > 0) return;
    if (side !== serveSide) return;

    const startX = side === "player"
      ? player.x + 28
      : cpu.x - 28;

    const server = side === "player" ? player : cpu;
    const startY = Math.min(server.y + 30, court.floorY - 80);

    ball.active = true;
    ball.lastHitter = side;
    launchBallToTarget(side, startX, startY, true);
    status(side === "player" ? "Serve! Get ready!" : "CPU serves!");
  }

  function hitBall(p, side) {
    if (!running || pointTimer > 0 || p.hitCooldown > 0) return false;

    if (!ball.active) {
      if (side === serveSide) {
        serveBall(side);
        p.hitCooldown = HIT_COOLDOWN;
        p.hitFlash = 0.18;
        return true;
      }
      return false;
    }

    if (side === "player" && ball.x > court.netX + ball.r + 12) return false;
    if (side === "cpu" && ball.x < court.netX - ball.r) return false;

    const dir = side === "player" ? 1 : -1;
    const armX = p.x + dir * 22;
    const armY = p.y + 36;
    const dx = ball.x - armX;
    const dy = ball.y - armY;
    const reachX = HIT_REACH_X + ball.r + 25;
    const reachY = HIT_REACH_Y + ball.r + 25;

    if (Math.abs(dx) > reachX || Math.abs(dy) > reachY) return false;
    if (Math.hypot(dx / reachX, dy / reachY) > 1.35) return false;

    const contactHeight = clamp((armY - ball.y) / 58, -0.8, 1.2);
    const startX = armX + dir * (ball.r + 4);
    const startY = armY - 4;

    ball.active = true;
    ball.lastHitter = side;
    launchBallToTarget(side, startX, startY, false);

    const hitDirection = side === "player" ? 1 : -1;
    const minimumSpeed = 300;

    if (hitDirection === 1) {
      ball.vx = Math.max(minimumSpeed, Math.abs(ball.vx));
    } else {
      ball.vx = -Math.max(minimumSpeed, Math.abs(ball.vx));
    }

    ball.vx += p.vx * 0.05;

    if (contactHeight < -0.35 && Math.random() < 0.18) {
      ball.vy += 100;
    }

    p.hitCooldown = HIT_COOLDOWN;
    p.hitFlash = 0.2;

    spawnHitParticles(
      ball.x,
      ball.y,
      side === "player" ? "#7dd3fc" : "#fda4af"
    );

    status(side === "player" ? "Nice hit!" : "CPU returns the ball!");
    return true;
  }

  function moveCharacter(p, direction, dt) {
    p.vx = direction * p.speed;
    p.x += p.vx * dt;

    if (direction !== 0) {
      p.facing = direction > 0 ? 1 : -1;
    }

    if (p === player) {
      p.x = clamp(p.x, court.playerMin, court.netX - 25);
    } else {
      p.x = clamp(p.x, court.netX + 25, court.cpuMax);
      p.facing = -1;
    }

    p.vy += PLAYER_GRAVITY * dt;
    p.y += p.vy * dt;

    if (p.y + p.h >= court.floorY) {
      p.y = court.floorY - p.h;
      p.vy = 0;
      p.grounded = true;
    } else {
      p.grounded = false;
    }

    p.hitCooldown = Math.max(0, p.hitCooldown - dt);
    p.hitFlash = Math.max(0, p.hitFlash - dt);
  }

  function predictedLandingX() {
    const targetY = court.floorY - ball.r;
    const a = 0.5 * GRAVITY;
    const b = ball.vy;
    const c = ball.y - targetY;
    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) return ball.x + ball.vx * 0.3;

    const t = Math.max(0, (-b + Math.sqrt(discriminant)) / (2 * a));
    return ball.x + ball.vx * Math.min(t, 1.8);
  }

  function updateCPU(dt) {
    if (!running || pointTimer > 0) return;

    let direction = 0;

    if (!ball.active) {
      if (serveSide === "cpu") {
        const home = court.netX + (court.cpuMax - court.netX) * 0.45;

        if (cpu.x < home - 8) direction = 1;
        else if (cpu.x > home + 8) direction = -1;

        if (Math.abs(cpu.x - home) < 18) serveBall("cpu");
      }

      moveCharacter(cpu, direction, dt);
      cpu.facing = -1;
      return;
    }

    const onCpuSide = ball.x >= court.netX;
    const movingTowardCpu = ball.vx > 0 && ball.x < court.netX;
    let target = court.netX + (court.cpuMax - court.netX) * 0.45;

    if (onCpuSide || movingTowardCpu) {
      target = clamp(
        predictedLandingX(),
        court.netX + 45,
        court.cpuMax - 22
      );
    }

    cpu.targetX = target;

    if (target < cpu.x - 10) direction = -1;
    else if (target > cpu.x + 10) direction = 1;

    const closeX = Math.abs(ball.x - cpu.x) < 90;
    const ballAboveFloor = ball.y < court.floorY - 30;
    const ballComingDown = ball.vy > -120;

    cpu.reaction = Math.max(0, cpu.reaction - dt);

    if (
      cpu.grounded &&
      onCpuSide &&
      closeX &&
      ballAboveFloor &&
      ballComingDown &&
      cpu.reaction <= 0
    ) {
      jump(cpu);
      cpu.reaction = 0.22;
    }

    moveCharacter(cpu, direction, dt);
    cpu.facing = -1;

    if (ball.x > court.netX && cpu.hitCooldown <= 0) {
      hitBall(cpu, "cpu");
    }
  }

  // winner must be either "player" or "cpu".
  // The guards prevent the same rally from awarding multiple points.
  function awardPoint(winner) {
    if (!running || pointTimer > 0 || gameOver) return;

    ball.active = false;
    ball.vx = 0;
    ball.vy = 0;

    if (winner === "player") {
      playerScore += 1;
      serveSide = "player";
      status("Point for you!");
    } else if (winner === "cpu") {
      cpuScore += 1;
      serveSide = "cpu";
      status("Point for CPU!");
    } else {
      return;
    }

    updateScoreboard();

    if (playerScore >= WIN_SCORE || cpuScore >= WIN_SCORE) {
      endGame();
      return;
    }

    pointTimer = 1.25;
  }

  // A ball landing on one team's side gives the point to the other team.
  function awardLandingPoint() {
    const landedOnPlayerSide = ball.x < court.netX;
    const winner = landedOnPlayerSide ? "cpu" : "player";
    awardPoint(winner);
  }

  function endGame() {
    running = false;
    gameOver = true;

    const won = playerScore >= WIN_SCORE;

    showOverlay(
      won ? "You Win! 🏆" : "CPU Wins!",
      `${playerScore} - ${cpuScore}`,
      "Play Again"
    );

    status(won ? "Great match!" : "Try again!");
  }

  function updateBall(dt) {
    if (!ball.active) return;

    const previousX = ball.x;

    ball.trail.push({ x: ball.x, y: ball.y, life: 0.18 });
    if (ball.trail.length > 6) ball.trail.shift();

    ball.vy += GRAVITY * dt;
    ball.vx += ball.spin * 5 * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x - ball.r < 0) {
      ball.x = ball.r;
      ball.vx = Math.abs(ball.vx) * 0.72;
    } else if (ball.x + ball.r > court.width) {
      ball.x = court.width - ball.r;
      ball.vx = -Math.abs(ball.vx) * 0.72;
    }

    const netLeft = court.netX - court.netWidth / 2;
    const netRight = court.netX + court.netWidth / 2;

    const overlapsX =
      ball.x + ball.r > netLeft &&
      ball.x - ball.r < netRight;

    const overlapsY =
      ball.y + ball.r > court.netTop &&
      ball.y - ball.r < court.floorY;

    if (overlapsX && overlapsY) {
      if (previousX < court.netX) {
        ball.x = netLeft - ball.r;
        ball.vx = -Math.abs(ball.vx) * 0.18;
      } else {
        ball.x = netRight + ball.r;
        ball.vx = Math.abs(ball.vx) * 0.18;
      }

      ball.vy = Math.max(ball.vy, 25);
    }

    // FIX: score is awarded according to the side where the ball lands.
    if (ball.y + ball.r >= court.floorY) {
      ball.y = court.floorY - ball.r;
      awardLandingPoint();
      return;
    }

    // If the ball goes out through the top, the last hitter's opponent scores.
    if (ball.y + ball.r < 0) {
      const winner = ball.lastHitter === "player" ? "cpu" : "player";
      awardPoint(winner);
      return;
    }

    const speed = Math.hypot(ball.vx, ball.vy);

    if (speed > MAX_BALL_SPEED) {
      const scale = MAX_BALL_SPEED / speed;
      ball.vx *= scale;
      ball.vy *= scale;
    }
  }

  function update(dt) {
    messageTimer = Math.max(0, messageTimer - dt);

    for (const p of particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.97;
      p.vy *= 0.97;
    }

    particles = particles.filter(p => p.life > 0);

    for (const t of ball.trail) t.life -= dt;
    ball.trail = ball.trail.filter(t => t.life > 0);

    if (!running) return;

    if (pointTimer > 0) {
      pointTimer -= dt;

      if (pointTimer <= 0) {
        resetPlayers();
        resetBall();
        status(
          serveSide === "player"
            ? "Your serve! Press X or HIT."
            : "CPU is preparing to serve."
        );
      }

      return;
    }

    let direction = 0;
    if (keys.ArrowLeft || keys.a || touch.left) direction--;
    if (keys.ArrowRight || keys.d || touch.right) direction++;

    moveCharacter(player, direction, dt);
    updateCPU(dt);
    updateBall(dt);
  }

  function drawCourt() {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#14284a");
    gradient.addColorStop(1, "#0a1428");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(255,255,255,0.06)";

    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.ellipse(
        (i + 0.5) * canvas.width / 7,
        25,
        45,
        8,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    const floorGradient = ctx.createLinearGradient(
      0, court.floorY, 0, canvas.height
    );

    floorGradient.addColorStop(0, "#258b8a");
    floorGradient.addColorStop(1, "#145b68");

    ctx.fillStyle = floorGradient;
    ctx.fillRect(
      0,
      court.floorY,
      canvas.width,
      canvas.height - court.floorY
    );

    ctx.strokeStyle = "rgba(255,255,255,0.17)";
    ctx.lineWidth = 1;

    for (let x = 40; x < canvas.width; x += 55) {
      ctx.beginPath();
      ctx.moveTo(x, court.floorY);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, court.floorY);
    ctx.lineTo(canvas.width, court.floorY);
    ctx.moveTo(court.netX, court.floorY);
    ctx.lineTo(court.netX, court.netTop);
    ctx.stroke();

    ctx.fillStyle = "#dbeafe";
    ctx.fillRect(
      court.netX - court.netWidth / 2 - 2,
      court.netTop,
      court.netWidth + 4,
      court.floorY - court.netTop
    );

    ctx.strokeStyle = "rgba(36,52,75,0.65)";
    ctx.lineWidth = 1;

    for (let y = court.netTop + 7; y < court.floorY; y += 9) {
      ctx.beginPath();
      ctx.moveTo(court.netX - 5, y);
      ctx.lineTo(court.netX + 5, y);
      ctx.stroke();
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(court.netX - 7, court.netTop - 3, 14, 5);
  }

  // Original player design: shadow, legs, jersey, face, hair and arm.
  function drawPlayer(p, color, skin) {
    const height = court.floorY - (p.y + p.h);
    const shadowScale = clamp(1 - height / 190, 0.35, 1);

    ctx.fillStyle = "rgba(0,0,0,0.24)";
    ctx.beginPath();
    ctx.ellipse(
      p.x,
      court.floorY - 2,
      23 * shadowScale,
      6 * shadowScale,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.strokeStyle = "#172033";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";

    const swing = p.grounded
      ? Math.sin(performance.now() / 75) * Math.min(3, Math.abs(p.vx) / 70)
      : 3;

    ctx.beginPath();
    ctx.moveTo(p.x - 7, p.y + p.h - 18);
    ctx.lineTo(p.x - 9 - swing, p.y + p.h - 2);
    ctx.moveTo(p.x + 7, p.y + p.h - 18);
    ctx.lineTo(p.x + 9 + swing, p.y + p.h - 2);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(p.x - p.w / 2, p.y + 23, p.w, 32, 7);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillRect(p.x - 2, p.y + 28, 4, 19);

    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(p.x, p.y + 12, 13, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = p === player ? "#1e3a8a" : "#7f1d1d";
    ctx.beginPath();
    ctx.arc(p.x, p.y + 8, 13, Math.PI, Math.PI * 2);
    ctx.fill();

    const armReach = p.hitFlash > 0 ? 31 : 21;

    ctx.strokeStyle = skin;
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y + 31);
    ctx.lineTo(
      p.x + p.facing * armReach,
      p.y + (p.hitFlash > 0 ? 31 : 41)
    );
    ctx.stroke();
  }

  function drawBall() {
    const height = Math.max(0, court.floorY - ball.y);
    const shadowScale = clamp(1 - height / 390, 0.18, 1);

    ctx.fillStyle = "rgba(0,0,0,0.24)";
    ctx.beginPath();
    ctx.ellipse(
      ball.x,
      court.floorY - 2,
      ball.r * shadowScale,
      4 * shadowScale,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    for (const t of ball.trail) {
      ctx.globalAlpha = clamp(t.life / 0.18, 0, 0.35);
      ctx.fillStyle = "#fef3c7";
      ctx.beginPath();
      ctx.arc(t.x, t.y, ball.r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.rotate(ball.spin * performance.now() / 250);

    const gradient = ctx.createRadialGradient(-4, -5, 2, 0, 0, ball.r + 2);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(1, "#fbbf24");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, ball.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#e87920";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, ball.r * 0.68, -1.1, 1.1);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, ball.r * 0.68, 2.05, 4.25);
    ctx.stroke();

    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  function render() {
    drawCourt();
    drawPlayer(player, "#38bdf8", "#ffd2a6");
    drawPlayer(cpu, "#fb7185", "#ffd2a6");
    drawBall();
    drawParticles();
  }

  function loop(timestamp) {
    const dt = lastTime
      ? Math.min((timestamp - lastTime) / 1000, 0.025)
      : 0;

    lastTime = timestamp;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  document.addEventListener("keydown", event => {
    const key = event.key.length === 1
      ? event.key.toLowerCase()
      : event.key;

    keys[key] = true;

    if (["ArrowLeft", "ArrowRight", "ArrowUp", " "].includes(event.key)) {
      event.preventDefault();
    }

    if (event.repeat) return;

    if (key === " " || key === "ArrowUp" || key === "w") {
      jump(player);
    }

    if (key === "x" || key === "Enter") {
      hitBall(player, "player");
    }
  });

  document.addEventListener("keyup", event => {
    const key = event.key.length === 1
      ? event.key.toLowerCase()
      : event.key;

    keys[key] = false;
  });

  window.addEventListener("blur", () => {
    Object.keys(keys).forEach(key => {
      keys[key] = false;
    });

    touch.left = false;
    touch.right = false;
  });

  document.querySelectorAll("[data-control]").forEach(button => {
    const control = button.dataset.control;

    if (control === "left" || control === "right") {
      const press = event => {
        event.preventDefault();
        touch[control] = true;
      };

      const release = event => {
        event.preventDefault();
        touch[control] = false;
      };

      button.addEventListener("pointerdown", press);
      button.addEventListener("pointerup", release);
      button.addEventListener("pointerleave", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("lostpointercapture", release);
    } else if (control === "jump") {
      button.addEventListener("pointerdown", event => {
        event.preventDefault();
        jump(player);
      });
    } else if (control === "hit") {
      button.addEventListener("pointerdown", event => {
        event.preventDefault();
        hitBall(player, "player");
      });
    }
  });

  if (startBtn) {
    startBtn.addEventListener("click", startGame);
  }

  window.addEventListener("resize", () => {
    updateCourt();

    player.x = clamp(player.x, court.playerMin, court.netX - 25);
    cpu.x = clamp(cpu.x, court.netX + 25, court.cpuMax);

    player.y = Math.min(player.y, court.floorY - player.h);
    cpu.y = Math.min(cpu.y, court.floorY - cpu.h);

    if (!ball.active) resetBall();
  });

  updateScoreboard();
  resetPlayers();
  resetBall();
  render();
  requestAnimationFrame(loop);
})();

/*
  完整 p5.js 測驗系統 + 動態星空背景
  - 即時隨機產生 4 題單選題（generateQuestion / generateQuiz）
  - 功能：開始/再玩一次、右上分數、左上倒數(15s+進度條)、中上題號、
    答對粒子、答錯紅閃+抖動、逾時自動換題、星空與流星、游標可見
  - 每題答對 +25 分
  - 畫面內容（題目 + 按鈕）已置中：題目 y = height * 0.25，按鈕水平以 width/2 為中心
*/

const POINTS_PER_CORRECT = 25;
const NEXT_DELAY = 800;

let state = 'start';
let questions = []; // 內部格式：{ q, options, answer }
let current = 0;
let score = 0;
let allowInput = true;

let particles = [];
let greenFlash = 0;
let redFlash = 0;
let shakeAmt = 0;

// 計時器相關
let timerDuration = 15000; // 15 秒 (毫秒)
let questionStart = 0; // millis() 當題開始時間
let timeLeft = timerDuration;

// 游標與首幀旗標
let firstFrame = true;

// 星空相關
let starsNear = [];
let starsFar = [];
let shootingStar = null;
let nextShootingAt = 0;
let baseStarCount = 180; // 依視窗調整
const SHOOTING_MIN_INTERVAL = 6000; // ms
const SHOOTING_MAX_INTERVAL = 12000;

function setup() {
  createCanvas(windowWidth, windowHeight);
  textFont('Arial');
  initQuestions();   // 會用 generateQuiz(4)
  initStars();
  scheduleNextShooting();
  cursor('default');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  initStars();
  cursor('default');
}

/* -----------------------
   問題產生器（即時隨機）
   ----------------------- */

function randInt(min, max) {
  return Math.floor(random(min, max + 1));
}

function generateQuestion() {
  let type = randInt(1, 8);
  let questionText = '';
  let correct = 0;

  if (type === 1) {
    let a = randInt(0, 20);
    let b = randInt(0, 20);
    correct = a + b;
    questionText = `${a} + ${b} = ?`;
  } else if (type === 2) {
    let a = randInt(0, 20);
    let b = randInt(0, a);
    correct = a - b;
    questionText = `${a} - ${b} = ?`;
  } else if (type === 3) {
    let a = randInt(0, 10);
    let b = randInt(0, 10);
    correct = a * b;
    questionText = `${a} × ${b} = ?`;
  } else if (type === 4) {
    let attempts = 0;
    let dividend = 1, divisor = 1;
    while (attempts < 200) {
      divisor = randInt(1, 10);
      let quotient = randInt(1, 10);
      dividend = divisor * quotient;
      if (dividend >= 1 && divisor >= 1 && quotient !== 0) {
        correct = quotient;
        questionText = `${dividend} ÷ ${divisor} = ?`;
        break;
      }
      attempts++;
    }
    if (questionText === '') {
      let b = randInt(1, 10);
      let q = randInt(1, 10);
      let a = b * q;
      correct = q;
      questionText = `${a} ÷ ${b} = ?`;
    }
  } else if (type === 5) {
    let a = randInt(0, 20);
    let b = randInt(0, 20);
    while (b === a) b = randInt(0, 20);
    if (random() < 0.5) {
      questionText = `${a} 與 ${b}，哪個比較大？`;
      correct = max(a, b);
    } else {
      questionText = `${a} 與 ${b}，哪個比較小？`;
      correct = min(a, b);
    }
  } else if (type === 6) {
    let b = randInt(0, 20);
    let ans = randInt(0, 20);
    let c = ans + b;
    correct = ans;
    questionText = `__ + ${b} = ${c}，空格處為何？`;
  } else if (type === 7) {
    let a = randInt(0, 20);
    let c = randInt(0, a);
    correct = a - c;
    questionText = `${a} - __ = ${c}，空格處為何？`;
  } else {
    let t = randInt(1, 2);
    if (t === 1) {
      let a = randInt(0, 10);
      let b = randInt(0, 10 - a);
      correct = a + b;
      questionText = `${a} + ${b} = ?`;
    } else {
      let a = randInt(0, 10);
      let b = randInt(0, a);
      correct = a - b;
      questionText = `${a} - ${b} = ?`;
    }
  }

  let optionsSet = new Set();
  optionsSet.add(correct);

  let tries = 0;
  while (optionsSet.size < 4 && tries < 200) {
    let delta = randInt(1, 5) * (random() < 0.5 ? -1 : 1);
    let candidate = correct + delta;
    if (!Number.isInteger(candidate)) { tries++; continue; }
    if (candidate < 0) { tries++; continue; }
    optionsSet.add(candidate);
    tries++;
  }
  while (optionsSet.size < 4) {
    let candidate = max(0, correct + randInt(1, 6) * (random() < 0.5 ? -1 : 1));
    optionsSet.add(candidate);
  }

  let opts = Array.from(optionsSet);
  shuffle(opts, true);
  opts = opts.slice(0, 4);
  if (!opts.includes(correct)) {
    opts[randInt(0, 3)] = correct;
  }
  let answerIndex = opts.indexOf(correct);
  let optionsStr = opts.map(x => '' + x);

  return {
    question: questionText,
    options: optionsStr,
    answerIndex: answerIndex
  };
}

function generateQuiz(n = 4) {
  let out = [];
  let texts = new Set();
  let attempts = 0;
  while (out.length < n && attempts < 400) {
    let q = generateQuestion();
    let key = q.question + '|' + q.options.join(',');
    if (!texts.has(key)) {
      texts.add(key);
      out.push(q);
    }
    attempts++;
  }
  while (out.length < n) {
    let q = generateQuestion();
    out.push(q);
  }
  return out;
}

/* -----------------------
   將 generateQuiz 整合到系統題庫初始化
   ----------------------- */
function initQuestions() {
  let gen = generateQuiz(4);
  questions = gen.map(item => {
    return { q: item.question, options: item.options, answer: item.answerIndex };
  });

  current = 0;
  score = 0;
  allowInput = true;
  particles = [];
  greenFlash = 0;
  redFlash = 0;
  shakeAmt = 0;
  questionStart = millis();
  timeLeft = timerDuration;
}

/* -----------------------
   主繪製流程（UI / 星河 / 特效）
   ----------------------- */
function draw() {
  if (firstFrame) {
    cursor('default');
    firstFrame = false;
  }

  drawBackgroundGradient();
  updateAndDrawStars();
  updateShootingStar();

  push();
  noStroke();
  fill(0, 80);
  rect(0, 0, width, height);
  pop();

  if (shakeAmt > 0) {
    translate(random(-shakeAmt, shakeAmt), random(-shakeAmt, shakeAmt));
    shakeAmt *= 0.9;
    if (shakeAmt < 0.5) shakeAmt = 0;
  }

  if (state === 'start') {
    drawStart();
  } else if (state === 'quiz') {
    updateTimer();
    drawQuiz();
    drawTimerTopLeft();
    drawProgressTopCenter();
  } else if (state === 'end') {
    drawEnd();
  }

  updateParticles();
  drawScoreTopRight();

  if (greenFlash > 0) {
    push();
    noStroke();
    fill(0, 255, 120, greenFlash);
    rect(0, 0, width, height);
    pop();
    greenFlash -= 8;
  }
  if (redFlash > 0) {
    push();
    noStroke();
    fill(255, 60, 60, redFlash);
    rect(0, 0, width, height);
    pop();
    redFlash -= 10;
  }

  cursor('default');
}

/* -----------------------
   星空：初始化、更新、流星
   ----------------------- */
function initStars() {
  starsNear = [];
  starsFar = [];
  let factor = (width < 768) ? 0.7 : 1.0;
  let total = Math.floor(baseStarCount * factor);
  let nearCount = Math.floor(total * 0.45);
  let farCount = total - nearCount;

  for (let i = 0; i < nearCount; i++) starsNear.push(createStar(true));
  for (let i = 0; i < farCount; i++) starsFar.push(createStar(false));
}

function createStar(isNear) {
  let size = isNear ? random(1.0, 2.2) : random(0.5, 1.2);
  let baseAlpha = isNear ? random(160, 255) : random(100, 200);
  return {
    x: random(width),
    y: random(height),
    size: size,
    baseAlpha: baseAlpha,
    twinkleT: random(TWO_PI),
    twinkleSpeed: random(0.3, 1.5),
    driftX: random(-0.03, 0.03) * (isNear ? 1.6 : 0.8),
    driftY: random(-0.02, 0.02) * (isNear ? 1.6 : 0.8),
    isNear: isNear
  };
}

function updateAndDrawStars() {
  noStroke();
  for (let s of starsFar) {
    s.twinkleT += s.twinkleSpeed * 0.02;
    let alpha = s.baseAlpha * (0.75 + 0.25 * sin(s.twinkleT));
    s.x += s.driftX;
    s.y += s.driftY;
    wrapStar(s);
    fill(220, 232, 255, alpha * 0.7);
    ellipse(s.x, s.y, s.size);
  }
  for (let s of starsNear) {
    s.twinkleT += s.twinkleSpeed * 0.03;
    let alpha = s.baseAlpha * (0.75 + 0.25 * sin(s.twinkleT));
    s.x += s.driftX * 1.2;
    s.y += s.driftY * 1.2;
    wrapStar(s);
    fill(240, 245, 255, alpha);
    ellipse(s.x, s.y, s.size);
  }
}

function wrapStar(s) {
  if (s.x < -10) s.x = width + 10;
  if (s.x > width + 10) s.x = -10;
  if (s.y < -10) s.y = height + 10;
  if (s.y > height + 10) s.y = -10;
}

function scheduleNextShooting() {
  nextShootingAt = millis() + random(SHOOTING_MIN_INTERVAL, SHOOTING_MAX_INTERVAL);
}

function updateShootingStar() {
  if (!shootingStar && millis() > nextShootingAt) {
    spawnShootingStar();
    scheduleNextShooting();
  }
  if (shootingStar) {
    shootingStar.x += shootingStar.vx;
    shootingStar.y += shootingStar.vy;
    shootingStar.life--;
    let lifeFrac = shootingStar.life / shootingStar.maxLife;
    for (let t = 0; t < 6; t++) {
      let pct = t / 6;
      let tx = shootingStar.x - shootingStar.vx * pct * 6;
      let ty = shootingStar.y - shootingStar.vy * pct * 6;
      let a = 200 * lifeFrac * (1 - pct);
      stroke(220, 235, 255, a);
      strokeWeight(2 - pct * 1.6);
      line(tx, ty, tx - shootingStar.vx * 2, ty - shootingStar.vy * 2);
    }
    noStroke();
    fill(255, 250, 230, 220 * lifeFrac);
    ellipse(shootingStar.x, shootingStar.y, 3.5);

    if (shootingStar.life <= 0 ||
        shootingStar.x < -200 || shootingStar.x > width + 200 ||
        shootingStar.y < -200 || shootingStar.y > height + 200) {
      shootingStar = null;
    }
  }
}

function spawnShootingStar() {
  let startX = random(-width * 0.2, width * 1.2);
  let startY = random(-height * 0.15, height * 0.25);
  let angle = random(PI * 0.15, PI * 0.35);
  if (random() < 0.5) angle = -angle;
  let speed = random(12, 20);
  let vx = cos(angle) * speed;
  let vy = sin(angle) * speed;
  let len = random(80, 160);
  let duration = Math.ceil((len / speed) * 3) + 30;
  shootingStar = { x: startX, y: startY, vx: vx, vy: vy, length: len, life: duration, maxLife: duration };
}

/* -----------------------
   UI：Start / Quiz / End（置中調整）
   ----------------------- */

function drawStart() {
  push();
  textAlign(CENTER, CENTER);
  textSize(min(48, width * 0.06));
  drawTextShadow('p5.js 互動測驗', width / 2, height / 2 - 80, min(48, width * 0.06));
  textSize(min(20, width * 0.02));
  drawTextShadow('按下開始測驗開始答題，共 4 題。', width / 2, height / 2 - 30, min(20, width * 0.02));

  let bw = min(260, width * 0.4);
  let bh = 64;
  let bx = width / 2 - bw / 2;
  let by = height / 2 + 10;
  drawButton(bx, by, bw, bh, '開始測驗');
  pop();
}

function drawQuiz() {
  if (!questions || questions.length === 0) return;
  let qobj = questions[current];

  push();
  fill(255);
  textSize(min(26, width * 0.03));
  textAlign(CENTER, CENTER);
  // 題目置中，y 在畫布上方四分之一位置
  drawTextShadow(qobj.q, width / 2, height * 0.25, min(26, width * 0.03));

  // 選項樣式：按鈕水平置中
  let ow = min(width * 0.84, 800);
  // 限制最小寬度
  ow = max(280, ow);
  let ox = width / 2 - ow / 2;
  let oh = min(72, height * 0.105);
  let gap = min(18, height * 0.03);
  // 選項區域起始 Y（置於題目下方）
  let startY = height * 0.35;

  for (let i = 0; i < qobj.options.length; i++) {
    let oy = startY + i * (oh + gap);
    let hover = mouseX > ox && mouseX < ox + ow && mouseY > oy && mouseY < oy + oh;

    push();
    let ctx = drawingContext;
    ctx.shadowBlur = 16;
    ctx.shadowColor = 'rgba(0,0,0,0.45)';

    noStroke();
    if (!allowInput) fill(60);
    else if (hover) fill(90);
    else fill(56);
    rect(ox, oy, ow, oh, 12);

    noStroke();
    fill(255, 18);
    rect(ox + 8, oy + 6, ow - 16, 12, 8);

    noFill();
    stroke(200);
    strokeWeight(1.2);
    rect(ox, oy, ow, oh, 12);

    ctx.shadowBlur = 0;
    pop();

    push();
    noStroke();
    fill(255);
    textAlign(LEFT, CENTER);
    textSize(min(18, width * 0.02));
    drawTextShadow(`${String.fromCharCode(65 + i)}.  ${qobj.options[i]}`, ox + 20, oy + oh / 2, min(18, width * 0.02), true);
    pop();
  }

  pop();
}

function drawEnd() {
  push();
  textAlign(CENTER, CENTER);
  textSize(min(34, width * 0.05));
  let totalPossible = questions.length * POINTS_PER_CORRECT;
  let pct = totalPossible > 0 ? round(100 * score / totalPossible) : 0;
  drawTextShadow(`你的分數：${score} / ${totalPossible} (${pct}%)`, width / 2, height / 2 - 40, min(34, width * 0.05));

  textSize(min(18, width * 0.02));
  drawTextShadow('感謝參與！', width / 2, height / 2 - 10, min(18, width * 0.02));

  let bw = min(260, width * 0.4);
  let bh = 64;
  let bx = width / 2 - bw / 2;
  let by = height / 2 + 20;
  drawButton(bx, by, bw, bh, '重新開始');
  pop();
}

function drawButton(x, y, w, h, label) {
  let hover = mouseX > x && mouseX < x + w && mouseY > y && mouseY < y + h;
  push();
  let ctx = drawingContext;
  ctx.shadowBlur = 20;
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  noStroke();
  fill(hover ? 100 : 78);
  rect(x, y, w, h, 12);

  noStroke();
  fill(255, 18);
  rect(x + 8, y + 6, w - 16, 12, 8);

  noFill();
  stroke(210);
  strokeWeight(1.2);
  rect(x, y, w, h, 12);
  ctx.shadowBlur = 0;

  noStroke();
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(min(20, w * 0.08));
  drawTextShadow(label, x + w / 2, y + h / 2, min(20, w * 0.08), true);
  pop();
}

/* -----------------------
   頂部三區塊：Time | Progress | Score
   ----------------------- */

function drawScoreTopRight() {
  push();
  noStroke();
  fill(255);
  textAlign(RIGHT, TOP);
  textSize(16);
  let total = questions.length * POINTS_PER_CORRECT;
  drawTextShadow(`Score: ${score} / ${total}`, width - 24, 24, 16, true);
  pop();
}

function drawTimerTopLeft() {
  push();
  fill(255);
  textAlign(LEFT, TOP);
  textSize(16);
  let sec = max(0, ceil(timeLeft / 1000));
  drawTextShadow(`${sec}s`, 24, 24, 16, true);

  let barX = 24;
  let barY = 24 + 20;
  let barW = min(width * 0.35, 300);
  let barH = 8;
  noStroke();
  fill(60);
  rect(barX, barY, barW, barH, 6);

  let frac = constrain(timeLeft / timerDuration, 0, 1);
  let urgent = timeLeft <= 5000;
  let flashAlpha = urgent ? 150 + 105 * sin(millis() / 120) : 255;
  if (urgent) fill(255, 80, 80, flashAlpha);
  else fill(80, 200, 255);
  rect(barX, barY, barW * frac, barH, 6);
  pop();
}

function drawProgressTopCenter() {
  push();
  fill(255);
  textAlign(CENTER, TOP);
  textSize(16);
  drawTextShadow(`第 ${current + 1} / ${questions.length} 題`, width / 2, 24, 16, true);
  pop();
}

/* -----------------------
   互動：滑鼠/計時/計分（點擊偵測已調整為按鈕以 width/2 為中心）
   ----------------------- */

function mousePressed() {
  if (state === 'start') {
    let bw = min(260, width * 0.4);
    let bh = 64;
    let bx = width / 2 - bw / 2;
    let by = height / 2 + 10;
    if (mouseX > bx && mouseX < bx + bw && mouseY > by && mouseY < by + bh) {
      try { fullscreen(true); } catch (e) {}
      setTimeout(() => cursor('default'), 80);

      initQuestions();
      state = 'quiz';
      cursor('default');
    }
  } else if (state === 'quiz' && allowInput) {
    let ow = min(width * 0.84, 800);
    ow = max(280, ow);
    let ox = width / 2 - ow / 2;
    let oh = min(72, height * 0.105);
    let gap = min(18, height * 0.03);
    let startY = height * 0.35;
    for (let i = 0; i < 4; i++) {
      let oy = startY + i * (oh + gap);
      if (mouseX > ox && mouseX < ox + ow && mouseY > oy && mouseY < oy + oh) {
        // 不在這裡預先凍結 allowInput，改由 handleAnswer 處理
        handleAnswer(i, ox + ow / 2, oy + oh / 2);
        break;
      }
    }
  } else if (state === 'end') {
    let bw = min(260, width * 0.4);
    let bh = 64;
    let bx = width / 2 - bw / 2;
    let by = height / 2 + 20;
    if (mouseX > bx && mouseX < bx + bw && mouseY > by && mouseY < by + bh) {
      initQuestions();
      state = 'start';
      cursor('default');
    }
  }
}

function handleAnswer(choice, px, py) {
  if (!allowInput) return;
  allowInput = false;
  let correct = (choice === questions[current].answer);
  if (correct) {
    score += POINTS_PER_CORRECT;
    greenFlash = 200;
    spawnParticles(px, py, color(80, 255, 140));
    setTimeout(nextQuestion, NEXT_DELAY);
  } else {
    redFlash = 200;
    shakeAmt = 14;
    spawnParticles(px, py, color(255, 80, 80));
    setTimeout(nextQuestion, NEXT_DELAY - 100);
  }
  cursor('default');
}

function updateTimer() {
  if (state !== 'quiz') return;
  if (allowInput) {
    let elapsed = millis() - questionStart;
    timeLeft = timerDuration - elapsed;
    if (timeLeft <= 0) {
      timeLeft = 0;
      timeUp();
    }
  }
}

function timeUp() {
  if (!allowInput) return;
  allowInput = false;
  redFlash = 200;
  shakeAmt = 14;
  let px = width / 2;
  let py = height / 2;
  spawnParticles(px, py, color(255, 80, 80));
  cursor('default');
  setTimeout(nextQuestion, NEXT_DELAY - 100);
}

function nextQuestion() {
  current++;
  if (current >= questions.length) {
    state = 'end';
    allowInput = true;
    cursor('default');
  } else {
    allowInput = true;
    questionStart = millis();
    timeLeft = timerDuration;
    cursor('default');
  }
}

/* -----------------------
   粒子系統（答對 / 答錯 特效）
   ----------------------- */
function spawnParticles(x, y, c) {
  for (let i = 0; i < 24; i++) {
    particles.push({
      x: x + random(-20, 20),
      y: y + random(-20, 20),
      vx: random(-4, 4),
      vy: random(-5, -1),
      life: random(40, 90),
      col: c
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.12;
    p.life--;
    push();
    noStroke();
    let alpha = map(p.life, 0, 90, 0, 255);
    fill(red(p.col), green(p.col), blue(p.col), alpha);
    ellipse(p.x, p.y, 6);
    pop();
    if (p.life <= 0) particles.splice(i, 1);
  }
}

/* -----------------------
   背景漸層工具與文字陰影
   ----------------------- */
function drawBackgroundGradient() {
  let ctx = drawingContext;
  let grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#0b1023');
  grad.addColorStop(1, '#1a2346');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

function drawTextShadow(txt, x, y, size, drawOnTop = false) {
  let lines = ('' + txt).split('\n');
  textSize(size);
  for (let i = 0; i < lines.length; i++) {
    let ly = y + i * (size * 1.05);
    push();
    fill(0, 180);
    noStroke();
    text(lines[i], x + 1, ly + 1);
    pop();
    push();
    fill(255);
    noStroke();
    text(lines[i], x, ly);
    pop();
  }
}
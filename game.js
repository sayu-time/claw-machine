// ===================== 인형뽑기 (PC 화면) =====================
(() => {
'use strict';

// ---------- 상품 설정 ----------
const DEFAULT_PRIZES = [
  { name: '곰돌이', emoji: '🧸', img: '', count: 4, rate: 35 },
  { name: '토끼', emoji: '🐰', img: '', count: 4, rate: 35 },
  { name: '고양이', emoji: '🐱', img: '', count: 3, rate: 30 },
  { name: '펭귄', emoji: '🐧', img: '', count: 3, rate: 30 },
  { name: '유니콘', emoji: '🦄', img: '', count: 1, rate: 12 },
];
const STORE_KEY = 'claw.prizes.v1';
const HIST_KEY = 'claw.history.v1';

function loadPrizes() {
  try {
    const p = JSON.parse(localStorage.getItem(STORE_KEY));
    if (Array.isArray(p) && p.length) return p;
  } catch {}
  return structuredClone(DEFAULT_PRIZES);
}
function savePrizes(p) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); }
  catch { alert('저장 공간이 부족해요. 사진 수를 줄여주세요.'); }
}
let prizes = loadPrizes();
let history = [];
try { history = JSON.parse(localStorage.getItem(HIST_KEY)) || []; } catch {}

// 이미지 캐시
const imgCache = new Map();
function getImg(src) {
  if (!src) return null;
  if (!imgCache.has(src)) { const im = new Image(); im.src = src; imgCache.set(src, im); }
  const im = imgCache.get(src);
  return im.complete && im.naturalWidth ? im : null;
}

// ---------- 캔버스 / 기계 치수 ----------
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const W = 560, H = 760;
const RAIL_Y = 70;           // 집게 레일 높이
const FLOOR = H - 36;        // 바닥
const CHUTE_W = 130;         // 출구 폭 (왼쪽)
const WALL_TOP = H - 230;    // 출구 칸막이 높이
const R = 34;                // 인형 반지름
const REST_TIP = 150;        // 집게 대기 위치(끝 y)
const CLAW_MIN_X = CHUTE_W / 2, CLAW_MAX_X = W - 40;
const PLAY_TIME = 30;        // 한 판 제한시간(초)

// ---------- 인형(물리) ----------
let dolls = [];
let uid = 0;
const palette = ['#ff9ec7', '#9fd8ff', '#ffe08a', '#b9f5c9', '#d7b8ff', '#ffc29e'];

function prizeOnBoard(i) { return dolls.filter(d => d.pi === i && !d.gone).length; }

function spawnDoll(pi, x, y) {
  dolls.push({
    id: ++uid, pi, x, y, vx: (Math.random() - .5) * 60, vy: 0,
    rot: (Math.random() - .5) * .6, color: palette[pi % palette.length],
    held: false, gone: false, won: false, fade: 1,
  });
}

function refill() {
  dolls = [];
  const MAX_ON_BOARD = 22;
  const order = [];
  prizes.forEach((p, i) => { for (let k = 0; k < Math.min(p.count, 6); k++) order.push(i); });
  order.sort(() => Math.random() - .5);
  order.slice(0, MAX_ON_BOARD).forEach((pi, n) => {
    const x = CHUTE_W + R + 10 + Math.random() * (W - CHUTE_W - 2 * R - 20);
    spawnDoll(pi, x, WALL_TOP - 80 - n * 40);
  });
}

// 수량이 남은 상품은 위에서 다시 떨어뜨려 보충
function topUp(pi) {
  const p = prizes[pi];
  if (!p) return;
  if (p.count > prizeOnBoard(pi)) {
    const x = CHUTE_W + R + 20 + Math.random() * (W - CHUTE_W - 2 * R - 40);
    setTimeout(() => spawnDoll(pi, x, RAIL_Y + 40), 900);
  }
}

function physics(dt) {
  const G = 1700;
  const live = dolls.filter(d => !d.gone);
  for (const d of live) {
    if (d.held) continue;
    d.vy += G * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    // 바닥
    if (d.y > FLOOR - R) { d.y = FLOOR - R; d.vy *= -0.15; d.vx *= 0.92; }
    // 좌우 벽
    if (d.x < R) { d.x = R; d.vx = Math.abs(d.vx) * .3; }
    if (d.x > W - R) { d.x = W - R; d.vx = -Math.abs(d.vx) * .3; }
    // 출구 칸막이 (x = CHUTE_W, WALL_TOP ~ FLOOR)
    if (d.y + R * .3 > WALL_TOP) {
      if (d.x >= CHUTE_W && d.x < CHUTE_W + R) { d.x = CHUTE_W + R; d.vx = Math.abs(d.vx) * .3; }
      if (d.x < CHUTE_W && d.x > CHUTE_W - R) { d.x = CHUTE_W - R; d.vx = -Math.abs(d.vx) * .3; }
    }
    // 칸막이 꼭대기 모서리
    const ex = d.x - CHUTE_W, ey = d.y - WALL_TOP, el = Math.hypot(ex, ey);
    if (el < R && el > 0.01) {
      const push = R - el; d.x += ex / el * push; d.y += ey / el * push;
      const vn = d.vx * ex / el + d.vy * ey / el;
      if (vn < 0) { d.vx -= vn * ex / el * 1.2; d.vy -= vn * ey / el * 1.2; }
    }
    d.rot += d.vx * dt * 0.01;
    d.rot *= 0.995;
  }
  // 인형끼리 충돌
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy), min = R * 2 - 2;
        if (dist < min && dist > 0.001) {
          const nx = dx / dist, ny = dy / dist, ov = (min - dist);
          const wa = a.held ? 0 : (b.held ? 1 : .5), wb = 1 - wa;
          a.x -= nx * ov * wa; a.y -= ny * ov * wa;
          b.x += nx * ov * wb; b.y += ny * ov * wb;
          const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rv < 0) {
            const imp = -rv * 0.6;
            if (!a.held) { a.vx -= nx * imp * wa * 2; a.vy -= ny * imp * wa * 2; }
            if (!b.held) { b.vx += nx * imp * wb * 2; b.vy += ny * imp * wb * 2; }
          }
        }
      }
    }
  }
  // 출구에 들어간 인형 → 당첨
  for (const d of live) {
    if (!d.won && !d.held && d.x < CHUTE_W - 5 && d.y > WALL_TOP + R) {
      d.won = true;
      onWin(d);
    }
    if (d.won) { d.fade -= dt * 1.5; if (d.fade <= 0) d.gone = true; }
  }
}

// ---------- 집게 ----------
const claw = {
  x: CLAW_MIN_X, tip: REST_TIP, open: 1,   // open: 1=벌림, 0=닫힘
  phase: 'idle',  // idle | drop | close | rise | carry | release | home
  dir: 0, t: 0, held: null, willSlip: false, slipAt: 0,
};
let timer = PLAY_TIME, playing = false;
const keys = { left: false, right: false };
let message = '';
let messageT = 0;

function say(m, sec = 2) { message = m; messageT = sec; }

function startDrop() {
  if (claw.phase !== 'idle') return;
  claw.phase = 'drop';
  playing = false;
  sound('drop');
  broadcastState();
}

function clawTipHit() {
  // 집게 끝이 인형 윗부분에 닿았는지
  for (const d of dolls) {
    if (d.gone || d.won) continue;
    if (Math.abs(d.x - claw.x) < R * 0.8 && claw.tip > d.y - R * 0.55) return true;
  }
  return claw.tip >= FLOOR - 14;
}

function tryGrab() {
  let best = null, bestD = 1e9;
  for (const d of dolls) {
    if (d.gone || d.won) continue;
    const dx = Math.abs(d.x - claw.x), dy = d.y - claw.tip;
    if (dx < R * 0.95 && dy > -R * 0.9 && dy < R * 1.5) {
      const s = dx + Math.abs(dy) * .5;
      if (s < bestD) { bestD = s; best = d; }
    }
  }
  if (!best) return null;
  const p = prizes[best.pi];
  // 중앙에 가까울수록 보너스
  const centerBonus = 1 - Math.min(1, Math.abs(best.x - claw.x) / R) * 0.5;
  const chance = (p ? p.rate : 30) / 100 * (0.6 + 0.4 * centerBonus);
  claw.willSlip = Math.random() > chance;
  claw.slipAt = 0.2 + Math.random() * 0.7;  // 들어올리는 도중 어디서 놓칠지
  best.held = true; best.vx = 0; best.vy = 0;
  return best;
}

function dropHeld(spin = true) {
  const d = claw.held;
  if (!d) return;
  d.held = false; d.vy = 40; d.vx = spin ? (Math.random() - .5) * 160 : 0;
  claw.held = null;
}

function updateClaw(dt) {
  const SPEED = 230;
  switch (claw.phase) {
    case 'idle': {
      const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      if (dir) {
        if (!playing) { playing = true; timer = PLAY_TIME; }
        claw.x = Math.max(CLAW_MIN_X, Math.min(CLAW_MAX_X, claw.x + dir * SPEED * dt));
      }
      if (playing) {
        timer -= dt;
        if (timer <= 0) { timer = 0; startDrop(); }
      }
      break;
    }
    case 'drop':
      claw.tip += 260 * dt;
      if (clawTipHit()) { claw.phase = 'close'; claw.t = 0; }
      break;
    case 'close':
      claw.t += dt;
      claw.open = Math.max(0, 1 - claw.t / 0.45);
      if (claw.t > 0.55) {
        claw.held = tryGrab();
        claw.slipped = false;
        claw.phase = 'rise'; claw.t = 0;
        claw.riseFrom = claw.tip;
        broadcastState();
      }
      break;
    case 'rise': {
      claw.tip -= 170 * dt;
      const prog = (claw.riseFrom - claw.tip) / Math.max(1, claw.riseFrom - REST_TIP);
      if (claw.held && claw.willSlip && prog > claw.slipAt) {
        dropHeld();
        claw.slipped = true;
        claw.open = 0.5;
        say('아깝다! 😭');
        sendCtl({ type: 'result', ok: false, text: '아깝다! 놓쳤어요 😭' });
      }
      if (claw.tip <= REST_TIP) {
        claw.tip = REST_TIP;
        claw.phase = 'carry';
        if (!claw.held && !claw.slipped) {
          say('빈손이에요 😅');
          sendCtl({ type: 'result', ok: false, text: '아무것도 못 잡았어요 😅' });
        }
      }
      break;
    }
    case 'carry':
      claw.x -= SPEED * dt;
      if (claw.x <= CLAW_MIN_X) { claw.x = CLAW_MIN_X; claw.phase = 'release'; claw.t = 0; }
      break;
    case 'release':
      claw.t += dt;
      claw.open = Math.min(1, claw.t / 0.35);
      if (claw.t > 0.1 && claw.held) dropHeld(false);
      if (claw.t > 0.8) { claw.phase = 'idle'; claw.open = 1; timer = PLAY_TIME; playing = false; broadcastState(); }
      break;
  }
  // 잡은 인형은 집게를 따라감
  if (claw.held) {
    claw.held.x = claw.x;
    claw.held.y = claw.tip + R * 0.55;
  }
}

// ---------- 당첨 ----------
const winEl = document.getElementById('win');
function onWin(d) {
  const p = prizes[d.pi];
  if (!p) return;
  p.count = Math.max(0, p.count - 1);
  savePrizes(prizes);
  history.unshift({ name: p.name, emoji: p.emoji, at: Date.now() });
  history = history.slice(0, 50);
  try { localStorage.setItem(HIST_KEY, JSON.stringify(history)); } catch {}
  renderHistory();
  topUp(d.pi);

  document.getElementById('winIcon').innerHTML = p.img ? `<img src="${p.img}">` : (p.emoji || '🎁');
  document.getElementById('winName').textContent = p.name;
  winEl.classList.add('show');
  setTimeout(() => winEl.classList.remove('show'), 3200);
  sound('win');
  sendCtl({ type: 'result', ok: true, text: `${p.name} 당첨! 🎉`, emoji: p.emoji, img: p.img && p.img.length < 150000 ? p.img : '' });
}
winEl.addEventListener('click', () => winEl.classList.remove('show'));

function renderHistory() {
  const ol = document.getElementById('historyList');
  ol.innerHTML = history.length ? '' : '<span class="sub">아직 없어요</span>';
  for (const h of history) {
    const li = document.createElement('li');
    const t = new Date(h.at);
    li.textContent = `${h.emoji || '🎁'} ${h.name}  ·  ${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`;
    ol.appendChild(li);
  }
}

// ---------- 그리기 ----------
function roundRect(x, y, w, h, r) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
}

function drawDoll(d) {
  const p = prizes[d.pi] || { emoji: '🎁' };
  ctx.save();
  ctx.globalAlpha = Math.max(0, d.fade);
  ctx.translate(d.x, d.y);
  ctx.rotate(d.rot);
  const im = getImg(p.img);
  if (im) {
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.closePath();
    ctx.save(); ctx.clip();
    ctx.drawImage(im, -R, -R, R * 2, R * 2);
    ctx.restore();
    ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
  } else {
    // 몸통
    const g = ctx.createRadialGradient(-R * .3, -R * .4, 4, 0, 0, R);
    g.addColorStop(0, '#fff'); g.addColorStop(.35, d.color); g.addColorStop(1, shade(d.color));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    ctx.font = `${R * 1.35}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.emoji || '🎁', 0, 3);
  }
  ctx.restore();
}

function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.round(v * .7));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function drawClaw() {
  const x = claw.x, tip = claw.tip;
  // 레일 위 캐리지
  ctx.fillStyle = '#c9c9d6';
  roundRect(x - 26, RAIL_Y - 14, 52, 22, 6); ctx.fill();
  // 줄
  ctx.strokeStyle = '#e8e8f0'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x, RAIL_Y + 6); ctx.lineTo(x, tip - 44); ctx.stroke();
  // 헤드
  const hy = tip - 44;
  const g = ctx.createLinearGradient(x - 22, 0, x + 22, 0);
  g.addColorStop(0, '#9aa0b5'); g.addColorStop(.5, '#f4f5fb'); g.addColorStop(1, '#8a90a5');
  ctx.fillStyle = g;
  roundRect(x - 22, hy, 44, 24, 8); ctx.fill();
  ctx.fillStyle = '#ff5fa2';
  ctx.beginPath(); ctx.arc(x, hy + 12, 5, 0, Math.PI * 2); ctx.fill();
  // 집게발 3개
  const spread = 0.15 + claw.open * 0.65;
  ctx.strokeStyle = '#d4d7e3'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    const ax = x + s * 16, ay = hy + 22;
    const a = s * spread;
    const mx = ax + Math.sin(a) * 26, my = ay + Math.cos(a) * 26;
    const ex = mx - s * (12 - claw.open * 4), ey = my + 18;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(mx, my); ctx.lineTo(ex, ey); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(x, hy + 24); ctx.lineTo(x, hy + 40); ctx.stroke();
}

function drawMachine() {
  // 배경 (기계 안쪽)
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#5a2b8c'); bg.addColorStop(1, '#2b1450');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // 뒷벽 무늬
  ctx.globalAlpha = .08; ctx.fillStyle = '#fff';
  for (let y = 0; y < H; y += 40) for (let x = (y / 40) % 2 * 20; x < W; x += 40) {
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // 상단 간판
  ctx.fillStyle = '#ff5fa2'; ctx.fillRect(0, 0, W, 46);
  for (let i = 0; i < 14; i++) {
    const on = Math.floor(performance.now() / 250 + i) % 2;
    ctx.fillStyle = on ? '#ffd23f' : '#ffe9a6';
    ctx.beginPath(); ctx.arc(20 + i * 40, 23, 7, 0, Math.PI * 2); ctx.fill();
  }
  // 레일
  ctx.fillStyle = '#8c8fa3'; ctx.fillRect(0, RAIL_Y - 4, W, 8);
  // 바닥
  ctx.fillStyle = '#ffb8d6'; ctx.fillRect(CHUTE_W, FLOOR, W - CHUTE_W, H - FLOOR);
  // 출구
  ctx.fillStyle = '#1a0a33'; ctx.fillRect(0, WALL_TOP, CHUTE_W, H - WALL_TOP);
  const cg = ctx.createLinearGradient(0, WALL_TOP, 0, H);
  cg.addColorStop(0, 'rgba(255,210,63,.25)'); cg.addColorStop(1, 'rgba(255,210,63,0)');
  ctx.fillStyle = cg; ctx.fillRect(0, WALL_TOP, CHUTE_W, H - WALL_TOP);
  ctx.fillStyle = '#ffd23f'; ctx.font = '22px Jua, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('⬇ 출구', CHUTE_W / 2, H - 50);
}

function drawFront() {
  // 칸막이 (투명 아크릴)
  ctx.fillStyle = 'rgba(200,230,255,.35)';
  ctx.fillRect(CHUTE_W - 5, WALL_TOP, 10, FLOOR - WALL_TOP + 40);
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(CHUTE_W - 7, WALL_TOP - 4, 14, 8);
  // 유리 반사
  ctx.fillStyle = 'rgba(255,255,255,.06)';
  ctx.beginPath(); ctx.moveTo(W * .55, 46); ctx.lineTo(W * .75, 46); ctx.lineTo(W * .35, H); ctx.lineTo(W * .15, H); ctx.fill();

  // HUD
  ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.font = '26px Jua, sans-serif';
  ctx.fillStyle = timer < 6 && playing ? '#ff6b6b' : '#fff';
  if (claw.phase === 'idle') ctx.fillText(`⏱ ${Math.ceil(timer)}`, W - 16, 96);

  if (!ctlConnected && claw.phase === 'idle' && !playing) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,.45)'; roundRect(W / 2 - 170, 250, 340, 60, 20); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '24px Jua, sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText('📱 QR을 찍어서 시작하세요', W / 2, 280);
  }
  if (messageT > 0) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,.5)'; roundRect(W / 2 - 140, 330, 280, 64, 20); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.font = '32px Jua, sans-serif';
    ctx.fillText(message, W / 2, 362);
  }
}

function render() {
  drawMachine();
  dolls.filter(d => !d.gone && !d.held).forEach(drawDoll);
  drawClaw();
  dolls.filter(d => d.held).forEach(drawDoll);
  drawFront();
}

// ---------- 메인 루프 ----------
let last = performance.now();
let lastSent = 0;
function loop(now) {
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  const steps = 4;
  for (let i = 0; i < steps; i++) { physics(dt / steps); }
  updateClaw(dt);
  if (messageT > 0) messageT -= dt;
  render();
  if (now - lastSent > 500) { lastSent = now; broadcastState(); }
  requestAnimationFrame(loop);
}
// 화면 그리기가 멈춰도(탭 최소화 등) 폰이 PC를 놓치지 않도록 따로 신호 전송
setInterval(() => { if (performance.now() - lastSent > 900) { lastSent = performance.now(); broadcastState(); } }, 1000);

// ---------- 소리 ----------
let actx;
function sound(kind) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = kind === 'win' ? [523, 659, 784, 1047] : kind === 'drop' ? [440, 330] : [600];
    notes.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.06, actx.currentTime + i * .12);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + i * .12 + .15);
      o.connect(g); g.connect(actx.destination);
      o.start(actx.currentTime + i * .12); o.stop(actx.currentTime + i * .12 + .16);
    });
  } catch {}
}

// ---------- 키보드 (PC 테스트용) ----------
addEventListener('keydown', (e) => {
  if (document.querySelector('.modal.show')) return;
  if (e.key === 'ArrowLeft') keys.left = true;
  if (e.key === 'ArrowRight') keys.right = true;
  if (e.code === 'Space') { e.preventDefault(); startDrop(); }
});
addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft') keys.left = false;
  if (e.key === 'ArrowRight') keys.right = false;
});

// ---------- 네트워크 (인터넷 중계) ----------
let room = sessionStorage.getItem('claw.room');
if (!room) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  room = Array.from({ length: 8 }, () => A[Math.floor(Math.random() * A.length)]).join('');
  sessionStorage.setItem('claw.room', room);
}
let net, ctlConnected = false, ctlId = null, lastPing = 0;

function connect() {
  net = ClawNet.open(room, 'host', {
    onOpen: () => { setNet(true); broadcastState(); },
    onClose: () => setNet(false),
    onMessage: (m) => {
      if (!m || !m.id) return;
      if (m.type === 'join' || (m.type === 'ping' && !ctlId)) {
        if (ctlId && ctlId !== m.id) sendCtl({ type: 'kicked', id: ctlId });
        ctlId = m.id; lastPing = performance.now();
        sendCtl({ type: 'joined', id: m.id });
        if (!ctlConnected) sound('beep');
        setConnected(true); broadcastState();
        return;
      }
      if (m.id !== ctlId) return;
      lastPing = performance.now();
      if (!ctlConnected) setConnected(true);
      if (m.type === 'input' && (m.key === 'left' || m.key === 'right')) keys[m.key] = !!m.down;
      if (m.type === 'grab') startDrop();
    },
  });
  // 폰 신호가 7초 넘게 없으면 끊긴 것으로 처리
  setInterval(() => {
    if (ctlConnected && performance.now() - lastPing > 9000) { setConnected(false); ctlId = null; }
  }, 1000);
}
function sendCtl(m) { if (net) net.send(m); }
function broadcastState() {
  sendCtl({ type: 'state', phase: claw.phase, timer: Math.ceil(timer), playing });
}
function setNet(on) {
  if (!ctlConnected) document.getElementById('statusText').textContent = on ? '폰 연결 대기 중' : '중계 서버 연결 중…';
}
function setConnected(on) {
  ctlConnected = on;
  if (!on) { keys.left = keys.right = false; }
  document.getElementById('dot').classList.toggle('on', on);
  document.getElementById('statusText').textContent = on ? '📱 폰 연결됨!' : '폰 연결 대기 중';
}

// ---------- QR ----------
function setupQR() {
  const box = document.getElementById('qrBox');
  const base = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
  const link = `${base}controller.html?room=${room}`;
  document.getElementById('link').textContent = link;
  box.innerHTML = '';
  if (window.QRCode) {
    new QRCode(box, { text: link, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M });
  } else {
    box.textContent = 'QR을 만들지 못했어요. 아래 주소를 폰에 직접 입력하세요.';
  }
  if (/^(localhost|127\.|\[::1\])/.test(location.hostname)) {
    document.getElementById('link').textContent = link + '  ⚠ localhost 주소는 폰에서 열 수 없어요. 공개 주소에서 실행하세요.';
  }
}

// ---------- 상품 설정 UI ----------
const modal = document.getElementById('settings');
const listEl = document.getElementById('prizeList');
const filePick = document.getElementById('filePick');
let draft = [];
let pickFor = -1;

function openSettings() {
  draft = structuredClone(prizes);
  renderDraft();
  modal.classList.add('show');
}
function renderDraft() {
  listEl.innerHTML = '';
  draft.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div class="thumb" title="눌러서 사진 넣기">${p.img ? `<img src="${p.img}">` : (p.emoji || '🎁')}</div>
      <input data-k="name" value="${escapeHtml(p.name)}" placeholder="상품 이름" maxlength="20">
      <input data-k="emoji" value="${escapeHtml(p.emoji || '')}" placeholder="🎁" maxlength="4">
      <input data-k="count" type="number" min="0" max="99" value="${p.count}">
      <input data-k="rate" type="number" min="1" max="100" value="${p.rate}">
      <button class="del" title="삭제">✕</button>`;
    row.querySelector('.thumb').onclick = () => {
      if (p.img && confirm('사진을 지우고 이모지로 돌아갈까요?')) { p.img = ''; renderDraft(); return; }
      pickFor = i; filePick.value = ''; filePick.click();
    };
    row.querySelectorAll('input').forEach(inp => inp.oninput = () => {
      const k = inp.dataset.k;
      p[k] = (k === 'count' || k === 'rate') ? Math.max(k === 'rate' ? 1 : 0, Math.min(k === 'rate' ? 100 : 99, Number(inp.value) || 0)) : inp.value;
      if (k === 'emoji' && !p.img) row.querySelector('.thumb').textContent = p.emoji || '🎁';
    });
    row.querySelector('.del').onclick = () => { draft.splice(i, 1); renderDraft(); };
    listEl.appendChild(row);
  });
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

filePick.onchange = () => {
  const f = filePick.files[0];
  if (!f || pickFor < 0) return;
  const reader = new FileReader();
  reader.onload = () => {
    const im = new Image();
    im.onload = () => {
      // 128x128 정사각형으로 줄여서 저장
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const s = Math.min(im.width, im.height);
      c.getContext('2d').drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 128, 128);
      draft[pickFor].img = c.toDataURL('image/jpeg', 0.85);
      renderDraft();
    };
    im.src = reader.result;
  };
  reader.readAsDataURL(f);
};

document.getElementById('openSettings').onclick = openSettings;
document.getElementById('cancelSettings').onclick = () => modal.classList.remove('show');
document.getElementById('addPrize').onclick = () => {
  draft.push({ name: '새 상품', emoji: '🎁', img: '', count: 2, rate: 30 });
  renderDraft();
  listEl.scrollTop = listEl.scrollHeight;
};
document.getElementById('resetPrizes').onclick = () => {
  if (confirm('기본 상품으로 되돌릴까요?')) { draft = structuredClone(DEFAULT_PRIZES); renderDraft(); }
};
document.getElementById('saveSettings').onclick = () => {
  const clean = draft.filter(p => String(p.name).trim());
  if (!clean.length) { alert('상품을 하나 이상 넣어주세요.'); return; }
  prizes = clean.map(p => ({ ...p, name: String(p.name).trim() }));
  savePrizes(prizes);
  modal.classList.remove('show');
  resetClaw();
  refill();
};
document.getElementById('refill').onclick = () => { resetClaw(); refill(); };

function resetClaw() {
  claw.held = null; claw.phase = 'idle'; claw.tip = REST_TIP; claw.x = CLAW_MIN_X; claw.open = 1;
  playing = false; timer = PLAY_TIME;
}

// ---------- 시작 ----------
refill();
renderHistory();
setupQR();
connect();
requestAnimationFrame(loop);
// 테스트/디버그용
window.__claw = { claw, dolls: () => dolls, prizes: () => prizes, keys, startDrop };
})();

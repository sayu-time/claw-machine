// ===================== 럭키 캡슐 (PC 화면) =====================
// 2D 캡슐 뽑기. 집게는 좌우로만 움직이고, 버튼을 누르면 툭 떨어져 잡습니다.
// 뽑힌 캡슐은 3D로 화면 앞으로 날아와 열립니다.
(() => {
'use strict';

// ------------------------------------------------------------------
// 설정 / 저장
// ------------------------------------------------------------------
const DEFAULT_PRIZES = [
  { name: '곰돌이 키링', emoji: '🧸', img: '', count: 4 },
  { name: '토끼 인형', emoji: '🐰', img: '', count: 4 },
  { name: '스티커 세트', emoji: '⭐', img: '', count: 6 },
  { name: '음료 쿠폰', emoji: '🥤', img: '', count: 5 },
  { name: '1등 선물', emoji: '🎁', img: '', count: 1 },
];
const DEFAULT_OPTS = { blank: 24, diff: 0.55, playTime: 15, orient: 'auto' };
const PRIZE_KEY = 'capsule.prizes.v1', OPT_KEY = 'capsule.opts.v1', HIST_KEY = 'capsule.history.v1';
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

let prizes = load(PRIZE_KEY, null);
if (!Array.isArray(prizes) || !prizes.length) prizes = structuredClone(DEFAULT_PRIZES);
let opts = { ...DEFAULT_OPTS, ...load(OPT_KEY, {}) };
let history = load(HIST_KEY, []);

// 캡슐 윗뚜껑 색 (영상처럼 파스텔 + 은색 줄무늬)
const COLORS = [
  { c: '#b8ef4c', c2: '#e4ffb0', c3: '#7fb81c' },  // 라임
  { c: '#ffd447', c2: '#fff0b0', c3: '#d9a514' },  // 노랑
  { c: '#ff6cc2', c2: '#ffc0e6', c3: '#c93b8c' },  // 핑크
  { c: '#3d8bff', c2: '#a9cdff', c3: '#1e5ec7' },  // 파랑
  { c: '#f2e2c6', c2: '#fffaf0', c3: '#c9b38e' },  // 크림
  { c: '#9ef0d6', c2: '#e0fff5', c3: '#4fbf9c' },  // 민트
  { c: '#cdb0ff', c2: '#efe6ff', c3: '#8f6ad6' },  // 라벤더
  { c: '#c9ccd2', c2: '#f4f5f7', c3: '#8b9098', silver: true }, // 은색
];

// ------------------------------------------------------------------
// 캔버스 / 레이아웃
// ------------------------------------------------------------------
const stage = document.getElementById('stage');
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;
let L = {};          // 레이아웃 값
let bgCanvas = null; // 콘크리트 배경 캐시

function applyOrientation() {
  const vw = innerWidth, vh = innerHeight;
  let w = vw, h = vh;
  if (opts.orient === 'landscape') { const r = 16 / 9; if (vw / vh > r) { h = vh; w = vh * r; } else { w = vw; h = vw / r; } }
  if (opts.orient === 'portrait') { const r = 9 / 16; if (vw / vh > r) { h = vh; w = vh * r; } else { w = vw; h = vw / r; } }
  stage.style.width = Math.round(w) + 'px';
  stage.style.height = Math.round(h) + 'px';
  document.querySelectorAll('#orient button').forEach(b => b.classList.toggle('on', b.dataset.o === opts.orient));
  resize();
}

function resize() {
  const oldW = W, oldH = H, oldR = L.R;
  W = stage.clientWidth; H = stage.clientHeight;
  DPR = Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  const m = Math.min(W, H);
  L = {
    d: m * 0.075,                 // 옆벽 깊이
    lip: m * 0.11,                // 위쪽 벽(로고) 높이
    R: Math.min(W / 16, H / 14),  // 캡슐 반지름
  };
  L.x0 = L.d * 0.35; L.x1 = W - L.d * 0.35; L.floor = H;
  L.restY = L.lip + L.R * 0.4;    // 집게 머리 대기 높이
  L.clawS = L.R * 1.25;           // 집게 크기
  stage.style.setProperty('--qr', Math.round(Math.max(110, Math.min(220, m * 0.22))) + 'px');
  bgCanvas = makeBackground();
  spriteCache.clear();
  // 기존 캡슐 위치를 새 크기에 맞게 옮김
  if (oldW && caps.length) {
    const k = L.R / oldR;
    for (const c of caps) {
      c.x = L.x0 + (c.x - (oldW ? L.d * 0 : 0)) / oldW * (L.x1 - L.x0);
      c.y = L.floor - (oldH - c.y) * k;
      c.vx = c.vy = 0;
    }
    for (let i = 0; i < 240; i++) physics(1 / 120);
  }
  claw.x = Math.max(L.x0 + L.R, Math.min(L.x1 - L.R, claw.x || W / 2));
  if (claw.phase === 'ready' || claw.phase === 'move') claw.y = L.restY;
}
addEventListener('resize', applyOrientation);

function makeBackground() {
  const c = document.createElement('canvas');
  c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
  const g = c.getContext('2d');
  g.scale(DPR, DPR);
  const { d, lip } = L;
  // 뒷벽
  const back = g.createLinearGradient(0, lip, 0, H);
  back.addColorStop(0, '#9a9fa5'); back.addColorStop(0.6, '#7d8288'); back.addColorStop(1, '#5d6166');
  g.fillStyle = back; g.fillRect(0, 0, W, H);
  // 콘크리트 질감 (점 + 얼룩)
  const n = Math.floor(W * H / 90);
  for (let i = 0; i < n; i++) {
    const x = Math.random() * W, y = Math.random() * H, s = Math.random() * 1.6 + 0.3;
    g.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${Math.random() * 0.08})` : `rgba(0,0,0,${Math.random() * 0.1})`;
    g.fillRect(x, y, s, s);
  }
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * W, y = Math.random() * H, r = Math.random() * m(0.12) + m(0.03);
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = Math.random() < 0.5;
    rg.addColorStop(0, dark ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.05)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 왼쪽/오른쪽 벽 (어둡게, 원근감)
  const side = (x0, x1) => {
    const gr = g.createLinearGradient(x0, 0, x1, 0);
    gr.addColorStop(0, 'rgba(20,22,26,.55)'); gr.addColorStop(1, 'rgba(20,22,26,.15)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(x0, 0); g.lineTo(x1, lip); g.lineTo(x1, H); g.lineTo(x0, H); g.closePath(); g.fill();
  };
  side(0, d); side(W, W - d);
  // 위쪽 벽 (밝게) + 로고 음각
  const top = g.createLinearGradient(0, 0, 0, lip);
  top.addColorStop(0, '#b4b8bd'); top.addColorStop(1, '#8e9399');
  g.fillStyle = top;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W - d, lip); g.lineTo(d, lip); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(d, lip); g.lineTo(W - d, lip); g.moveTo(d, lip); g.lineTo(0, 0); g.moveTo(W - d, lip); g.lineTo(W, 0); g.stroke();
  const fs = Math.min(lip * 0.42, W * 0.07);
  g.font = `${fs}px "Bebas Neue", Impact, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,.45)'; g.fillText('LUCKY CAPSULE', W / 2 + 1, lip * 0.52 + 1.5);
  g.fillStyle = 'rgba(40,42,46,.55)'; g.fillText('LUCKY CAPSULE', W / 2, lip * 0.52);
  // 비네팅
  const vg = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.3, W / 2, H * 0.5, Math.max(W, H) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.35)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  return c;
  function m(f) { return Math.min(W, H) * f; }
}

// ------------------------------------------------------------------
// 캡슐 (2D 물리)
// ------------------------------------------------------------------
let caps = [];
let uid = 0;

function newCap(pi, x, y) {
  const silverChance = pi >= 0 && prizes[pi] && prizes[pi].count <= 1 ? 0.7 : 0.08; // 귀한 상품은 은색일 확률 높음
  const ci = Math.random() < silverChance ? 7 : Math.floor(Math.random() * 7);
  const c = { id: ++uid, pi, ci, x, y, vx: (Math.random() - 0.5) * 40, vy: 0, a: Math.random() * Math.PI * 2, va: 0, held: false, gone: false };
  caps.push(c);
  return c;
}

function refill() {
  caps = [];
  const list = [];
  prizes.forEach((p, i) => { for (let k = 0; k < p.count; k++) list.push(i); });
  for (let k = 0; k < opts.blank; k++) list.push(-1);
  list.sort(() => Math.random() - 0.5);
  const maxCaps = Math.floor(((L.x1 - L.x0) / (L.R * 2)) * 7);
  list.slice(0, Math.max(10, maxCaps)).forEach((pi, n) => {
    newCap(pi, L.x0 + L.R + Math.random() * (L.x1 - L.x0 - 2 * L.R), L.floor - L.R - n * L.R * 0.6);
  });
  for (let i = 0; i < 900; i++) physics(1 / 120);
}

function respawn(pi) {
  setTimeout(() => newCap(pi, L.x0 + L.R + Math.random() * (L.x1 - L.x0 - 2 * L.R), -L.R * 2), 600);
}

function physics(h) {
  const G = H * 3.2, R = L.R;
  const live = caps.filter(c => !c.gone);
  for (const c of live) {
    if (c.held) continue;
    c.vy += G * h;
    c.x += c.vx * h; c.y += c.vy * h;
    c.a += c.va * h; c.va *= 0.985;
    if (c.y > L.floor - R) { c.y = L.floor - R; c.vy *= -0.15; c.vx *= 0.9; c.va = c.vx / R; }
    if (c.x < L.x0 + R) { c.x = L.x0 + R; c.vx = Math.abs(c.vx) * 0.3; }
    if (c.x > L.x1 - R) { c.x = L.x1 - R; c.vx = -Math.abs(c.vx) * 0.3; }
  }
  for (let it = 0; it < 4; it++) {
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      for (let j = i + 1; j < live.length; j++) {
        const b = live[j];
        const dx = b.x - a.x; if (dx > 2 * R || dx < -2 * R) continue;
        const dy = b.y - a.y; if (dy > 2 * R || dy < -2 * R) continue;
        const d2 = dx * dx + dy * dy, min = 2 * R - 0.5;
        if (d2 < min * min && d2 > 0.0001) {
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = min - d;
          const wa = a.held ? 0 : (b.held ? 1 : 0.5), wb = 1 - wa;
          a.x -= nx * ov * wa; a.y -= ny * ov * wa;
          b.x += nx * ov * wb; b.y += ny * ov * wb;
          const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rv < 0) {
            const imp = -rv * 0.55;
            if (!a.held) { a.vx -= nx * imp * wa * 2; a.vy -= ny * imp * wa * 2; }
            if (!b.held) { b.vx += nx * imp * wb * 2; b.vy += ny * imp * wb * 2; }
            const tang = (b.vx - a.vx) * -ny + (b.vy - a.vy) * nx;
            a.va += tang / R * 0.05; b.va -= tang / R * 0.05;
          }
        }
      }
    }
  }
}

// 캡슐 그림 캐시 (색 + 안에 든 상품)
const spriteCache = new Map();
const imgCache = new Map();
function getImg(src) {
  if (!src) return null;
  if (!imgCache.has(src)) { const im = new Image(); im.onload = () => spriteCache.clear(); im.src = src; imgCache.set(src, im); }
  const im = imgCache.get(src);
  return im.complete && im.naturalWidth ? im : null;
}
function capSprite(ci, pi) {
  const key = ci + '|' + pi;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const R = L.R, s = Math.ceil(R * 2 * DPR + 4);
  const c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d');
  g.translate(s / 2, s / 2); g.scale(DPR, DPR);
  const col = COLORS[ci];
  // 그림자
  g.fillStyle = 'rgba(0,0,0,.18)';
  g.beginPath(); g.arc(0, R * 0.06, R, 0, Math.PI * 2); g.fill();
  // 아래 반쪽 (흰색)
  const bot = g.createRadialGradient(-R * 0.25, R * 0.1, R * 0.1, 0, 0, R * 1.05);
  bot.addColorStop(0, '#ffffff'); bot.addColorStop(0.6, '#efede7'); bot.addColorStop(1, '#bdb9b1');
  g.fillStyle = bot;
  g.beginPath(); g.arc(0, 0, R * 0.98, 0, Math.PI); g.closePath(); g.fill();
  // 위 반쪽 (색, 반투명) — 안에 든 상품이 살짝 보임
  g.save();
  g.beginPath(); g.arc(0, 0, R * 0.98, Math.PI, Math.PI * 2); g.closePath(); g.clip();
  if (col.silver) {
    const sg = g.createLinearGradient(-R, -R, R, 0);
    sg.addColorStop(0, '#f4f5f7'); sg.addColorStop(0.5, '#b8bcc4'); sg.addColorStop(1, '#8b9098');
    g.fillStyle = sg; g.fillRect(-R, -R, R * 2, R);
    g.strokeStyle = 'rgba(255,255,255,.65)'; g.lineWidth = R * 0.09;
    for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(k * R * 0.32 - R * 0.4, 0); g.lineTo(k * R * 0.32 + R * 0.3, -R); g.stroke(); }
  } else {
    const tg = g.createRadialGradient(0, 0, R * 0.1, 0, -R * 0.2, R * 1.05);
    tg.addColorStop(0, col.c2); tg.addColorStop(0.55, col.c); tg.addColorStop(1, col.c3);
    g.fillStyle = tg; g.fillRect(-R, -R, R * 2, R);
    const p = prizes[pi];
    if (p) {
      g.globalAlpha = 0.5;
      const im = getImg(p.img);
      if (im) { g.beginPath(); g.arc(0, -R * 0.12, R * 0.48, 0, 7); g.clip(); g.drawImage(im, -R * 0.48, -R * 0.6, R * 0.96, R * 0.96); }
      else { g.font = `${R * 0.8}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.emoji || '🎁', 0, -R * 0.12); }
      g.globalAlpha = 1;
    }
  }
  g.restore();
  // 이음매
  g.fillStyle = '#fbfaf6';
  g.fillRect(-R * 0.99, -R * 0.06, R * 1.98, R * 0.12);
  g.fillStyle = 'rgba(0,0,0,.12)';
  g.fillRect(-R * 0.99, R * 0.05, R * 1.98, R * 0.025);
  // 하이라이트
  g.fillStyle = 'rgba(255,255,255,.75)';
  g.beginPath(); g.ellipse(-R * 0.42, -R * 0.5, R * 0.22, R * 0.12, -0.6, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,.35)';
  g.beginPath(); g.ellipse(R * 0.35, R * 0.55, R * 0.18, R * 0.08, -0.4, 0, Math.PI * 2); g.fill();
  // 테두리
  g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1;
  g.beginPath(); g.arc(0, 0, R * 0.98, 0, Math.PI * 2); g.stroke();
  spriteCache.set(key, c);
  return c;
}
function drawCap(c, alpha = 1) {
  const sp = capSprite(c.ci, c.pi);
  const s = sp.width / DPR;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(c.x, c.y); ctx.rotate(c.a);
  ctx.drawImage(sp, -s / 2, -s / 2, s, s);
  ctx.restore();
}

// ------------------------------------------------------------------
// 집게
// ------------------------------------------------------------------
const claw = {
  x: 0, y: 0, vx: 0, vy: 0, open: 1, phase: 'ready', t: 0, timer: 15,
  held: null, slipAt: Infinity, riseFrom: 0, result: null, sway: 0, swayV: 0,
};
const input = { left: false, right: false };
const keys = { left: false, right: false };

function tipY() { return claw.y + L.clawS * 1.0; }

function drawClaw() {
  const s = L.clawS, x = claw.x + claw.sway, y = claw.y;
  // 줄
  ctx.strokeStyle = 'rgba(235,240,230,.85)'; ctx.lineWidth = Math.max(1, s * 0.025);
  ctx.beginPath(); ctx.moveTo(claw.x, 0); ctx.lineTo(x, y - s * 0.12); ctx.stroke();
  const o = claw.open;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // 뒤쪽 가운데 발 (얇고 어둡게)
  ctx.strokeStyle = '#6f9e22'; ctx.lineWidth = s * 0.07;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + s * 0.05, y + s * 0.55, x, y + s * 0.92); ctx.stroke();
  // 좌우 발
  for (const k of [-1, 1]) {
    const mx = x + k * (s * 0.22 + o * s * 0.42), my = y + s * 0.5;
    const tx = x + k * (s * 0.1 + o * s * 0.3), ty = y + s * 1.0;
    ctx.strokeStyle = '#4f7a12'; ctx.lineWidth = s * 0.11;
    ctx.beginPath(); ctx.moveTo(x + k * s * 0.08, y + s * 0.05); ctx.quadraticCurveTo(mx + k * s * 0.08, my - s * 0.15, mx, my); ctx.quadraticCurveTo(mx - k * s * 0.02, my + s * 0.3, tx, ty); ctx.stroke();
    ctx.strokeStyle = '#a8e83c'; ctx.lineWidth = s * 0.07;
    ctx.beginPath(); ctx.moveTo(x + k * s * 0.08, y + s * 0.05); ctx.quadraticCurveTo(mx + k * s * 0.08, my - s * 0.15, mx, my); ctx.quadraticCurveTo(mx - k * s * 0.02, my + s * 0.3, tx, ty); ctx.stroke();
  }
  // 머리
  const hg = ctx.createLinearGradient(x - s * 0.16, 0, x + s * 0.16, 0);
  hg.addColorStop(0, '#6f9e22'); hg.addColorStop(0.5, '#c8f56a'); hg.addColorStop(1, '#6f9e22');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.roundRect(x - s * 0.15, y - s * 0.16, s * 0.3, s * 0.24, s * 0.06); ctx.fill();
  ctx.fillStyle = '#e9ffc0';
  ctx.beginPath(); ctx.arc(x, y - s * 0.04, s * 0.045, 0, 7); ctx.fill();
}

// ------------------------------------------------------------------
// 게임 진행
// ------------------------------------------------------------------
function startPlay() {
  if (claw.phase !== 'ready' || revealing) return;
  claw.phase = 'move'; claw.timer = opts.playTime;
  broadcastState();
}
function pressGrab() {
  if (revealing) return;
  if (claw.phase === 'ready') { startPlay(); return; }
  if (claw.phase !== 'move') return;
  claw.phase = 'drop'; claw.vy = H * 0.4; claw.vx = 0;
  sound('drop');
  sendCtl({ type: 'fx', kind: 'drop' });
  broadcastState();
}

function capsBelow() {
  return caps.filter(c => !c.gone && !c.held && Math.abs(c.x - claw.x) < L.R * 0.95);
}

function evaluateGrab() {
  const R = L.R, ty = tipY();
  const cands = caps.filter(c => !c.gone && !c.held && Math.abs(c.x - claw.x) < R * 1.05 && c.y - R <= ty + R * 0.35);
  if (!cands.length) {
    const near = caps.filter(c => !c.gone).reduce((m, c) => Math.min(m, Math.abs(c.x - claw.x) - R), Infinity);
    return { kind: 'none', near };
  }
  cands.sort((a, b) => a.y - b.y);
  const c = cands[0];
  const dx = claw.x - c.x;
  const acc = Math.max(0, 1 - Math.abs(dx) / R);
  // 위에 다른 캡슐이 걸쳐 있으면 빼내기 어려움
  const covered = caps.some(o => o !== c && !o.gone && !o.held && o.y < c.y - R * 0.45 && Math.abs(o.x - c.x) < R * 1.35 && Math.hypot(o.x - c.x, o.y - c.y) < R * 2.1);
  const eff = covered ? acc * 0.6 : acc;
  const need = opts.diff;
  let kind;
  if (eff >= need + 0.15) kind = 'secure';
  else if (eff >= need) kind = 'slip';
  else kind = 'miss';
  return { kind, cap: c, acc, eff, need, covered, dx };
}

function stepGame(h) {
  // 줄 흔들림
  claw.swayV += (-90 * claw.sway - 5 * claw.swayV) * h;
  claw.sway += claw.swayV * h;

  switch (claw.phase) {
    case 'ready':
    case 'move': {
      const left = mode === 'demo' ? demoIn.left : (input.left || keys.left);
      const right = mode === 'demo' ? demoIn.right : (input.right || keys.right);
      const dir = (right ? 1 : 0) - (left ? 1 : 0);
      if (claw.phase === 'ready' && dir && !revealing) startPlay();
      if (claw.phase !== 'move') break;
      const speed = Math.max(W * 0.32, (L.x1 - L.x0) * 0.45);
      const pv = claw.vx;
      claw.vx += (dir * speed - claw.vx) * Math.min(1, h * 14);
      claw.swayV -= (claw.vx - pv) * 0.06;
      claw.x += claw.vx * h;
      const lo = L.x0 + L.R * 0.9, hi = L.x1 - L.R * 0.9;
      if (claw.x < lo) { claw.x = lo; claw.vx = 0; }
      if (claw.x > hi) { claw.x = hi; claw.vx = 0; }
      claw.timer -= h;
      if (claw.timer <= 0) { claw.timer = 0; pressGrab(); }
      break;
    }
    case 'drop': {
      // 툭 떨어지기: 빠르게 가속
      claw.vy = Math.min(H * 3.2, claw.vy + H * 9 * h);
      claw.y += claw.vy * h;
      const ty = tipY();
      const hit = capsBelow().some(c => ty >= c.y - L.R * 0.55) || ty >= L.floor - 3;
      if (hit) {
        claw.y -= L.R * 0.08;          // 살짝 튕김
        claw.phase = 'close'; claw.t = 0;
        claw.result = evaluateGrab();
        // 닿은 캡슐들 살짝 밀림
        for (const c of capsBelow()) { c.vy += H * 0.3; c.vx += (c.x - claw.x) * 3; }
        sound('thunk');
        sendCtl({ type: 'fx', kind: 'touch' });
        broadcastState();
      }
      break;
    }
    case 'close': {
      claw.t += h;
      const r = claw.result;
      const target = r.kind === 'secure' || r.kind === 'slip' ? 0.32 : 0;
      claw.open = Math.max(target, 1 - claw.t / 0.2);
      if (claw.t >= 0.32) {
        if (r.kind === 'secure' || r.kind === 'slip') {
          claw.held = r.cap; r.cap.held = true; r.cap.vx = r.cap.vy = 0;
          claw.slipAt = r.kind === 'slip' ? 0.15 + (r.eff - r.need) / 0.15 * 0.7 : Infinity;
          sendCtl({ type: 'fx', kind: 'grab' });
          sound('grab');
        } else if (r.cap) {
          // 빗나감: 집게발이 캡슐을 밀어냄
          r.cap.vx += (r.cap.x - claw.x >= 0 ? 1 : -1) * L.R * 6; r.cap.vy -= L.R * 4; r.cap.va += 6;
        }
        claw.phase = 'rise'; claw.riseFrom = claw.y;
        broadcastState();
      }
      break;
    }
    case 'rise': {
      claw.y -= H * 1.15 * h;
      const prog = (claw.riseFrom - claw.y) / Math.max(1, claw.riseFrom - L.restY);
      if (claw.held && prog >= claw.slipAt) {
        const c = claw.held; c.held = false; c.vy = 0; c.vx = (Math.random() - 0.5) * L.R * 3; c.va = (Math.random() - 0.5) * 8;
        claw.held = null; claw.slipped = true; claw.open = 0.6;
        sound('slip');
        sendCtl({ type: 'fx', kind: 'slip' });
      }
      if (claw.y <= L.restY) {
        claw.y = L.restY;
        if (claw.held) startReveal(claw.held);
        else finishMiss();
      }
      break;
    }
    case 'wait':
      claw.t -= h;
      if (claw.t <= 0) toReady();
      break;
  }
  if (claw.held) {
    claw.held.x = claw.x + claw.sway;
    claw.held.y = claw.y + L.clawS * 0.62 + L.R * 0.2;
    claw.held.a += (0 - claw.held.a) * Math.min(1, h * 4);
  }
  if (claw.phase !== 'close' && claw.phase !== 'rise' && !claw.held) claw.open += (1 - claw.open) * Math.min(1, h * 8);
}

function toReady() {
  claw.phase = 'ready'; claw.timer = opts.playTime; claw.slipped = false; claw.result = null;
  demo.wait = 1.3;
  broadcastState();
}

function resultInfo() {
  const r = claw.result;
  if (!r) return {};
  if (r.kind === 'none') return { acc: 0, text: '집게 아래에 캡슐이 없었어요' };
  const pct = Math.round(r.eff * 100), need = Math.round(r.need * 100);
  let text = `정확도 ${Math.round(r.acc * 100)}%`;
  if (r.covered) text += ' · 위에 다른 캡슐이 걸쳐 있었어요';
  return { acc: pct, need, text };
}

function finishMiss() {
  const info = resultInfo();
  const title = claw.slipped ? '아깝다! 놓쳤어요' : (claw.result && claw.result.kind === 'none' ? '빈손이에요' : '헛잡았어요');
  toast(claw.slipped ? '😭 아깝다!' : '😅 ' + title);
  if (mode === 'game') sendCtl({ type: 'result', ok: false, title, detail: info.text, acc: info.acc, need: info.need });
  claw.phase = 'wait'; claw.t = 1.4;
  broadcastState();
}

// ------------------------------------------------------------------
// 3D 캡슐 개봉 연출
// ------------------------------------------------------------------
const revealEl = document.getElementById('reveal');
const cap3d = document.getElementById('cap3d');
const prize3d = document.getElementById('prize3d');
let revealing = false;

function startReveal(c) {
  revealing = true;
  claw.phase = 'reveal';
  const p = prizes[c.pi];
  const isPrize = !!p;
  const info = resultInfo();
  claw.held = null;
  c.gone = true;
  const col = COLORS[c.ci];

  // 상태 반영 (실제 게임일 때만 수량/기록)
  if (mode === 'game') {
    if (isPrize) {
      p.count = Math.max(0, p.count - 1);
      save(PRIZE_KEY, prizes);
      history.unshift({ name: p.name, emoji: p.emoji, at: Date.now() });
      history = history.slice(0, 100); save(HIST_KEY, history);
    }
    if (!isPrize) respawn(-1);
  } else {
    respawn(c.pi);   // 시연 중에는 같은 캡슐을 다시 넣음
  }

  const S = Math.min(W, H) * 0.36;
  cap3d.style.setProperty('--s', S + 'px');
  cap3d.style.setProperty('--c', col.c); cap3d.style.setProperty('--c2', col.c2); cap3d.style.setProperty('--c3', col.c3);
  prize3d.innerHTML = isPrize ? (p.img ? `<img src="${p.img}">` : (p.emoji || '🎁')) : '💨';
  document.getElementById('revealTitle').textContent = isPrize ? `${p.name} 당첨!` : '꽝!';
  document.getElementById('revealSub').textContent = isPrize ? (mode === 'demo' ? '시연 중이에요 · QR을 찍고 직접 해보세요' : '축하해요! 직원에게 화면을 보여주세요') : '다음 기회에…';
  revealEl.classList.remove('burst', 'blank', 'on');
  revealEl.classList.toggle('blank', !isPrize);
  cap3d.classList.remove('open');
  revealEl.classList.add('show');

  const sx = c.x - S / 2, sy = c.y - S / 2, k = (L.R * 2) / S;
  const ex = W / 2 - S / 2, ey = H * 0.42 - S / 2;
  const fly = cap3d.animate([
    { transform: `translate3d(${sx}px, ${sy}px, 0) scale(${k}) rotateZ(${c.a}rad)` },
    { transform: `translate3d(${(sx + ex) / 2}px, ${Math.min(sy, ey) - H * 0.08}px, 200px) scale(${(k + 1) / 2}) rotateY(360deg) rotateX(25deg)`, offset: 0.55 },
    { transform: `translate3d(${ex}px, ${ey}px, 0) scale(1) rotateY(720deg) rotateX(0deg)` },
  ], { duration: 1000, easing: 'cubic-bezier(.25,.8,.25,1)', fill: 'forwards' });
  requestAnimationFrame(() => revealEl.classList.add('on'));
  sound('whoosh');

  fly.onfinish = () => {
    // 흔들흔들
    const base = `translate3d(${ex}px, ${ey}px, 0)`;
    const shake = cap3d.animate([
      { transform: `${base} rotateZ(0deg)` }, { transform: `${base} rotateZ(-9deg)` }, { transform: `${base} rotateZ(8deg)` },
      { transform: `${base} rotateZ(-6deg)` }, { transform: `${base} rotateZ(4deg)` }, { transform: `${base} rotateZ(0deg) scale(1.05)` },
    ], { duration: 600, easing: 'ease-in-out', fill: 'forwards' });
    shake.onfinish = () => {
      cap3d.classList.add('open');
      revealEl.classList.add('burst');
      sound(isPrize ? 'win' : 'blank');
      if (isPrize) sparks();
      if (mode === 'game') sendCtl({ type: 'result', ok: isPrize, title: isPrize ? `${p.name} 당첨!` : '꽝!', detail: isPrize ? '축하해요! 🎉' : '다음 기회에…', emoji: isPrize ? p.emoji : '💨', img: isPrize && p.img && p.img.length < 150000 ? p.img : '', acc: info.acc, need: info.need });
      setTimeout(endReveal, isPrize ? 3600 : 2200);
    };
  };
}

function sparks() {
  const colors = ['#b6f24a', '#ffd447', '#ff6cc2', '#3d8bff', '#fff'];
  for (let i = 0; i < 40; i++) {
    const s = document.createElement('div');
    s.className = 'spark';
    const size = 6 + Math.random() * 10;
    s.style.width = s.style.height = size + 'px';
    s.style.background = colors[i % colors.length];
    revealEl.appendChild(s);
    const a = Math.random() * Math.PI * 2, d = Math.min(W, H) * (0.25 + Math.random() * 0.35);
    s.animate([
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d + d * 0.3}px)) scale(.3)`, opacity: 0 },
    ], { duration: 1100 + Math.random() * 600, easing: 'cubic-bezier(.1,.8,.3,1)', fill: 'forwards' }).onfinish = () => s.remove();
  }
}

function endReveal() {
  revealEl.classList.remove('on', 'burst');
  setTimeout(() => {
    revealEl.classList.remove('show');
    cap3d.getAnimations().forEach(a => a.cancel());
    cap3d.classList.remove('open');
    revealing = false;
    toReady();
  }, 450);
}

// ------------------------------------------------------------------
// 시작 화면 / 시연
// ------------------------------------------------------------------
let mode = 'demo';
const demoIn = { left: false, right: false };
const demo = { wait: 1.5, targetX: null, aimT: 0 };
const startEl = document.getElementById('start');

function updateDemo(dt) {
  if (mode !== 'demo') { demoIn.left = demoIn.right = false; return; }
  if (claw.phase === 'ready' && !revealing) {
    demo.wait -= dt;
    if (demo.wait <= 0) {
      // 위쪽에 드러난 캡슐 중 하나를 노림 (가끔 빗나감)
      const top = caps.filter(c => !c.gone && !c.held && c.x > L.x0 + L.R * 1.2 && c.x < L.x1 - L.R * 1.2).sort((a, b) => a.y - b.y).slice(0, 6);
      const t = top[Math.floor(Math.random() * top.length)];
      if (!t) { demo.wait = 1; return; }
      const miss = Math.random() < 0.4 ? L.R * (0.5 + Math.random() * 0.4) : L.R * Math.random() * 0.15;
      demo.targetX = t.x + (Math.random() < 0.5 ? -miss : miss);
      demo.aimT = 0;
      startPlay();
    }
    return;
  }
  if (claw.phase === 'move' && demo.targetX != null) {
    const dx = demo.targetX - claw.x;
    demo.aimT += dt;
    if (Math.abs(dx) < L.R * 0.06 || demo.aimT > 6) {
      demoIn.left = demoIn.right = false;
      if (Math.abs(claw.vx) < W * 0.02) { demo.targetX = null; setTimeout(() => { if (mode === 'demo') pressGrab(); }, 250); }
    } else {
      demoIn.right = dx > 0; demoIn.left = dx < 0;
    }
  }
}

function enterGame() {
  if (mode === 'game') return;
  mode = 'game';
  demoIn.left = demoIn.right = false;
  document.body.classList.add('playing');
  startEl.classList.add('hide');
  document.getElementById('settings').classList.remove('show');
  if (!revealing) { claw.phase = 'ready'; claw.held = null; claw.y = L.restY; refill(); }
  broadcastState();
}
function enterDemo() {
  if (mode === 'demo') return;
  mode = 'demo';
  document.body.classList.remove('playing');
  startEl.classList.remove('hide');
  if (!revealing) { claw.phase = 'ready'; if (claw.held) { claw.held.held = false; claw.held = null; } claw.y = L.restY; refill(); }
  demo.wait = 1.5;
}

// ------------------------------------------------------------------
// HUD
// ------------------------------------------------------------------
const timerEl = document.getElementById('timer'), hintEl = document.getElementById('hint'), toastEl = document.getElementById('toast');
let toastT;
function toast(t) { toastEl.textContent = t; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 1300); }
function updateHud() {
  const moving = claw.phase === 'move' && mode === 'game';
  timerEl.style.display = moving ? 'block' : 'none';
  timerEl.textContent = Math.ceil(claw.timer);
  timerEl.classList.toggle('low', claw.timer < 4);
  const showHint = mode === 'game' && claw.phase === 'ready' && !revealing;
  hintEl.style.display = showHint ? 'block' : 'none';
  if (showHint) hintEl.textContent = ctlConnected ? '◀ ▶ 로 움직이고 버튼을 눌러요' : '⌨️ 방향키 이동 · Space 뽑기 · Esc 처음으로';
}

// ------------------------------------------------------------------
// 렌더 / 루프
// ------------------------------------------------------------------
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.drawImage(bgCanvas, 0, 0, W, H);
  // 바닥 그림자
  const fg = ctx.createLinearGradient(0, H * 0.55, 0, H);
  fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, 'rgba(0,0,0,.25)');
  ctx.fillStyle = fg; ctx.fillRect(0, H * 0.55, W, H * 0.45);
  // 집게 그림자 (뒷벽에 흐릿하게)
  ctx.fillStyle = 'rgba(0,0,0,.12)';
  ctx.beginPath(); ctx.ellipse(claw.x + claw.sway + L.R * 0.25, claw.y + L.clawS * 0.6, L.clawS * 0.45, L.clawS * 0.6, 0, 0, 7); ctx.fill();
  const live = caps.filter(c => !c.gone && !c.held).sort((a, b) => a.y - b.y);
  for (const c of live) drawCap(c);
  if (claw.held) drawCap(claw.held);
  drawClaw();
}

const H_STEP = 1 / 120;
let acc = 0, last = performance.now(), lastSent = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  acc += dt;
  while (acc >= H_STEP) { stepGame(H_STEP); physics(H_STEP); acc -= H_STEP; }
  updateDemo(dt);
  updateHud();
  render();
  if (now - lastSent > 500) { lastSent = now; broadcastState(); }
  requestAnimationFrame(loop);
}
setInterval(() => { if (performance.now() - lastSent > 900) { lastSent = performance.now(); broadcastState(); } }, 1000);

// ------------------------------------------------------------------
// 소리
// ------------------------------------------------------------------
let actx;
function audio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function sound(kind) {
  const a = actx; if (!a || a.state !== 'running') return;
  const seq = {
    drop: [[660, .05], [440, .06]], thunk: [[110, .09]], grab: [[300, .06], [420, .08]], slip: [[500, .08], [360, .08], [240, .2]],
    whoosh: [[300, .05], [500, .05], [800, .08]], win: [[523, .1], [659, .1], [784, .1], [1047, .35]], blank: [[392, .15], [330, .3]], beep: [[880, .08]],
  }[kind] || [[600, .08]];
  let t = a.currentTime;
  for (const [f, d] of seq) {
    const o = a.createOscillator(), g = a.createGain();
    o.type = kind === 'thunk' ? 'sine' : 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(kind === 'thunk' ? 0.2 : 0.07, t); g.gain.exponentialRampToValueAtTime(0.0008, t + d);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + 0.02);
    t += d * 0.9;
  }
}
addEventListener('pointerdown', () => audio());

// ------------------------------------------------------------------
// 키보드 (PC로 직접 하기)
// ------------------------------------------------------------------
addEventListener('keydown', (e) => {
  if (document.querySelector('.modal.show')) return;
  audio();
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') { keys.left = true; if (mode === 'demo') enterGame(); e.preventDefault(); }
  if (e.code === 'ArrowRight' || e.code === 'KeyD') { keys.right = true; if (mode === 'demo') enterGame(); e.preventDefault(); }
  if (e.code === 'Space') { e.preventDefault(); if (mode === 'demo') { enterGame(); return; } if (!e.repeat) pressGrab(); }
  if (e.code === 'Escape') enterDemo();
});
addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
});

// ------------------------------------------------------------------
// 네트워크 (인터넷 중계)
// ------------------------------------------------------------------
let room = sessionStorage.getItem('claw.room');
if (!room || room.length < 8) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  room = Array.from({ length: 8 }, () => A[Math.floor(Math.random() * A.length)]).join('');
  sessionStorage.setItem('claw.room', room);
}
let net, ctlConnected = false, ctlId = null, lastPing = 0, lastInputAt = 0;

function connect() {
  net = ClawNet.open(room, 'host', {
    onOpen: () => { if (!ctlConnected) setStatus('폰 연결 대기 중'); broadcastState(); },
    onClose: () => { if (!ctlConnected) setStatus('연결 준비 중…'); },
    onMessage: (m) => {
      if (!m || !m.id) return;
      if (m.type === 'join' || (m.type === 'ping' && !ctlId)) {
        if (ctlId && ctlId !== m.id) sendCtl({ type: 'kicked', id: ctlId });
        ctlId = m.id; lastPing = performance.now();
        sendCtl({ type: 'joined', id: m.id });
        setConnected(true); broadcastState();
        return;
      }
      if (m.id !== ctlId) return;
      lastPing = performance.now();
      if (!ctlConnected) setConnected(true);
      if (m.type === 'input' && (m.key === 'left' || m.key === 'right')) {
        input[m.key] = !!m.down; lastInputAt = performance.now();
        if (m.down && claw.phase === 'ready') startPlay();
      }
      if (m.type === 'grab') pressGrab();
    },
  });
  setInterval(() => {
    const now = performance.now();
    if (ctlConnected && now - lastPing > 9000) { setConnected(false); ctlId = null; }
    if ((input.left || input.right) && now - lastInputAt > 1500) input.left = input.right = false;
  }, 500);
}
function sendCtl(m) { if (net) net.send(m); }
function broadcastState() { sendCtl({ type: 'state', phase: claw.phase === 'wait' ? 'result' : claw.phase, timer: Math.ceil(claw.timer) }); }
function setStatus(t) { document.getElementById('statusText').textContent = t; }
function setConnected(on) {
  const was = ctlConnected;
  ctlConnected = on;
  if (!on) input.left = input.right = false;
  document.getElementById('dot').classList.toggle('on', on);
  setStatus(on ? '📱 폰 연결됨!' : '폰 연결 대기 중');
  if (on && !was) { audio(); sound('beep'); enterGame(); }
  if (!on && was) enterDemo();
}

function setupQR() {
  const box = document.getElementById('qrBox');
  const base = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
  const link = `${base}controller.html?room=${room}`;
  box.innerHTML = '';
  if (window.QRCode) new QRCode(box, { text: link, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
  else box.textContent = link;
  box.title = link;
}

// ------------------------------------------------------------------
// 화면 방향 / 설정 UI
// ------------------------------------------------------------------
document.querySelectorAll('#orient button').forEach(b => b.onclick = () => { opts.orient = b.dataset.o; save(OPT_KEY, opts); applyOrientation(); });

const modal = document.getElementById('settings');
const listEl = document.getElementById('prizeList');
const filePick = document.getElementById('filePick');
let draft = [], pickFor = -1;
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function openSettings() {
  draft = structuredClone(prizes);
  document.getElementById('optBlank').value = opts.blank;
  document.getElementById('optDiff').value = String(opts.diff);
  document.getElementById('optTime').value = String(opts.playTime);
  renderDraft();
  const hl = document.getElementById('history');
  hl.innerHTML = history.length ? history.map(h => { const t = new Date(h.at); return `${esc(h.emoji || '🎁')} ${esc(h.name)} · ${t.getMonth() + 1}/${t.getDate()} ${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`; }).join('<br>') : '아직 없어요';
  modal.classList.add('show');
}
function renderDraft() {
  listEl.innerHTML = '';
  draft.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div class="thumb" title="눌러서 사진 넣기">${p.img ? `<img src="${p.img}">` : esc(p.emoji || '🎁')}</div>
      <input data-k="name" value="${esc(p.name)}" placeholder="상품 이름" maxlength="20">
      <input data-k="emoji" value="${esc(p.emoji || '')}" placeholder="🎁" maxlength="4">
      <input data-k="count" type="number" min="0" max="60" value="${p.count}">
      <button class="del" title="삭제">✕</button>`;
    row.querySelector('.thumb').onclick = () => {
      if (p.img && confirm('사진을 지우고 이모지로 돌아갈까요?')) { p.img = ''; renderDraft(); return; }
      pickFor = i; filePick.value = ''; filePick.click();
    };
    row.querySelectorAll('input').forEach(inp => inp.oninput = () => {
      const k = inp.dataset.k;
      p[k] = k === 'count' ? Math.max(0, Math.min(60, Number(inp.value) || 0)) : inp.value;
      if (k === 'emoji' && !p.img) row.querySelector('.thumb').textContent = p.emoji || '🎁';
    });
    row.querySelector('.del').onclick = () => { draft.splice(i, 1); renderDraft(); };
    listEl.appendChild(row);
  });
}
filePick.onchange = () => {
  const f = filePick.files[0];
  if (!f || pickFor < 0) return;
  const reader = new FileReader();
  reader.onload = () => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 200;
      const s = Math.min(im.width, im.height);
      c.getContext('2d').drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 200, 200);
      draft[pickFor].img = c.toDataURL('image/jpeg', 0.85);
      renderDraft();
    };
    im.src = reader.result;
  };
  reader.readAsDataURL(f);
};
document.getElementById('openSettings').onclick = openSettings;
document.getElementById('cancelSettings').onclick = () => modal.classList.remove('show');
document.getElementById('addPrize').onclick = () => { draft.push({ name: '새 상품', emoji: '🎁', img: '', count: 3 }); renderDraft(); listEl.scrollTop = listEl.scrollHeight; };
document.getElementById('resetPrizes').onclick = () => { if (confirm('기본 상품으로 되돌릴까요?')) { draft = structuredClone(DEFAULT_PRIZES); renderDraft(); } };
document.getElementById('saveSettings').onclick = () => {
  const clean = draft.filter(p => String(p.name).trim());
  if (!clean.length) { alert('상품을 하나 이상 넣어주세요.'); return; }
  prizes = clean.map(p => ({ ...p, name: String(p.name).trim() }));
  opts.blank = Math.max(0, Math.min(60, Number(document.getElementById('optBlank').value) || 0));
  opts.diff = Number(document.getElementById('optDiff').value);
  opts.playTime = Number(document.getElementById('optTime').value);
  if (!save(PRIZE_KEY, prizes)) alert('저장 공간이 부족해요. 사진 수를 줄여주세요.');
  save(OPT_KEY, opts);
  spriteCache.clear();
  modal.classList.remove('show');
  claw.held = null; claw.phase = 'ready'; claw.y = L.restY;
  refill();
};

// ------------------------------------------------------------------
// 시작
// ------------------------------------------------------------------
applyOrientation();
claw.x = W / 2; claw.y = L.restY;
refill();
setupQR();
connect();
requestAnimationFrame(loop);
window.__cap = { claw, caps: () => caps, pressGrab, startPlay, evaluateGrab, L: () => L, enterGame, enterDemo, input, get mode() { return mode; } };
})();

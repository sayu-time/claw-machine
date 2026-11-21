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
  L.clawS = L.R * 2.1;            // 집게 크기 (캡슐보다 크게)
  L.restY = L.lip + L.clawS * 0.55; // 집게 대기 높이 (높이 매달려 있다가 길게 떨어짐)
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
  const c = { id: ++uid, pi, ci, z: Math.random(), x, y, vx: (Math.random() - 0.5) * 40, vy: 0, a: 0, va: 0, held: false, gone: false };
  caps.push(c);
  return c;
}

function refill() {
  caps = [];
  const list = [];
  prizes.forEach((p, i) => { for (let k = 0; k < p.count; k++) list.push(i); });
  for (let k = 0; k < opts.blank; k++) list.push(-1);
  list.sort(() => Math.random() - 0.5);
  // 집게가 길게 떨어지도록 캡슐 더미 높이를 화면의 약 42%로 제한
  const perRow = Math.floor((L.x1 - L.x0) / (L.R * 2));
  const rows = Math.max(2, Math.floor((H * 0.42) / (L.R * 1.75)));
  const maxCaps = perRow * rows;
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
    if (c.y > L.floor - R) { c.y = L.floor - R; c.vy *= -0.15; c.vx *= 0.9; }
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
  const zk = 0.92 + (c.z ?? 0.5) * 0.14;          // 깊이에 따른 크기
  const k = (c.scale || 1) * (c.held ? 1 : zk);
  ctx.drawImage(sp, -s * k / 2, -s * k / 2, s * k, s * k);
  if (!c.held && (c.z ?? 0.5) < 0.5) {             // 뒤쪽 캡슐은 살짝 어둡게
    ctx.fillStyle = `rgba(20,22,28,${(0.5 - c.z) * 0.36})`;
    ctx.beginPath(); ctx.arc(0, 0, L.R * 0.98 * k, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ------------------------------------------------------------------
// 집게
// ------------------------------------------------------------------
const claw = {
  x: 0, y: 0, vx: 0, vy: 0, open: 1, phase: 'ready', t: 0, timer: 15,
  held: null, riseFrom: 0, result: null, sway: 0, swayV: 0, depth: 0,
};
const input = { left: false, right: false };
const keys = { left: false, right: false };
let shake = 0, zoom = 0;

function tipY() { return claw.y + L.clawS * 0.95; }
function railY() { return L.lip + L.clawS * 0.06; }

// 집게발 어깨/관절/끝 위치 (o: 벌림 정도 0~1)
function prongGeo(k, o) {
  const s = L.clawS, x = claw.x + claw.sway, y = claw.y;
  return {
    sh: { x: x + k * s * 0.12, y: y + s * 0.06 },
    kn: { x: x + k * (s * 0.24 + o * s * 0.48), y: y + s * 0.44 },
    tp: { x: x + k * (s * 0.1 + o * s * 0.55), y: y + s * 0.95 },
  };
}

function drawClaw(part) {
  const s = L.clawS, x = claw.x + claw.sway, y = claw.y, o = claw.open;
  const ry = railY();
  const dk = 1 + claw.depth;
  if (part === 'front') {
    ctx.save();
    ctx.translate(x, y); ctx.scale(dk, dk); ctx.translate(-x, -y);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    drawSideProngs(s, o);
    ctx.restore();
    return;
  }
  // 레일 + 이동 장치
  const rg = ctx.createLinearGradient(0, ry - s * 0.07, 0, ry + s * 0.07);
  rg.addColorStop(0, '#e9ecf0'); rg.addColorStop(0.5, '#9aa1aa'); rg.addColorStop(1, '#5c626b');
  ctx.fillStyle = rg; ctx.fillRect(L.d * 0.5, ry - s * 0.05, W - L.d, s * 0.1);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(L.d * 0.5, ry + s * 0.05, W - L.d, s * 0.03);
  const cg = ctx.createLinearGradient(claw.x - s * 0.3, 0, claw.x + s * 0.3, 0);
  cg.addColorStop(0, '#4a5059'); cg.addColorStop(0.5, '#c3c9d1'); cg.addColorStop(1, '#4a5059');
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.roundRect(claw.x - s * 0.3, ry - s * 0.11, s * 0.6, s * 0.24, s * 0.05); ctx.fill();
  ctx.fillStyle = '#a8e83c'; ctx.fillRect(claw.x - s * 0.3, ry - s * 0.02, s * 0.6, s * 0.04);
  for (const k of [-1, 1]) { ctx.fillStyle = '#2b2f35'; ctx.beginPath(); ctx.arc(claw.x + k * s * 0.2, ry + s * 0.08, s * 0.045, 0, 7); ctx.fill(); }
  // 케이블 (두 가닥)
  const topY = y - s * 0.36;
  ctx.lineCap = 'round';
  for (const k of [-1, 1]) {
    ctx.strokeStyle = '#2d3137'; ctx.lineWidth = s * 0.045;
    ctx.beginPath(); ctx.moveTo(claw.x + k * s * 0.06, ry + s * 0.12); ctx.lineTo(x + k * s * 0.06, topY); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = s * 0.012;
    ctx.beginPath(); ctx.moveTo(claw.x + k * s * 0.06 - s * 0.01, ry + s * 0.12); ctx.lineTo(x + k * s * 0.06 - s * 0.01, topY); ctx.stroke();
  }
  // 원근: 파고들면 작아지고(안쪽), 들어 올리면 커짐(앞쪽)
  ctx.save();
  ctx.translate(x, y); ctx.scale(dk, dk); ctx.translate(-x, -y);
  // 뒤쪽 가운데 발
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#3b4048'; ctx.lineWidth = s * 0.11;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + s * 0.86); ctx.stroke();
  ctx.strokeStyle = '#8a9099'; ctx.lineWidth = s * 0.07;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + s * 0.86); ctx.stroke();
  // (좌우 발은 캡슐 앞쪽 층에서 따로 그림)
  // 모터 하우징
  drawHousing(s, x, y);
  ctx.restore();
}

function drawSideProngs(s, o) {
  // 좌우 발 (굵은 금속 + 라임 관절)
  for (const k of [-1, 1]) {
    const g = prongGeo(k, o);
    const hook = { x: g.tp.x - k * s * 0.1, y: g.tp.y + s * 0.03 };
    ctx.strokeStyle = '#2f343b'; ctx.lineWidth = s * 0.15;
    ctx.beginPath(); ctx.moveTo(g.sh.x, g.sh.y); ctx.lineTo(g.kn.x, g.kn.y); ctx.lineTo(g.tp.x, g.tp.y); ctx.lineTo(hook.x, hook.y); ctx.stroke();
    ctx.strokeStyle = '#cfd4db'; ctx.lineWidth = s * 0.1;
    ctx.beginPath(); ctx.moveTo(g.sh.x, g.sh.y); ctx.lineTo(g.kn.x, g.kn.y); ctx.lineTo(g.tp.x, g.tp.y); ctx.stroke();
    ctx.strokeStyle = '#f7f9fb'; ctx.lineWidth = s * 0.025;
    ctx.beginPath(); ctx.moveTo(g.sh.x - k * s * 0.02, g.sh.y); ctx.lineTo(g.kn.x - k * s * 0.025, g.kn.y); ctx.lineTo(g.tp.x - k * s * 0.02, g.tp.y - s * 0.03); ctx.stroke();
    ctx.strokeStyle = '#a8e83c'; ctx.lineWidth = s * 0.1;
    ctx.beginPath(); ctx.moveTo(g.tp.x, g.tp.y - s * 0.02); ctx.lineTo(hook.x, hook.y); ctx.stroke();
    ctx.fillStyle = '#2f343b'; ctx.beginPath(); ctx.arc(g.kn.x, g.kn.y, s * 0.075, 0, 7); ctx.fill();
    ctx.fillStyle = '#a8e83c'; ctx.beginPath(); ctx.arc(g.kn.x, g.kn.y, s * 0.05, 0, 7); ctx.fill();
  }
}

function drawHousing(s, x, y) {
  const hg = ctx.createLinearGradient(x - s * 0.22, 0, x + s * 0.22, 0);
  hg.addColorStop(0, '#50565f'); hg.addColorStop(0.35, '#eef1f4'); hg.addColorStop(0.6, '#b4bac3'); hg.addColorStop(1, '#4a5059');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.roundRect(x - s * 0.22, y - s * 0.36, s * 0.44, s * 0.36, s * 0.07); ctx.fill();
  ctx.fillStyle = '#a8e83c'; ctx.fillRect(x - s * 0.22, y - s * 0.17, s * 0.44, s * 0.07);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x - s * 0.22, y - s * 0.1, s * 0.44, s * 0.015);
  ctx.fillStyle = '#2b2f35';
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.01, s * 0.16, s * 0.05, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#d7dce2'; ctx.beginPath(); ctx.arc(x, y + s * 0.04, s * 0.07, 0, 7); ctx.fill();
}

// 조준선: 집게 중심선만 점선으로 (성공 여부는 미리 알려주지 않음)
// 캡슐보다 뒤에 그려서 캡슐 사이 틈으로만 보임 → 아래쪽 캡슐을 노릴 때 참고
function drawGuide() {
  if (!['move', 'release'].includes(claw.phase)) return;
  const x = claw.x;
  ctx.save();
  ctx.setLineDash([7, 7]); ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,.5)';
  ctx.beginPath(); ctx.moveTo(x, tipY() + 4); ctx.lineTo(x, L.floor); ctx.stroke();
  ctx.restore();
}

// 들어 올리는 캡슐의 그림자 (아래 캡슐 더미 위에)
function drawLiftShadow() {
  const c = claw.held;
  if (!c) return;
  const below = findTarget(c.x);
  const gy = below ? below.y - L.R * 0.6 : L.floor - L.R * 0.2;
  const hgt = Math.max(0, gy - c.y);
  const a = Math.max(0, 0.35 - hgt / H * 0.6);
  if (a <= 0) return;
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.beginPath(); ctx.ellipse(c.x, gy, L.R * (0.9 + hgt / H), L.R * 0.28, 0, 0, Math.PI * 2); ctx.fill();
}

// ------------------------------------------------------------------
// 판정 규칙 (무작위 없음)
//  1) 집게는 캡슐 더미 속으로 파고들며, 중심선에서 반지름의 70% 넘게 떨어진 캡슐은 옆으로 밀어냄
//  2) 중심선에 가까운(70% 이내) 첫 캡슐에 닿으면 멈춤 → 그 캡슐이 대상 (틈을 노리면 아래쪽 캡슐도 가능)
//  3) 대상 캡슐 중심에서 벗어난 정도가 허용 범위 안이면 잡힘 (쉬움 60% / 보통 45% / 어려움 28%)
// ------------------------------------------------------------------
const STOP = 0.7;
function zone() { return Math.min(0.6, 1 - opts.diff); }

function findTarget(x) {
  let best = null;
  for (const c of caps) {
    if (c.gone || c.held) continue;
    if (Math.abs(c.x - x) >= L.R * STOP) continue;
    if (!best || c.y < best.y) best = c;
  }
  return best;
}
function judge(x) {
  const c = findTarget(x);
  const z = zone();
  if (!c) return { kind: 'none', zone: z };
  const dx = x - c.x, off = Math.abs(dx) / L.R;
  return { kind: off <= z ? 'ok' : 'off', cap: c, dx, off, zone: z };
}
const evaluateGrab = () => judge(claw.x);

// ------------------------------------------------------------------
// 게임 진행
// ------------------------------------------------------------------
function startPlay() {
  if (claw.phase !== 'ready' || revealing) return;
  claw.phase = 'move'; claw.timer = opts.playTime;
  hideJudge();
  broadcastState();
}
function pressGrab() {
  if (revealing) return;
  if (claw.phase === 'ready') { startPlay(); return; }
  if (claw.phase !== 'move') return;
  claw.phase = 'release'; claw.t = 0; claw.vx = 0;
  sound('release');
  sendCtl({ type: 'fx', kind: 'drop' });
  broadcastState();
}

function stepGame(h) {
  claw.swayV += (-80 * claw.sway - 4 * claw.swayV) * h;
  claw.sway += claw.swayV * h;
  shake = Math.max(0, shake - h * 3.5);
  const zTarget = ['impact', 'close'].includes(claw.phase) ? 1 : 0;
  zoom += (zTarget - zoom) * Math.min(1, h * (zTarget ? 10 : 3));

  switch (claw.phase) {
    case 'ready':
    case 'move': {
      const left = mode === 'demo' ? demoIn.left : (input.left || keys.left);
      const right = mode === 'demo' ? demoIn.right : (input.right || keys.right);
      const dir = (right ? 1 : 0) - (left ? 1 : 0);
      if (claw.phase === 'ready' && dir && !revealing) startPlay();
      if (claw.phase !== 'move') break;
      const speed = Math.max(W * 0.28, (L.x1 - L.x0) * 0.4);
      const pv = claw.vx;
      claw.vx += (dir * speed - claw.vx) * Math.min(1, h * 12);
      claw.swayV -= (claw.vx - pv) * 0.05;
      claw.x += claw.vx * h;
      const lo = L.x0 + L.R * 0.9, hi = L.x1 - L.R * 0.9;
      if (claw.x < lo) { claw.x = lo; claw.vx = 0; }
      if (claw.x > hi) { claw.x = hi; claw.vx = 0; }
      claw.timer -= h;
      if (claw.timer <= 0) { claw.timer = 0; pressGrab(); }
      break;
    }
    case 'release': {
      // 덜컥 — 잠금이 풀리는 순간
      claw.t += h;
      claw.y = L.restY - Math.sin(Math.min(1, claw.t / 0.25) * Math.PI) * L.clawS * 0.06;
      claw.sway = Math.sin(claw.t * 70) * L.clawS * 0.015;
      if (claw.t >= 0.28) { claw.phase = 'drop'; claw.vy = 0; claw.y = L.restY; claw.sway = 0; }
      break;
    }
    case 'drop': {
      // 중력처럼 점점 빨라지며 떨어짐
      claw.vy = Math.min(H * 1.6, claw.vy + H * 2.1 * h);
      claw.y += claw.vy * h;
      const ty = tipY();
      // 중심선에서 떨어진 캡슐은 옆으로 밀려남 (집게가 사이로 파고듦)
      for (const c of caps) {
        if (c.gone || c.held) continue;
        const dx = c.x - claw.x, adx = Math.abs(dx);
        if (adx < L.R * STOP || adx > L.R * 1.25) continue;
        if (c.y - L.R > ty || c.y + L.R < claw.y) continue;
        c.x += Math.sign(dx || 1) * (L.R * 1.25 - adx) * 0.2;
        c.vy = Math.min(c.vy, 0);
      }
      const t = findTarget(claw.x);
      const pileTop = caps.reduce((m, c) => (!c.gone && !c.held && Math.abs(c.x - claw.x) < L.R * 1.6) ? Math.min(m, c.y - L.R) : m, L.floor);
      claw.depth = -0.1 * Math.max(0, Math.min(1, (ty - pileTop) / (L.R * 3)));
      const hit = (t && ty >= t.y - L.R * 0.35) || ty >= L.floor - 3;
      if (hit) {
        claw.result = evaluateGrab();
        claw.y -= L.clawS * 0.05;
        claw.phase = 'impact'; claw.t = 0;
        shake = 1;
        sound('thunk');
        sendCtl({ type: 'fx', kind: 'touch' });
        broadcastState();
      }
      break;
    }
    case 'impact': {
      claw.t += h;
      if (claw.t < 0.12) claw.y += L.clawS * 0.05 * h / 0.12;
      if (claw.t >= 0.18) {
        claw.phase = 'close'; claw.t = 0;
        showJudge(claw.result);
        broadcastState();
      }
      break;
    }
    case 'close': {
      claw.t += h;
      const r = claw.result;
      const grip = r.kind === 'ok' ? 0.8 : 0;
      claw.open = Math.max(grip, 1 - claw.t / 0.35);
      if (claw.t >= 0.55) {
        if (r.kind === 'ok') {
          claw.held = r.cap; r.cap.held = true; r.cap.vx = r.cap.vy = 0; r.cap.z = 0.5;
          sendCtl({ type: 'fx', kind: 'grab' });
          sound('grab');
        } else if (r.cap) {
          // 빗나감: 집게발이 닿은 쪽 반대로 캡슐을 밀어냄 (방향·세기 모두 벗어난 정도로 결정)
          const dir = r.dx >= 0 ? -1 : 1;
          r.cap.vx += dir * L.R * (2 + r.off * 4);
        }
        claw.phase = 'rise'; claw.riseFrom = claw.y; claw.t = 0; claw.riseDepth = claw.depth;
        broadcastState();
      }
      break;
    }
    case 'rise': {
      claw.t += h;
      const sp = H * 0.7 * Math.min(1, claw.t * 2.5);
      claw.y -= sp * h;
      const prog = Math.min(1, (claw.riseFrom - claw.y) / Math.max(1, claw.riseFrom - L.restY));
      claw.depth = claw.riseDepth + ((claw.held ? 0.32 : 0.12) - claw.riseDepth) * prog;
      if (claw.y <= L.restY) {
        claw.y = L.restY;
        claw.swayV += L.clawS * 0.6;
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
    claw.held.y = claw.y + L.clawS * 0.66 * (1 + claw.depth);
    claw.held.scale = (1 + claw.depth) * (0.92 + 0.5 * 0.14);
  }
  if (!['rise', 'reveal', 'drop', 'impact', 'close'].includes(claw.phase)) claw.depth += (0 - claw.depth) * Math.min(1, h * 5);
  if (!['close', 'rise', 'impact'].includes(claw.phase) && !claw.held) claw.open += (1 - claw.open) * Math.min(1, h * 6);
}

function toReady() {
  claw.phase = 'ready'; claw.timer = opts.playTime; claw.result = null;
  demo.wait = 1.6;
  broadcastState();
}

// 판정 설명 (PC 패널 + 폰으로 보냄)
function judgeText(r) {
  if (!r) return { title: '', detail: '' };
  const zp = Math.round(r.zone * 100);
  if (r.kind === 'none') return { title: '빈손', detail: '집게 아래에 캡슐이 없었어요' };
  const op = Math.round(r.off * 100);
  const dir = r.dx > 0 ? '오른쪽' : '왼쪽';
  if (r.kind === 'blocked') return { title: '막혔어요', detail: `다른 캡슐이 위에서 누르고 있어서 빼낼 수 없었어요` };
  if (r.kind === 'ok') return { title: '잡았다!', detail: `중심에서 ${op}% 벗어남 · 허용 ${zp}% 이내` };
  return { title: '빗나감', detail: `중심에서 ${dir}으로 ${op}% 벗어남 · 허용 ${zp}%까지` };
}
function judgeData(r) { return r ? { kind: r.kind, off: r.off ?? null, zone: r.zone, side: r.dx > 0 ? 1 : -1 } : null; }

function finishMiss() {
  const r = claw.result;
  const t = judgeText(r);
  toast(r && r.kind === 'blocked' ? '🔒 막혔어요' : (r && r.kind === 'none' ? '😅 빈손' : '😅 빗나갔어요'));
  if (mode === 'game') sendCtl({ type: 'result', ok: false, title: t.title, detail: t.detail, judge: judgeData(r) });
  claw.phase = 'wait'; claw.t = 1.6;
  broadcastState();
}

// ---------- 판정 패널 (PC) ----------
const judgeEl = document.getElementById('judge');
const judgeCv = document.getElementById('judgeCv');
let judgeTimer;
function showJudge(r) {
  const t = judgeText(r);
  document.getElementById('judgeTitle').textContent = t.title;
  document.getElementById('judgeDetail').textContent = t.detail;
  judgeEl.className = 'hud show ' + (r.kind === 'ok' ? 'ok' : 'bad');
  // 집게 반대편에 띄워서 잡는 장면을 가리지 않게
  judgeEl.style.left = claw.x > W / 2 ? '26%' : '74%';
  drawJudgeDiagram(judgeCv.getContext('2d'), judgeCv.width, judgeCv.height, judgeData(r));
  clearTimeout(judgeTimer);
  judgeTimer = setTimeout(hideJudge, 3400);
  sendCtl({ type: 'judge', title: t.title, detail: t.detail, judge: judgeData(r) });
}
function hideJudge() { judgeEl.classList.remove('show'); }

// 캡슐 단면 + 허용 구간 + 집게가 내려간 위치
function drawJudgeDiagram(g, w, h, j) {
  g.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h * 0.6, R = Math.min(w * 0.28, h * 0.42);
  g.globalAlpha = j.kind === 'none' ? 0.3 : 1;
  g.fillStyle = '#f1efe9'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI); g.fill();
  g.fillStyle = '#c9ccd2'; g.beginPath(); g.arc(cx, cy, R, Math.PI, Math.PI * 2); g.fill();
  const z = j.zone * R;
  g.fillStyle = 'rgba(182,242,74,.4)'; g.fillRect(cx - z, cy - R * 1.3, z * 2, R * 2.3);
  g.strokeStyle = '#b6f24a'; g.lineWidth = 2; g.setLineDash([5, 4]);
  g.beginPath(); g.moveTo(cx - z, cy - R * 1.3); g.lineTo(cx - z, cy + R); g.moveTo(cx + z, cy - R * 1.3); g.lineTo(cx + z, cy + R); g.stroke();
  g.setLineDash([]);
  g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(cx, cy - R * 1.3); g.lineTo(cx, cy + R); g.stroke();
  g.globalAlpha = 1;
  if (j.kind === 'none' || j.off == null) return;
  const px = cx + j.side * Math.min(1.25, j.off) * R;
  const col = j.kind === 'ok' ? '#b6f24a' : (j.kind === 'blocked' ? '#ffaa3c' : '#ff5f5f');
  g.strokeStyle = col; g.lineWidth = 4;
  g.beginPath(); g.moveTo(px, cy - R * 1.35); g.lineTo(px, cy - R * 0.35); g.stroke();
  g.fillStyle = col; g.beginPath(); g.moveTo(px, cy - R * 0.15); g.lineTo(px - 8, cy - R * 0.42); g.lineTo(px + 8, cy - R * 0.42); g.fill();
  if (j.kind === 'blocked') { g.font = `${R * 0.7}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🔒', cx, cy + R * 0.5); }
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
  hideJudge();
  const p = prizes[c.pi];
  const isPrize = !!p;
  const jd = judgeData(claw.result);
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

  const sx = c.x - S / 2, sy = c.y - S / 2, k = (L.R * 2 * (c.scale || 1)) / S;
  const ex = W / 2 - S / 2, ey = H * 0.42 - S / 2;
  const fly = cap3d.animate([
    { transform: `translate3d(${sx}px, ${sy}px, 0) scale(${k}) rotateX(0deg)` },
    { transform: `translate3d(${(sx * 0.4 + ex * 0.6)}px, ${Math.min(sy, ey) - H * 0.05}px, 120px) scale(${k * 0.3 + 0.7}) rotateX(-18deg)`, offset: 0.6 },
    { transform: `translate3d(${ex}px, ${ey}px, 0) scale(1) rotateX(0deg)` },
  ], { duration: 900, easing: 'cubic-bezier(.25,.8,.25,1)', fill: 'forwards' });
  requestAnimationFrame(() => revealEl.classList.add('on'));
  sound('whoosh');

  fly.onfinish = () => {
    // 흔들흔들
    const base = `translate3d(${ex}px, ${ey}px, 0)`;
    const wobble = cap3d.animate([
      { transform: `${base} rotateZ(0deg)` }, { transform: `${base} rotateZ(-5deg)` }, { transform: `${base} rotateZ(4deg)` },
      { transform: `${base} rotateZ(-2deg)` }, { transform: `${base} rotateZ(0deg) scale(1.04)` },
    ], { duration: 500, easing: 'ease-in-out', fill: 'forwards' });
    wobble.onfinish = () => {
      cap3d.classList.add('open');
      revealEl.classList.add('burst');
      sound(isPrize ? 'win' : 'blank');
      if (isPrize) sparks();
      if (mode === 'game') sendCtl({ type: 'result', ok: isPrize, title: isPrize ? `${p.name} 당첨!` : '꽝!', detail: isPrize ? '축하해요! 🎉' : '다음 기회에…', emoji: isPrize ? p.emoji : '💨', img: isPrize && p.img && p.img.length < 150000 ? p.img : '', judge: jd });
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
      // 시연: 막히지 않은 캡슐을 노리고, 가끔은 일부러 허용 구간 밖을 노려 빗나가는 모습도 보여줌
      const top = caps.filter(c => !c.gone && !c.held && c.x > L.x0 + L.R * 1.2 && c.x < L.x1 - L.R * 1.2 && judge(c.x).cap === c).slice(0, 8);
      const t = top[Math.floor(Math.random() * top.length)];
      if (!t) { demo.wait = 1; return; }
      const z = zone();
      const miss = Math.random() < 0.35 ? L.R * (z + 0.12 + Math.random() * 0.2) : L.R * z * Math.random() * 0.5;
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
  // 충격 시 화면 흔들림 (감쇠 진동)
  const sh = shake > 0 ? Math.sin(performance.now() / 18) * shake * L.R * 0.12 : 0;
  ctx.setTransform(DPR, 0, 0, DPR, 0, sh * DPR);
  if (zoom > 0.001) {
    const zx = claw.x, zy = tipY(), zf = 1 + zoom * 0.06;
    ctx.translate(zx, zy); ctx.scale(zf, zf); ctx.translate(-zx, -zy);
  }
  ctx.drawImage(bgCanvas, 0, 0, W, H);
  // 바닥 그림자
  const fg = ctx.createLinearGradient(0, H * 0.55, 0, H);
  fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, 'rgba(0,0,0,.25)');
  ctx.fillStyle = fg; ctx.fillRect(0, H * 0.55, W, H * 0.45);
  // 집게 그림자 (뒷벽에 흐릿하게)
  ctx.fillStyle = 'rgba(0,0,0,.12)';
  ctx.beginPath(); ctx.ellipse(claw.x + claw.sway + L.R * 0.25, claw.y + L.clawS * 0.6, L.clawS * 0.45, L.clawS * 0.6, 0, 0, 7); ctx.fill();
  // 잡는 중인 캡슐은 집게발 사이 층에 그림
  const grabbing = (claw.phase === 'impact' || claw.phase === 'close') && claw.result && claw.result.kind === 'ok' ? claw.result.cap : null;
  const live = caps.filter(c => !c.gone && !c.held && c !== grabbing).sort((a, b) => a.z - b.z);
  const back = live.filter(c => c.z < 0.5), front = live.filter(c => c.z >= 0.5);
  drawGuide();
  for (const c of back) drawCap(c);
  drawClaw('back');
  if (grabbing) drawCap(grabbing);
  if (claw.held) drawCap(claw.held);
  drawClaw('front');
  for (const c of front) drawCap(c);
  drawLiftShadow();
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
    release: [[180, .05], [140, .08]], drop: [[660, .05], [440, .06]], thunk: [[110, .09]], grab: [[300, .06], [420, .08]], slip: [[500, .08], [360, .08], [240, .2]],
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

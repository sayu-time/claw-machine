// ===================== 강동 청년회 럭키박스 (PC 화면) =====================
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
const DEFAULT_OPTS = { autoFill: true, blank: 60, diff: 0.55, playTime: 15, orient: 'auto' };
const PRIZE_KEY = 'capsule.prizes.v1', OPT_KEY = 'capsule.opts.v1', HIST_KEY = 'capsule.history.v1';
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

let prizes = load(PRIZE_KEY, null);
if (!Array.isArray(prizes) || !prizes.length) prizes = structuredClone(DEFAULT_PRIZES);
let opts = { ...DEFAULT_OPTS, ...load(OPT_KEY, {}) };
if (opts.blank === 24 || opts.blank === 36) opts.blank = DEFAULT_OPTS.blank;   // 예전 기본값이면 새 기본값으로
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
  // 선명하게: 최소 2배 해상도로 그림 (너무 큰 화면은 성능을 위해 약 4K 픽셀 수로 제한)
  DPR = Math.min(3, Math.max(2, devicePixelRatio || 1));
  const maxPx = 3840 * 2160 * 1.1;
  if (W * H * DPR * DPR > maxPx) DPR = Math.max(1, Math.sqrt(maxPx / (W * H)));
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  const m = Math.min(W, H);
  L = {
    d: m * 0.075,                 // 옆벽 깊이
    lip: m * 0.13,                // 위쪽 벽(로고) 높이
    R: capRadius(),               // 캡슐 반지름 (개수에 맞춰 더미가 화면 약 40%를 채우도록)
  };
  L.x0 = L.d * 0.35; L.x1 = W - L.d * 0.35; L.floor = H;
  L.clawS = Math.max(L.R * 2.2, m * 0.15); // 집게 크기 (캡슐이 작아져도 크레인은 실물처럼 크게)
  L.restY = L.lip + L.clawS * 0.55; // 집게 대기 높이 (높이 매달려 있다가 길게 떨어짐)
  stage.style.setProperty('--lip', Math.round(L.lip) + 'px');
  stage.style.setProperty('--qr', Math.round(Math.max(160, Math.min(360, m * 0.34))) + 'px');
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

// 캡슐 총개수로 반지름 결정: 4개 층이 겹쳐 쌓였을 때 화면 높이의 약 42%를 채우게
function capRadius() {
  let total = Math.max(12, Math.min(140, prizes.reduce((n, p) => n + (p.count || 0), 0) + (opts.blank || 0)));
  if (opts.autoFill) total = Math.max(total, 120);   // 가득 채우기: 캡슐을 작게 해서 많이 보이게
  const wInt = W * 0.95;
  const r = Math.sqrt(0.264 * wInt * H / total);
  return Math.max(Math.min(W / 28, H / 26), Math.min(r, W / 16, H / 15));
}

const LOGO_FONT = '"Pretendard Variable", Pretendard, "Noto Sans KR", sans-serif';
function drawLogo(g, lip) {
  const fs = Math.min(lip * 0.42, W * 0.055);
  const a = '강동 청년회', b = '럭키박스';
  g.save();
  g.textBaseline = 'middle'; g.textAlign = 'left';
  g.font = `300 ${fs * 0.86}px ${LOGO_FONT}`;
  if ('letterSpacing' in g) g.letterSpacing = `${fs * 0.18}px`;
  const wa = g.measureText(a).width;
  g.font = `700 ${fs}px ${LOGO_FONT}`;
  if ('letterSpacing' in g) g.letterSpacing = `${fs * 0.02}px`;
  const wb = g.measureText(b).width;
  const gap = fs * 0.75, total = wa + gap + wb;
  let x = W / 2 - total / 2; const y = lip * 0.52;
  g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = fs * 0.4; g.shadowOffsetY = fs * 0.06;
  g.font = `300 ${fs * 0.86}px ${LOGO_FONT}`;
  if ('letterSpacing' in g) g.letterSpacing = `${fs * 0.18}px`;
  g.fillStyle = 'rgba(255,255,255,.88)'; g.fillText(a, x, y);
  // 가운데 라임 점
  g.shadowBlur = fs * 0.5; g.shadowColor = 'rgba(182,242,74,.8)';
  g.fillStyle = '#b6f24a'; g.beginPath(); g.arc(x + wa + gap / 2, y, fs * 0.1, 0, Math.PI * 2); g.fill();
  g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = fs * 0.4;
  g.font = `700 ${fs}px ${LOGO_FONT}`;
  if ('letterSpacing' in g) g.letterSpacing = `${fs * 0.02}px`;
  g.fillStyle = '#ffffff'; g.fillText(b, x + wa + gap, y);
  g.restore();
}

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
  // 로고: 흰 글씨 — "강동 청년회"는 얇고 넓게, "럭키박스"는 굵게 + 라임 포인트
  drawLogo(g, lip);
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

// 깊이 층: 0(맨 뒤) ~ 3(맨 앞). 층마다 크기·바닥 높이·좌우 폭이 달라 원근감이 생김
const LAYERS = 4;
function zkOf(c) { return 0.78 + 0.28 * c.z; }          // 보이는 크기 비율
function rOf(c) { return L.R * zkOf(c); }               // 보이는 반지름
function floorOf(c) { return L.floor - (1 - c.z) * L.R * 1.7; }   // 뒤층일수록 바닥이 위(멀리)
function insetOf(c) { return (1 - c.z) * L.R * 0.9; }   // 뒤층일수록 좌우가 좁음

function newCap(pi, x, y, layer) {
  const silverChance = pi >= 0 && prizes[pi] && prizes[pi].count <= 1 ? 0.7 : 0.08; // 귀한 상품은 은색일 확률 높음
  const ci = Math.random() < silverChance ? 7 : Math.floor(Math.random() * 7);
  const li = layer ?? Math.floor(Math.random() * LAYERS);
  const c = { id: ++uid, pi, ci, li, z: li / (LAYERS - 1), x, y, vx: (Math.random() - 0.5) * 40, vy: 0,
    a: (Math.random() - 0.5) * 0.55, va: 0, held: false, gone: false };   // 살짝 기울어진 채 고정 (회전하지 않음)
  caps.push(c);
  return c;
}

function refill() {
  caps = [];
  const list = [];
  prizes.forEach((p, i) => { for (let k = 0; k < p.count; k++) list.push(i); });
  for (let k = 0; k < opts.blank; k++) list.push(-1);
  list.sort(() => Math.random() - 0.5);
  // 집게가 길게 떨어지도록 더미 높이를 화면의 약 42%로 제한 (층이 겹치므로 개수는 더 많음)
  const perRow = Math.floor((L.x1 - L.x0) / (L.R * 2));
  const rows = Math.max(2, Math.floor((H * 0.4) / (L.R * 1.75)));
  const maxCaps = Math.round(perRow * rows * 2.4);
  // 가득 채우기: 남는 자리는 꽝 캡슐로 (상품 수량은 그대로)
  if (opts.autoFill) { while (list.length < maxCaps) list.splice(Math.floor(Math.random() * (list.length + 1)), 0, -1); }
  list.slice(0, Math.max(12, maxCaps)).forEach((pi, n) => {
    const li = n % LAYERS;
    newCap(pi, L.x0 + L.R + Math.random() * (L.x1 - L.x0 - 2 * L.R), L.floor - L.R - n * L.R * 0.35, li);
  });
  for (let i = 0; i < 700; i++) physics(1 / 120);
}

function respawn(pi) {
  setTimeout(() => newCap(pi, L.x0 + L.R + Math.random() * (L.x1 - L.x0 - 2 * L.R), -L.R * 2), 600);
}

function physics(h) {
  const G = H * 3.2;
  const live = caps.filter(c => !c.gone);
  for (const c of live) {
    if (c.held) continue;
    const r = rOf(c), fl = floorOf(c), ins = insetOf(c);
    c.vy += G * h;
    c.x += c.vx * h; c.y += c.vy * h;
    if (c.y > fl - r) { c.y = fl - r; c.vy *= -0.15; c.vx *= 0.9; }
    if (c.x < L.x0 + ins + r) { c.x = L.x0 + ins + r; c.vx = Math.abs(c.vx) * 0.3; }
    if (c.x > L.x1 - ins - r) { c.x = L.x1 - ins - r; c.vx = -Math.abs(c.vx) * 0.3; }
  }
  // 가까운 캡슐끼리만 비교 (격자 칸 나누기) → 캡슐이 많아도 빠름
  const R2 = L.R * 2, cell = R2, cols = Math.ceil(W / cell) + 2;
  for (let it = 0; it < 3; it++) {
    const grid = new Map();
    for (let i = 0; i < live.length; i++) {
      const c = live[i];
      const key = (Math.floor(c.y / cell) + 4) * cols + Math.floor(c.x / cell) + 1;
      let arr = grid.get(key); if (!arr) grid.set(key, arr = []); arr.push(i);
    }
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      const gx = Math.floor(a.x / cell) + 1, gy = Math.floor(a.y / cell) + 4;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const arr = grid.get((gy + oy) * cols + gx + ox);
        if (!arr) continue;
        for (const j of arr) {
          if (j <= i) continue;
          const b = live[j];
          // 같은 층끼리는 꽉 부딪히고, 옆 층끼리는 절반만 → 앞뒤로 겹쳐 보임. 두 층 이상 떨어지면 통과
          const dl = Math.abs(a.li - b.li);
          if (dl > 1) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const min = (rOf(a) + rOf(b)) * (dl === 0 ? 0.97 : 0.5);
          const d2 = dx * dx + dy * dy;
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
  const key = String(ci);
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
    // 안의 상품은 보이지 않음 (열어봐야 앎)
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
  const k = c.held ? (c.scale || 1) : zkOf(c);
  ctx.drawImage(sp, -s * k / 2, -s * k / 2, s * k, s * k);
  if (!c.held && c.z < 0.99) {                      // 뒤층일수록 어둡게 (깊이감)
    ctx.fillStyle = `rgba(18,20,26,${(1 - c.z) * 0.38})`;
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

// 끝으로 갈수록 가늘어지는 금속판 경로 (점 목록 + 폭 목록)
function taperPath(pts, ws) {
  const Lp = [], Rp = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b.x - a.x, ty = b.y - a.y; const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len;
    const nx = -ty, ny = tx, w = ws[i] / 2;
    Lp.push({ x: pts[i].x + nx * w, y: pts[i].y + ny * w });
    Rp.push({ x: pts[i].x - nx * w, y: pts[i].y - ny * w });
  }
  ctx.beginPath();
  ctx.moveTo(Lp[0].x, Lp[0].y);
  for (let i = 1; i < Lp.length; i++) ctx.lineTo(Lp[i].x, Lp[i].y);
  const e = pts[pts.length - 1];
  ctx.arc(e.x, e.y, ws[ws.length - 1] / 2, Math.atan2(Lp[Lp.length - 1].y - e.y, Lp[Lp.length - 1].x - e.x), Math.atan2(Rp[Rp.length - 1].y - e.y, Rp[Rp.length - 1].x - e.x));
  for (let i = Rp.length - 1; i >= 0; i--) ctx.lineTo(Rp[i].x, Rp[i].y);
  ctx.closePath();
}
const lerpP = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
function quadP(a, c, b, t) { const u = 1 - t; return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y }; }

// 집게발 하나 그리기 (k: -1 왼쪽, 1 오른쪽, 0 뒤쪽 가운데)
function drawProng(k, o, s, dark) {
  let sh, kn, tp, hook;
  if (k === 0) {
    const x = claw.x + claw.sway, y = claw.y;
    sh = { x, y: y + s * 0.07 }; kn = { x: x + s * 0.02, y: y + s * 0.45 }; tp = { x, y: y + s * 0.84 }; hook = { x: x - s * 0.01, y: y + s * 0.88 };
  } else {
    const g = prongGeo(k, o);
    sh = g.sh; kn = g.kn; tp = g.tp; hook = { x: g.tp.x - k * s * 0.11, y: g.tp.y + s * 0.04 };
  }
  // 경로: 어깨 → 팔꿈치(직선) → 손끝(안쪽으로 휜 곡선)
  const pts = [sh, lerpP(sh, kn, 0.5), kn];
  for (const t of [0.3, 0.55, 0.8, 1]) pts.push(quadP(kn, tp, hook, t));
  const ws = [0.13, 0.12, 0.11, 0.1, 0.09, 0.08, 0.075].map(v => v * s * (k === 0 ? 0.8 : 1));
  // 금속 그라데이션 (판의 폭 방향으로 반사)
  const mid = lerpP(sh, tp, 0.5);
  let dx = tp.x - sh.x, dy = tp.y - sh.y; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  const nx = -dy * s * 0.07, ny = dx * s * 0.07;
  const gr = ctx.createLinearGradient(mid.x - nx, mid.y - ny, mid.x + nx, mid.y + ny);
  if (dark) { gr.addColorStop(0, '#3a3e45'); gr.addColorStop(0.45, '#8c929b'); gr.addColorStop(1, '#30343a'); }
  else { gr.addColorStop(0, '#4e545d'); gr.addColorStop(0.35, '#f3f5f8'); gr.addColorStop(0.6, '#b3b9c2'); gr.addColorStop(1, '#3f444c'); }
  taperPath(pts, ws);
  ctx.fillStyle = gr; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = Math.max(1, s * 0.012); ctx.stroke();
  // 손끝 고무 패드
  const tipPts = pts.slice(-3);
  taperPath(tipPts, ws.slice(-3).map(w => w * 1.15));
  ctx.fillStyle = dark ? '#151618' : '#1d1e21'; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.beginPath(); ctx.arc(tipPts[1].x - (k || 1) * s * 0.012, tipPts[1].y - s * 0.012, s * 0.018, 0, Math.PI * 2); ctx.fill();
  // 관절 볼트
  const bolt = (p, r) => {
    ctx.fillStyle = '#25282d'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    const bg = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, 0, p.x, p.y, r * 0.8);
    bg.addColorStop(0, '#f5f7fa'); bg.addColorStop(1, '#6b717a');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.65, 0, Math.PI * 2); ctx.fill();
  };
  bolt(sh, s * 0.05);
  if (k !== 0) bolt(kn, s * 0.032);
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
  // ── 레일 (I빔)
  const x0 = L.d * 0.5, x1 = W - L.d * 0.5;
  const fg = ctx.createLinearGradient(0, ry - s * 0.06, 0, ry);
  fg.addColorStop(0, '#f1f3f6'); fg.addColorStop(1, '#8d939c');
  ctx.fillStyle = fg; ctx.fillRect(x0, ry - s * 0.06, x1 - x0, s * 0.045);
  ctx.fillStyle = '#6b717a'; ctx.fillRect(x0, ry - s * 0.015, x1 - x0, s * 0.03);
  const fb = ctx.createLinearGradient(0, ry + s * 0.015, 0, ry + s * 0.055);
  fb.addColorStop(0, '#c9ced5'); fb.addColorStop(1, '#5d636b');
  ctx.fillStyle = fb; ctx.fillRect(x0, ry + s * 0.015, x1 - x0, s * 0.04);
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(x0, ry + s * 0.055, x1 - x0, s * 0.025);
  // ── 이동 대차 (바퀴가 레일 위를 굴러감)
  const cx = claw.x, spin = cx / (s * 0.05);
  for (const k of [-1, 1]) {
    const wx = cx + k * s * 0.17, wy = ry - s * 0.1;
    ctx.fillStyle = '#1f2226'; ctx.beginPath(); ctx.arc(wx, wy, s * 0.055, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#9aa0a9'; ctx.lineWidth = s * 0.012;
    for (let i = 0; i < 3; i++) { const a = spin + i * Math.PI * 2 / 3; ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + Math.cos(a) * s * 0.04, wy + Math.sin(a) * s * 0.04); ctx.stroke(); }
    ctx.fillStyle = '#c3c8cf'; ctx.beginPath(); ctx.arc(wx, wy, s * 0.015, 0, Math.PI * 2); ctx.fill();
  }
  const bg = ctx.createLinearGradient(cx - s * 0.3, 0, cx + s * 0.3, 0);
  bg.addColorStop(0, '#2c3036'); bg.addColorStop(0.3, '#5c626b'); bg.addColorStop(0.55, '#7d838c'); bg.addColorStop(1, '#2a2d32');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(cx - s * 0.28, ry - s * 0.07, s * 0.56, s * 0.24, s * 0.03); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = s * 0.01;
  for (let i = 0; i < 4; i++) { const vx = cx - s * 0.2 + i * s * 0.05; ctx.beginPath(); ctx.moveTo(vx, ry + s * 0.0); ctx.lineTo(vx, ry + s * 0.1); ctx.stroke(); }
  ctx.fillStyle = '#ffcf33'; ctx.fillRect(cx + s * 0.08, ry + s * 0.02, s * 0.12, s * 0.035);   // 경고 라벨
  ctx.fillStyle = '#16181b'; ctx.beginPath(); ctx.ellipse(cx, ry + s * 0.17, s * 0.07, s * 0.02, 0, 0, Math.PI * 2); ctx.fill();
  // ── 강철 케이블 + 꼬불꼬불 전선
  const top = { x: cx, y: ry + s * 0.17 }, bot = { x, y: y - s * 0.4 };
  const cg = ctx.createLinearGradient(top.x - s * 0.02, 0, top.x + s * 0.02, 0);
  cg.addColorStop(0, '#5f656e'); cg.addColorStop(0.5, '#e9ecf0'); cg.addColorStop(1, '#5f656e');
  ctx.strokeStyle = cg; ctx.lineWidth = s * 0.032; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(bot.x, bot.y); ctx.stroke();
  ctx.setLineDash([s * 0.02, s * 0.025]); ctx.strokeStyle = 'rgba(40,44,50,.55)'; ctx.lineWidth = s * 0.012;
  ctx.beginPath(); ctx.moveTo(top.x - s * 0.006, top.y); ctx.lineTo(bot.x - s * 0.006, bot.y); ctx.stroke();
  ctx.setLineDash([]);
  // 전선 (나선)
  const len = Math.hypot(bot.x - top.x, bot.y - top.y), steps = Math.max(8, Math.floor(len / (s * 0.012)));
  ctx.strokeStyle = '#1b1c1f'; ctx.lineWidth = s * 0.016; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, px = top.x + (bot.x - top.x) * t + s * 0.07, py = top.y + (bot.y - top.y) * t;
    const wv = Math.sin(t * len / (s * 0.05) * Math.PI) * s * 0.035;
    if (i === 0) ctx.moveTo(px + wv, py); else ctx.lineTo(px + wv, py);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = s * 0.006; ctx.stroke();
  // ── 원근: 파고들면 작아지고(안쪽), 들어 올리면 커짐(앞쪽)
  ctx.save();
  ctx.translate(x, y); ctx.scale(dk, dk); ctx.translate(-x, -y);
  ctx.lineJoin = 'round';
  drawProng(0, o, s, true);   // 뒤쪽 가운데 발
  drawHousing(s, x, y);
  ctx.restore();
}

function drawSideProngs(s, o) {
  for (const k of [-1, 1]) drawProng(k, o, s, false);
}

function drawHousing(s, x, y) {
  // 솔레노이드 원통 (크롬, 홈 3줄)
  const top = y - s * 0.4, bot = y - s * 0.08, rw = s * 0.2;
  const hg = ctx.createLinearGradient(x - rw, 0, x + rw, 0);
  hg.addColorStop(0, '#454b53'); hg.addColorStop(0.22, '#c9ced5'); hg.addColorStop(0.38, '#ffffff'); hg.addColorStop(0.55, '#aab0b9'); hg.addColorStop(0.85, '#5b616a'); hg.addColorStop(1, '#3a3f46');
  ctx.fillStyle = hg; ctx.fillRect(x - rw, top, rw * 2, bot - top);
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = Math.max(1, s * 0.008);
  for (const f of [0.3, 0.45, 0.6]) { const yy = top + (bot - top) * f; ctx.beginPath(); ctx.moveTo(x - rw, yy); ctx.lineTo(x + rw, yy); ctx.stroke(); }
  ctx.fillStyle = '#a8e83c'; ctx.fillRect(x - rw, top + (bot - top) * 0.76, rw * 2, s * 0.022);   // 브랜드 띠
  // 윗뚜껑 (타원)
  const tg = ctx.createLinearGradient(x - rw, 0, x + rw, 0);
  tg.addColorStop(0, '#8e949c'); tg.addColorStop(0.4, '#f7f9fb'); tg.addColorStop(1, '#6c727a');
  ctx.fillStyle = tg; ctx.beginPath(); ctx.ellipse(x, top, rw, s * 0.045, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a2d32'; ctx.beginPath(); ctx.ellipse(x, top, s * 0.05, s * 0.015, 0, 0, Math.PI * 2); ctx.fill();
  // 허브판 (집게발이 달리는 판)
  const pg = ctx.createLinearGradient(x - s * 0.26, 0, x + s * 0.26, 0);
  pg.addColorStop(0, '#2b2f35'); pg.addColorStop(0.4, '#7b818a'); pg.addColorStop(1, '#25282d');
  ctx.fillStyle = pg;
  ctx.beginPath(); ctx.moveTo(x - s * 0.25, bot); ctx.lineTo(x + s * 0.25, bot); ctx.lineTo(x + s * 0.18, y + s * 0.05); ctx.lineTo(x - s * 0.18, y + s * 0.05); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x - s * 0.25, bot, s * 0.5, s * 0.012);
  for (const k of [-1, 1]) { ctx.fillStyle = '#c9ced5'; ctx.beginPath(); ctx.arc(x + k * s * 0.15, bot + s * 0.05, s * 0.018, 0, Math.PI * 2); ctx.fill(); }
  // 가운데 플런저
  const ug = ctx.createLinearGradient(x - s * 0.04, 0, x + s * 0.04, 0);
  ug.addColorStop(0, '#5d636b'); ug.addColorStop(0.5, '#eef1f4'); ug.addColorStop(1, '#5d636b');
  ctx.fillStyle = ug; ctx.fillRect(x - s * 0.035, y + s * 0.05, s * 0.07, s * 0.08);
  ctx.fillStyle = '#2a2d32'; ctx.beginPath(); ctx.ellipse(x, y + s * 0.13, s * 0.035, s * 0.012, 0, 0, Math.PI * 2); ctx.fill();
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
    if (Math.abs(c.x - x) >= rOf(c) * STOP) continue;
    if (!best || c.y - rOf(c) < best.y - rOf(best)) best = c;
  }
  return best;
}
function judge(x) {
  const c = findTarget(x);
  const z = zone();
  if (!c) return { kind: 'none', zone: z };
  const dx = x - c.x, off = Math.abs(dx) / rOf(c);
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
        const dx = c.x - claw.x, adx = Math.abs(dx), rc = rOf(c);
        if (adx < rc * STOP || adx > rc * 1.25) continue;
        if (c.y - rc > ty || c.y + rc < claw.y) continue;
        c.x += Math.sign(dx || 1) * (rc * 1.25 - adx) * 0.2;
        c.vy = Math.min(c.vy, 0);
      }
      const t = findTarget(claw.x);
      const pileTop = caps.reduce((m, c) => (!c.gone && !c.held && Math.abs(c.x - claw.x) < L.R * 1.6) ? Math.min(m, c.y - L.R) : m, L.floor);
      claw.depth = -0.1 * Math.max(0, Math.min(1, (ty - pileTop) / (L.R * 3)));
      const hit = (t && ty >= t.y - rOf(t) * 0.35) || ty >= L.floor - 3;
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
        if (claw.result.kind === 'ok') toast('잡았다!', 'ok');
        broadcastState();
      }
      break;
    }
    case 'close': {
      claw.t += h;
      const r = claw.result;
      // 잡을 때는 집게발 끝이 캡슐 옆면에 닿는 만큼만 오므림
      const grip = r.kind === 'ok' ? Math.max(0.12, Math.min(0.85, (rOf(r.cap) * 0.95 / L.clawS - 0.1) / 0.55)) : 0;
      claw.open = Math.max(grip, 1 - claw.t / 0.35);
      if (claw.t >= 0.55) {
        if (r.kind === 'ok') {
          claw.held = r.cap; r.cap.held = true; r.cap.vx = r.cap.vy = 0; r.cap.liftZ = zkOf(r.cap);
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
    claw.held.y = claw.y + (L.clawS * 0.9 - rOf(claw.held) * 0.75) * (1 + claw.depth);
    claw.held.scale = (1 + claw.depth) * (claw.held.liftZ || 1);
    claw.held.a += (0 - claw.held.a) * Math.min(1, h * 5);
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
  toast(r && r.kind === 'none' ? '빈손' : '빗나감', 'bad');
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

  const S = Math.min(W, H) * (isPrize ? 0.5 : 0.4);   // 당첨이면 더 크게
  cap3d.style.setProperty('--s', S + 'px');
  cap3d.style.setProperty('--c', col.c); cap3d.style.setProperty('--c2', col.c2); cap3d.style.setProperty('--c3', col.c3);
  prize3d.innerHTML = isPrize ? (p.img ? `<img class="photo" src="${p.img}">` : (p.emoji || '🎁')) : '💨';
  prize3d.classList.toggle('hasPhoto', !!(isPrize && p.img));
  document.getElementById('revealTitle').textContent = isPrize ? `${p.name} 당첨!` : '꽝!';
  document.getElementById('revealSub').textContent = isPrize ? (mode === 'demo' ? '시연 중이에요 · QR을 찍고 직접 해보세요' : (p.desc ? p.desc : '축하해요! 직원에게 화면을 보여주세요')) : '다음 기회에…';
  revealEl.classList.remove('burst', 'blank', 'on');
  revealEl.classList.toggle('blank', !isPrize);
  cap3d.classList.remove('open');
  revealEl.classList.add('show');

  const sx = c.x - S / 2, sy = c.y - S / 2, k = (L.R * 2 * (c.scale || 1)) / S;
  const ex = W / 2 - S / 2, ey = H * 0.44 - S / 2;
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
      if (isPrize) celebrate();
      if (mode === 'game') sendCtl({ type: 'result', ok: isPrize, title: isPrize ? `${p.name} 당첨!` : '꽝!', detail: isPrize ? (p.desc || '축하해요! 🎉') : '다음 기회에…', emoji: isPrize ? p.emoji : '💨', img: isPrize && p.img && p.img.length < 400000 ? p.img : '', judge: jd });
      // 당첨 화면은 열린 뒤 5초 유지 (시연 중에는 3.5초)
      setTimeout(endReveal, isPrize ? (mode === 'game' ? 5000 : 3500) : 2200);
    };
  };
}

// ---------- 당첨 축하 연출: 번쩍임 + 연속 불꽃 + 색종이 비 ----------
const FX_COLORS = ['#b6f24a', '#ffd447', '#ff6cc2', '#3d8bff', '#ffffff', '#ff8a3d', '#9ef0d6'];
function celebrate() {
  // 불꽃: 여러 곳에서 연달아 터짐
  const spots = [[0.5, 0.42], [0.22, 0.25], [0.78, 0.25], [0.3, 0.6], [0.7, 0.6], [0.5, 0.18], [0.15, 0.45], [0.85, 0.45]];
  spots.forEach(([fx, fy], i) => setTimeout(() => { if (revealing) firework(W * fx, H * fy, i === 0 ? 70 : 42); }, i * 420));
  // 색종이 비 (3초 동안 계속)
  let n = 0;
  const iv = setInterval(() => {
    if (!revealing || n > 160) { clearInterval(iv); return; }
    for (let k = 0; k < 6; k++, n++) confetti();
  }, 110);
  // 축하 소리 한 번 더
  setTimeout(() => { if (revealing) sound('fanfare'); }, 650);
}
function firework(x, y, count) {
  const m = Math.min(W, H);
  sound('pop');
  for (let i = 0; i < count; i++) {
    const s = document.createElement('div');
    s.className = 'spark';
    const size = m * (0.008 + Math.random() * 0.012);
    s.style.width = s.style.height = size + 'px';
    s.style.left = x + 'px'; s.style.top = y + 'px';
    const col = FX_COLORS[i % FX_COLORS.length];
    s.style.background = col; s.style.boxShadow = `0 0 ${size * 1.5}px ${col}`;
    revealEl.appendChild(s);
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.2, d = m * (0.16 + Math.random() * 0.2);
    s.animate([
      { transform: 'translate(-50%,-50%) scale(1.4)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d * 0.8}px), calc(-50% + ${Math.sin(a) * d * 0.8}px)) scale(1)`, opacity: 1, offset: 0.55 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d + d * 0.45}px)) scale(.2)`, opacity: 0 },
    ], { duration: 1300 + Math.random() * 500, easing: 'cubic-bezier(.15,.8,.3,1)', fill: 'forwards' }).onfinish = () => s.remove();
  }
}
function confetti() {
  const m = Math.min(W, H);
  const p = document.createElement('div');
  p.className = 'confetti';
  const w = m * (0.012 + Math.random() * 0.012);
  p.style.width = w + 'px'; p.style.height = w * (1.4 + Math.random()) + 'px';
  p.style.left = Math.random() * W + 'px';
  p.style.background = FX_COLORS[Math.floor(Math.random() * FX_COLORS.length)];
  if (Math.random() < 0.3) p.style.borderRadius = '50%';
  revealEl.appendChild(p);
  const drift = (Math.random() - 0.5) * m * 0.3, rot = (Math.random() - 0.5) * 1440;
  p.animate([
    { transform: 'translate(0, -5vh) rotate(0deg) rotateY(0deg)', opacity: 1 },
    { transform: `translate(${drift}px, ${H * 1.08}px) rotate(${rot}deg) rotateY(${rot * 2}deg)`, opacity: 0.9 },
  ], { duration: 2400 + Math.random() * 1800, easing: 'cubic-bezier(.3,.1,.6,1)', fill: 'forwards' }).onfinish = () => p.remove();
}

function endReveal() {
  revealEl.classList.remove('on', 'burst');
  setTimeout(() => {
    revealEl.querySelectorAll('.spark, .confetti').forEach(e => e.remove());
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
function toast(t, kind) { toastEl.textContent = t; toastEl.className = 'hud show ' + (kind || ''); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 1500); }
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
  const live = caps.filter(c => !c.gone && !c.held && c !== grabbing).sort((a, b) => a.li - b.li || a.y - b.y);
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
    whoosh: [[300, .05], [500, .05], [800, .08]], win: [[523, .1], [659, .1], [784, .1], [1047, .18], [784, .1], [1047, .45]], fanfare: [[784, .12], [988, .12], [1175, .12], [1568, .5]], pop: [[1400, .04], [700, .06]], blank: [[392, .15], [330, .3]], beep: [[880, .08]],
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
  if (window.QRCode) new QRCode(box, { text: link, width: 360, height: 360, correctLevel: QRCode.CorrectLevel.M });
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
  document.getElementById('optFill').checked = !!opts.autoFill;
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
      <div class="photoCol">
        <div class="thumb" title="사진 넣기">${p.img ? `<img src="${p.img}">` : esc(p.emoji || '🎁')}</div>
        <button class="pick">${p.img ? '사진 바꾸기' : '📷 사진 넣기'}</button>
        ${p.img ? '<button class="unpick">사진 빼기</button>' : ''}
      </div>
      <div class="info">
        <input data-k="name" value="${esc(p.name)}" placeholder="상품 이름" maxlength="24">
        <textarea data-k="desc" placeholder="상품 설명 (뽑았을 때 보여줘요)" maxlength="80" rows="2">${esc(p.desc || '')}</textarea>
      </div>
      <input data-k="emoji" value="${esc(p.emoji || '')}" placeholder="🎁" maxlength="4" title="사진이 없을 때 보여줄 이모지">
      <input data-k="count" type="number" min="0" max="60" value="${p.count}">
      <button class="del" title="삭제">✕</button>`;
    const pick = () => { pickFor = i; filePick.value = ''; filePick.click(); };
    row.querySelector('.thumb').onclick = pick;
    row.querySelector('.pick').onclick = pick;
    const un = row.querySelector('.unpick');
    if (un) un.onclick = () => { p.img = ''; renderDraft(); };
    row.querySelectorAll('input, textarea').forEach(inp => inp.oninput = () => {
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
      // 원본 비율 유지, 긴 쪽 640px로 줄여 저장 (개봉 연출에서 선명하게)
      const max = 640, k = Math.min(1, max / Math.max(im.width, im.height));
      const c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      const cx = c.getContext('2d');
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
      cx.imageSmoothingQuality = 'high';
      cx.drawImage(im, 0, 0, c.width, c.height);
      draft[pickFor].img = c.toDataURL('image/jpeg', 0.86);
      renderDraft();
    };
    im.src = reader.result;
  };
  reader.readAsDataURL(f);
};
document.getElementById('openSettings').onclick = openSettings;
document.getElementById('cancelSettings').onclick = () => modal.classList.remove('show');
document.getElementById('addPrize').onclick = () => { draft.push({ name: '새 상품', emoji: '🎁', img: '', desc: '', count: 3 }); renderDraft(); listEl.scrollTop = listEl.scrollHeight; };
document.getElementById('resetPrizes').onclick = () => { if (confirm('기본 상품으로 되돌릴까요?')) { draft = structuredClone(DEFAULT_PRIZES); renderDraft(); } };
document.getElementById('saveSettings').onclick = () => {
  const clean = draft.filter(p => String(p.name).trim());
  if (!clean.length) { alert('상품을 하나 이상 넣어주세요.'); return; }
  prizes = clean.map(p => ({ ...p, name: String(p.name).trim() }));
  opts.blank = Math.max(0, Math.min(100, Number(document.getElementById('optBlank').value) || 0));
  opts.autoFill = document.getElementById('optFill').checked;
  opts.diff = Number(document.getElementById('optDiff').value);
  opts.playTime = Number(document.getElementById('optTime').value);
  if (!save(PRIZE_KEY, prizes)) alert('저장 공간이 부족해요. 사진 수를 줄여주세요.');
  save(OPT_KEY, opts);
  spriteCache.clear();
  modal.classList.remove('show');
  claw.held = null; claw.phase = 'ready';
  resize(); claw.y = L.restY;
  refill();
};

// ------------------------------------------------------------------
// 시작
// ------------------------------------------------------------------
applyOrientation();
claw.x = W / 2; claw.y = L.restY;
if (document.fonts) Promise.all([document.fonts.load('300 40px "Pretendard Variable"'), document.fonts.load('700 40px "Pretendard Variable"')]).then(() => { bgCanvas = makeBackground(); }).catch(() => {});
refill();
setupQR();
connect();
requestAnimationFrame(loop);
window.__cap = { claw, caps: () => caps, pressGrab, startPlay, evaluateGrab, L: () => L, enterGame, enterDemo, input, get mode() { return mode; } };
})();

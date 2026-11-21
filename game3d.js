// ===================== 3D 인형뽑기 (PC 화면) =====================
// 렌더링: Three.js / 물리: cannon-es
// 결과는 확률이 아니라 "집게가 인형을 어떻게 잡았는지"로 결정됩니다.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ------------------------------------------------------------------
// 설정 / 저장
// ------------------------------------------------------------------
const DEFAULT_PRIZES = [
  { name: '곰돌이', emoji: '🧸', img: '', count: 5, size: 'M' },
  { name: '토끼', emoji: '🐰', img: '', count: 5, size: 'M' },
  { name: '고양이', emoji: '🐱', img: '', count: 4, size: 'S' },
  { name: '펭귄', emoji: '🐧', img: '', count: 4, size: 'S' },
  { name: '유니콘', emoji: '🦄', img: '', count: 2, size: 'L' },
];
const DEFAULT_OPTS = { strength: 0.95, playTime: 30 };
const PRIZE_KEY = 'claw3d.prizes.v1', OPT_KEY = 'claw3d.opts.v1', HIST_KEY = 'claw.history.v1';

const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

let prizes = load(PRIZE_KEY, null);
if (!Array.isArray(prizes) || !prizes.length) prizes = structuredClone(DEFAULT_PRIZES);
let opts = { ...DEFAULT_OPTS, ...load(OPT_KEY, {}) };
let history = load(HIST_KEY, []);

const SIZE_R = { S: 0.052, M: 0.064, L: 0.078 };      // 몸통 반지름 (m)
const SIZE_MASS = { S: 0.12, M: 0.2, L: 0.32 };
const PALETTE = [0xff9ec7, 0x9fd8ff, 0xffe08a, 0xb9f5c9, 0xd7b8ff, 0xffc29e, 0xa8f0ff, 0xffb3b3];

// ------------------------------------------------------------------
// 기계 치수 (단위: m, +z = 플레이어 쪽(앞), +x = 오른쪽)
// ------------------------------------------------------------------
const HALF_W = 0.40, HALF_D = 0.30, TOP_Y = 1.0;
const CHUTE = { x0: -HALF_W, x1: -0.19, z0: 0.09, z1: HALF_D, wallH: 0.17 };
const HOME = { x: (CHUTE.x0 + CHUTE.x1) / 2, z: (CHUTE.z0 + CHUTE.z1) / 2 };
const CLAW_TOP = 0.5;                       // 집게 머리 대기 높이
const LIM = { x0: -HALF_W + 0.07, x1: HALF_W - 0.07, z0: -HALF_D + 0.07, z1: HALF_D - 0.07 };
const MOVE_SPEED = 0.2, DROP_SPEED = 0.26, RISE_SPEED = 0.22, RETURN_SPEED = 0.17;

// 집게발 형상 (집게 머리 중심 기준, r=바깥쪽, y=아래로 음수)
const PRONG = { pivotR: 0.03, pivotY: -0.03, L1: 0.07, L2: 0.062, bend: 0.62, open: 0.78, closed: -0.08, tipR: 0.011 };

// ------------------------------------------------------------------
// 렌더러 / 씬
// ------------------------------------------------------------------
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1c1236);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 20);
const CAMS = {
  front: { pos: new THREE.Vector3(0, 0.62, 1.08), look: new THREE.Vector3(0, 0.25, 0), label: '📷 정면' },
  side: { pos: new THREE.Vector3(1.15, 0.6, 0.04), look: new THREE.Vector3(0, 0.25, 0), label: '📷 옆면' },
  corner: { pos: new THREE.Vector3(0.75, 0.78, 0.82), look: new THREE.Vector3(0, 0.18, 0), label: '📷 대각선' },
};
const CAM_ORDER = ['front', 'side', 'corner'];
let camName = 'front';
camera.position.copy(CAMS.front.pos);
const camLook = CAMS.front.look.clone();

// 조명: 실제 기계처럼 천장 조명이 바로 위에서 비춰 집게 그림자가 아래로 떨어짐
scene.add(new THREE.HemisphereLight(0xfff0ff, 0x30204a, 0.55));
const topLight = new THREE.DirectionalLight(0xffffff, 2.2);
topLight.position.set(0.02, 2.2, 0.04);
topLight.target.position.set(0, 0, 0);
topLight.castShadow = true;
topLight.shadow.mapSize.set(2048, 2048);
Object.assign(topLight.shadow.camera, { left: -0.5, right: 0.5, top: 0.4, bottom: -0.4, near: 0.5, far: 3 });
topLight.shadow.bias = -0.0005;
topLight.shadow.normalBias = 0.01;
scene.add(topLight, topLight.target);
const fill = new THREE.PointLight(0xff7ac0, 0.8, 4);
fill.position.set(-1.2, 1.0, 1.5);
scene.add(fill);
const fill2 = new THREE.PointLight(0x7ab8ff, 0.6, 4);
fill2.position.set(1.4, 0.8, 1.2);
scene.add(fill2);

// ------------------------------------------------------------------
// 물리 월드
// ------------------------------------------------------------------
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
world.solver.iterations = 14;
const matPlush = new CANNON.Material('plush');
const matStatic = new CANNON.Material('static');
const matClaw = new CANNON.Material('claw');
world.addContactMaterial(new CANNON.ContactMaterial(matPlush, matPlush, { friction: 0.55, restitution: 0.02 }));
world.addContactMaterial(new CANNON.ContactMaterial(matPlush, matStatic, { friction: 0.45, restitution: 0.04 }));
world.addContactMaterial(new CANNON.ContactMaterial(matPlush, matClaw, { friction: 0.3, restitution: 0.0 }));

const G_PLUSH = 1, G_CLAW = 2, G_HELD = 4, G_STATIC = 8;

function staticBox(hx, hy, hz, x, y, z) {
  const b = new CANNON.Body({ mass: 0, material: matStatic, collisionFilterGroup: G_STATIC, collisionFilterMask: G_PLUSH | G_HELD });
  b.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
  b.position.set(x, y, z);
  world.addBody(b);
  return b;
}

// ------------------------------------------------------------------
// 기계 만들기 (보이는 부분 + 충돌체)
// ------------------------------------------------------------------
const mats = {
  floor: new THREE.MeshStandardMaterial({ color: 0xff8fc0, roughness: 0.85 }),
  cabinet: new THREE.MeshStandardMaterial({ color: 0xff4f98, roughness: 0.35, metalness: 0.1 }),
  cabinetDark: new THREE.MeshStandardMaterial({ color: 0xb02a66, roughness: 0.5 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xe8e8f2, roughness: 0.15, metalness: 1 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x9aa0b4, roughness: 0.3, metalness: 0.9 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }),
  acrylic: new THREE.MeshPhysicalMaterial({ color: 0xcfe8ff, roughness: 0.05, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }),
  hole: new THREE.MeshStandardMaterial({ color: 0x0c0618, roughness: 1 }),
  trim: new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.3, metalness: 0.4 }),
};

function mesh(geo, mat, x, y, z, { shadow = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = receive;
  scene.add(m);
  return m;
}

function buildMachine() {
  const fw = 0.04; // 기둥 두께
  // 바닥 (출구 부분 제외)
  const fA = { x0: CHUTE.x1, x1: HALF_W, z0: -HALF_D, z1: HALF_D };
  const fB = { x0: -HALF_W, x1: CHUTE.x1, z0: -HALF_D, z1: CHUTE.z0 };
  for (const f of [fA, fB]) {
    const w = f.x1 - f.x0, d = f.z1 - f.z0;
    mesh(new THREE.BoxGeometry(w, 0.04, d), mats.floor, (f.x0 + f.x1) / 2, -0.02, (f.z0 + f.z1) / 2, { shadow: false });
    staticBox(w / 2, 0.05, d / 2, (f.x0 + f.x1) / 2, -0.05, (f.z0 + f.z1) / 2);
  }
  // 출구 구멍(어두운 통로)
  const cw = CHUTE.x1 - CHUTE.x0, cd = CHUTE.z1 - CHUTE.z0;
  mesh(new THREE.BoxGeometry(cw, 0.02, cd), mats.hole, (CHUTE.x0 + CHUTE.x1) / 2, -0.42, (CHUTE.z0 + CHUTE.z1) / 2, { shadow: false });
  staticBox(cw / 2, 0.05, cd / 2, (CHUTE.x0 + CHUTE.x1) / 2, -0.5, (CHUTE.z0 + CHUTE.z1) / 2);
  // 출구 안쪽 어두운 벽
  mesh(new THREE.BoxGeometry(0.005, 0.4, cd), mats.hole, CHUTE.x1, -0.2, (CHUTE.z0 + CHUTE.z1) / 2, { shadow: false });
  mesh(new THREE.BoxGeometry(cw, 0.4, 0.005), mats.hole, (CHUTE.x0 + CHUTE.x1) / 2, -0.2, CHUTE.z0, { shadow: false });

  // 출구 아크릴 칸막이 (인형이 굴러 들어가지 않게)
  const t = 0.006;
  mesh(new THREE.BoxGeometry(t, CHUTE.wallH, cd), mats.acrylic, CHUTE.x1, CHUTE.wallH / 2, (CHUTE.z0 + CHUTE.z1) / 2, { shadow: false });
  mesh(new THREE.BoxGeometry(cw, CHUTE.wallH, t), mats.acrylic, (CHUTE.x0 + CHUTE.x1) / 2, CHUTE.wallH / 2, CHUTE.z0, { shadow: false });
  mesh(new THREE.BoxGeometry(t * 2.5, 0.012, cd + 0.01), mats.trim, CHUTE.x1, CHUTE.wallH, (CHUTE.z0 + CHUTE.z1) / 2);
  mesh(new THREE.BoxGeometry(cw, 0.012, t * 2.5), mats.trim, (CHUTE.x0 + CHUTE.x1) / 2, CHUTE.wallH, CHUTE.z0);
  staticBox(0.006, CHUTE.wallH / 2, cd / 2, CHUTE.x1, CHUTE.wallH / 2, (CHUTE.z0 + CHUTE.z1) / 2);
  staticBox(cw / 2, CHUTE.wallH / 2, 0.006, (CHUTE.x0 + CHUTE.x1) / 2, CHUTE.wallH / 2, CHUTE.z0);
  // 출구 안쪽 바닥(아래로 내려가는 통로) 벽 충돌체
  staticBox(0.01, 0.25, cd / 2, CHUTE.x1 + 0.01, -0.25, (CHUTE.z0 + CHUTE.z1) / 2);
  staticBox(cw / 2, 0.25, 0.01, (CHUTE.x0 + CHUTE.x1) / 2, -0.25, CHUTE.z0 - 0.01);

  // 보이지 않는 벽 (인형이 밖으로 나가지 않게) — 기계 외형은 그리지 않음
  staticBox(HALF_W, 1, 0.02, 0, 0.5, HALF_D + 0.02);
  staticBox(HALF_W, 1, 0.02, 0, 0.5, -HALF_D - 0.02);
  staticBox(0.02, 1, HALF_D, -HALF_W - 0.02, 0.5, 0);
  staticBox(0.02, 1, HALF_D, HALF_W + 0.02, 0.5, 0);

  // 바닥 받침(트레이) + 낮은 테두리
  mesh(new THREE.BoxGeometry(HALF_W * 2 + 0.04, 0.08, HALF_D * 2 + 0.04), mats.cabinetDark, 0, -0.08, 0, { shadow: false });
  const rimH = 0.025, rt = 0.012;
  mesh(new THREE.BoxGeometry(HALF_W * 2 - cw + rt, rimH, rt), mats.cabinet, (CHUTE.x1 + HALF_W) / 2, rimH / 2, HALF_D);
  mesh(new THREE.BoxGeometry(HALF_W * 2 + rt, rimH, rt), mats.cabinet, 0, rimH / 2, -HALF_D);
  mesh(new THREE.BoxGeometry(rt, rimH, HALF_D * 2), mats.cabinet, HALF_W, rimH / 2, 0);
  mesh(new THREE.BoxGeometry(rt, rimH, HALF_D * 2 - cd), mats.cabinet, -HALF_W, rimH / 2, (-HALF_D + CHUTE.z0) / 2);

  // 출구함: 바깥쪽 두 면도 아크릴로 막아서 상자 모양으로
  mesh(new THREE.BoxGeometry(t, CHUTE.wallH, cd), mats.acrylic, CHUTE.x0, CHUTE.wallH / 2, (CHUTE.z0 + CHUTE.z1) / 2, { shadow: false });
  mesh(new THREE.BoxGeometry(cw, CHUTE.wallH, t), mats.acrylic, (CHUTE.x0 + CHUTE.x1) / 2, CHUTE.wallH / 2, CHUTE.z1, { shadow: false });
  mesh(new THREE.BoxGeometry(t * 2.5, 0.012, cd + 0.01), mats.trim, CHUTE.x0, CHUTE.wallH, (CHUTE.z0 + CHUTE.z1) / 2);
  mesh(new THREE.BoxGeometry(cw, 0.012, t * 2.5), mats.trim, (CHUTE.x0 + CHUTE.x1) / 2, CHUTE.wallH, CHUTE.z1);
  const label = mesh(new THREE.PlaneGeometry(cw * 0.8, cw * 0.2), new THREE.MeshBasicMaterial({ map: makeTextTexture('▼ 출구', '#ffd23f', 'rgba(0,0,0,0)', 256, 64), transparent: true, toneMapped: false }), (CHUTE.x0 + CHUTE.x1) / 2, CHUTE.wallH * 0.55, CHUTE.z1 + 0.004, { shadow: false, receive: false });
  label.renderOrder = 3;
  // 출구함 바닥 구멍 테두리(빛나는 링)
  const glow = mesh(new THREE.BoxGeometry(cw - 0.01, 0.004, cd - 0.01), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.18, toneMapped: false }), (CHUTE.x0 + CHUTE.x1) / 2, -0.03, (CHUTE.z0 + CHUTE.z1) / 2, { shadow: false, receive: false });
  glow.renderOrder = 1;

  // 화면에 그리지 않는 오브젝트 (참조만 유지)
  ledMat = new THREE.MeshBasicMaterial({ color: 0xffd23f });
  bridge = new THREE.Object3D();
  carriage = new THREE.Object3D();
}
let ledMat, bridge, carriage;

function makeTextTexture(text, fg, bg, w, h, glow) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.font = `${Math.floor(h * 0.62)}px Jua, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (glow) { g.shadowColor = '#ffd23f'; g.shadowBlur = 24; }
  g.fillStyle = fg; g.fillText(text, w / 2, h / 2 + h * 0.04);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function makeBackTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#6a2fb0'); gr.addColorStop(1, '#2a1250');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  g.fillStyle = 'rgba(255,255,255,.12)';
  for (let y = 16; y < 512; y += 48) for (let x = (y / 48 % 2) * 24 + 12; x < 512; x += 48) { g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------
// 인형
// ------------------------------------------------------------------
let dolls = [];
const faceTexCache = new Map();
function faceTexture(p) {
  const key = p.img ? 'img:' + p.img.slice(-40) + p.img.length : 'e:' + (p.emoji || '🎁');
  if (faceTexCache.has(key)) return faceTexCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (p.img) {
    const im = new Image();
    im.onload = () => {
      g.save(); g.beginPath(); g.arc(128, 128, 124, 0, 7); g.clip();
      g.drawImage(im, 0, 0, 256, 256); g.restore();
      g.lineWidth = 8; g.strokeStyle = '#fff'; g.beginPath(); g.arc(128, 128, 122, 0, 7); g.stroke();
      t.needsUpdate = true;
    };
    im.src = p.img;
  } else {
    g.font = '200px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(p.emoji || '🎁', 128, 140);
  }
  faceTexCache.set(key, t);
  return t;
}

function spawnDoll(pi, x, y, z) {
  const p = prizes[pi];
  if (!p) return;
  const R = SIZE_R[p.size] || SIZE_R.M;
  const HR = R * 0.74, HY = R * 1.12;
  const color = PALETTE[pi % PALETTE.length];

  // 보이는 모양
  const g = new THREE.Group();
  const fur = new THREE.MeshPhysicalMaterial({ color, roughness: 1, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffffff) });
  const part = (geo, x, y, z, s = [1, 1, 1], m = fur) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(...s); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  part(new THREE.SphereGeometry(R, 24, 18), 0, 0, 0, [1, 1.02, 0.92]);
  part(new THREE.SphereGeometry(HR, 24, 18), 0, HY, 0);
  part(new THREE.SphereGeometry(R * 0.26, 12, 10), -HR * 0.62, HY + HR * 0.72, 0);
  part(new THREE.SphereGeometry(R * 0.26, 12, 10), HR * 0.62, HY + HR * 0.72, 0);
  part(new THREE.SphereGeometry(R * 0.32, 12, 10), -R * 0.88, R * 0.15, R * 0.22);
  part(new THREE.SphereGeometry(R * 0.32, 12, 10), R * 0.88, R * 0.15, R * 0.22);
  part(new THREE.SphereGeometry(R * 0.34, 12, 10), -R * 0.5, -R * 0.78, R * 0.35);
  part(new THREE.SphereGeometry(R * 0.34, 12, 10), R * 0.5, -R * 0.78, R * 0.35);
  const belly = part(new THREE.SphereGeometry(R * 0.6, 16, 12), 0, -R * 0.05, R * 0.55, [1, 1, 0.5], new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 1, sheen: 1 }));
  belly.castShadow = false;
  // 머리 앞쪽 곡면에 얼굴 붙이기
  const FA = 0.75;
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(HR * 1.012, 24, 24, Math.PI / 2 - FA, FA * 2, Math.PI / 2 - FA, FA * 2),
    new THREE.MeshStandardMaterial({ map: faceTexture(p), transparent: true, alphaTest: 0.08, roughness: 0.8 }));
  face.position.set(0, HY, 0);
  g.add(face);
  scene.add(g);

  // 물리 몸체: 몸통 구 + 머리 구
  const body = new CANNON.Body({
    mass: SIZE_MASS[p.size] || 0.2, material: matPlush,
    linearDamping: 0.25, angularDamping: 0.65,
    collisionFilterGroup: G_PLUSH, collisionFilterMask: G_PLUSH | G_CLAW | G_STATIC | G_HELD,
    allowSleep: true, sleepSpeedLimit: 0.04, sleepTimeLimit: 0.8,
  });
  body.addShape(new CANNON.Sphere(R), new CANNON.Vec3(0, 0, 0));
  body.addShape(new CANNON.Sphere(HR), new CANNON.Vec3(0, HY, 0));
  body.position.set(x, y, z);
  body.quaternion.setFromEuler(-0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.6);
  world.addBody(body);

  const d = { pi, R, HR, HY, mesh: g, body, won: false, gone: false, fade: 1 };
  body.userData = d;
  dolls.push(d);
  return d;
}

function removeDoll(d) {
  d.gone = true;
  world.removeBody(d.body);
  scene.remove(d.mesh);
  d.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); });
}

function randomPitPos() {
  // 출구 칸막이 근처를 피해서 위치 선택
  for (let i = 0; i < 30; i++) {
    const x = LIM.x0 + Math.random() * (LIM.x1 - LIM.x0);
    const z = LIM.z0 + Math.random() * (LIM.z1 - LIM.z0);
    if (x < CHUTE.x1 + 0.08 && z > CHUTE.z0 - 0.08) continue;
    return { x, z };
  }
  return { x: 0.15, z: -0.1 };
}

function refill() {
  dropHeld(true);
  for (const d of [...dolls]) if (!d.gone) removeDoll(d);
  dolls = [];
  const order = [];
  prizes.forEach((p, i) => { for (let k = 0; k < Math.min(p.count, 8); k++) order.push(i); });
  order.sort(() => Math.random() - 0.5);
  order.slice(0, 26).forEach((pi, n) => {
    const { x, z } = randomPitPos();
    spawnDoll(pi, x, 0.15 + n * 0.07, z);
  });
  // 미리 쌓이게 물리 계산을 빠르게 돌림
  for (let i = 0; i < 600; i++) world.step(1 / 120);
}

function topUp(pi) {
  const p = prizes[pi];
  if (!p) return;
  const onBoard = dolls.filter(d => d.pi === pi && !d.gone && !d.won).length;
  if (p.count > onBoard) {
    setTimeout(() => { const { x, z } = randomPitPos(); spawnDoll(pi, x, 0.75, z); }, 1500);
  }
}

// ------------------------------------------------------------------
// 집게 (보이는 모델 + 키네마틱 충돌체)
// ------------------------------------------------------------------
const claw = {
  x: HOME.x, z: HOME.z, y: CLAW_TOP,       // 머리 위치
  vx: 0, vz: 0,
  swayX: 0, swayZ: 0, swayVX: 0, swayVZ: 0, // 줄 흔들림
  angle: PRONG.open, prongAngles: [PRONG.open, PRONG.open, PRONG.open], prongTarget: [PRONG.closed, PRONG.closed, PRONG.closed],
  phase: 'ready', t: 0, timer: opts.playTime, playing: false,
  touched: false, sinkLeft: 0,
  held: null, constraint: null, slipAt: Infinity, liftT: 0,
  grip: null,
};
const stick = { x: 0, y: 0 };
const keyStick = { x: 0, y: 0 };

const clawGroup = new THREE.Group();
scene.add(clawGroup);
const cableGeo = new THREE.CylinderGeometry(0.0025, 0.0025, 1, 6);
cableGeo.translate(0, -0.5, 0);
const cable = new THREE.Mesh(cableGeo, new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 }));
cable.castShadow = true;
scene.add(cable);
{
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.042, 0.06, 24), mats.chrome);
  head.castShadow = true; clawGroup.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.036, 0.02, 24), mats.chrome);
  cap.position.y = 0.04; cap.castShadow = true; clawGroup.add(cap);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.005, 8, 24), mats.trim);
  ring.rotation.x = Math.PI / 2; ring.position.y = -0.02; clawGroup.add(ring);
}
const prongMeshes = [];
for (let i = 0; i < 3; i++) {
  const pg = new THREE.Group();
  const up = new THREE.Mesh(new THREE.BoxGeometry(0.012, PRONG.L1, 0.016), mats.steel);
  const lo = new THREE.Mesh(new THREE.BoxGeometry(0.01, PRONG.L2, 0.014), mats.steel);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), mats.chrome);
  [up, lo, tip].forEach(m => { m.castShadow = true; pg.add(m); });
  scene.add(pg);
  prongMeshes.push({ up, lo, tip });
}

// 키네마틱 충돌체: 머리 1개 + 집게발마다 팔꿈치·끝 2개
function kinBody(r) {
  const b = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: matClaw, collisionFilterGroup: G_CLAW, collisionFilterMask: G_PLUSH });
  if (r) b.addShape(new CANNON.Sphere(r));
  world.addBody(b);
  return b;
}
const headBody = kinBody(0.04);
const prongBodies = [0, 1, 2].map(() => ({ elbow: kinBody(0.012), mid: kinBody(0.011), tip: kinBody(PRONG.tipR) }));
const anchorBody = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
world.addBody(anchorBody);

const PRONG_DIRS = [0, 1, 2].map(i => { const a = i * Math.PI * 2 / 3 + Math.PI / 2; return { x: Math.cos(a), z: Math.sin(a) }; });

// 집게발 하나의 점들(머리 기준 로컬 → 월드)
function prongPoints(i, a, hx = claw.x + claw.swayX, hy = claw.y, hz = claw.z + claw.swayZ) {
  const d = PRONG_DIRS[i];
  const pr = PRONG.pivotR, py = PRONG.pivotY;
  const er = pr + PRONG.L1 * Math.sin(a), ey = py - PRONG.L1 * Math.cos(a);
  const fa = a - PRONG.bend;
  const tr = er + PRONG.L2 * Math.sin(fa), ty = ey - PRONG.L2 * Math.cos(fa);
  const w = (r, y) => new THREE.Vector3(hx + d.x * r, hy + y, hz + d.z * r);
  return { pivot: w(pr, py), elbow: w(er, ey), mid: w((er + tr) / 2, (ey + ty) / 2), tip: w(tr, ty) };
}

function setKin(body, v, h) {
  body.velocity.set((v.x - body.position.x) / h, (v.y - body.position.y) / h, (v.z - body.position.z) / h);
}

function driveKinematics(h) {
  const hx = claw.x + claw.swayX, hz = claw.z + claw.swayZ;
  setKin(headBody, { x: hx, y: claw.y, z: hz }, h);
  setKin(anchorBody, { x: hx, y: claw.y - 0.1, z: hz }, h);
  for (let i = 0; i < 3; i++) {
    const p = prongPoints(i, claw.prongAngles[i]);
    setKin(prongBodies[i].elbow, p.elbow, h);
    setKin(prongBodies[i].mid, p.mid, h);
    setKin(prongBodies[i].tip, p.tip, h);
  }
}

function syncClawVisual() {
  const hx = claw.x + claw.swayX, hz = claw.z + claw.swayZ;
  clawGroup.position.set(hx, claw.y, hz);
  bridge.position.z = claw.z;
  carriage.position.set(claw.x, 0.92, claw.z);
  const len = Math.max(0.01, 0.9 - (claw.y + 0.04));
  cable.position.set(claw.x, 0.9, claw.z);
  cable.scale.set(1, len, 1);
  cable.rotation.set(-(hz - claw.z) / len * 0.9, 0, (hx - claw.x) / len * 0.9);
  for (let i = 0; i < 3; i++) {
    const p = prongPoints(i, claw.prongAngles[i]);
    const m = prongMeshes[i];
    placeSeg(m.up, p.pivot, p.elbow);
    placeSeg(m.lo, p.elbow, p.tip);
    m.tip.position.copy(p.tip);
  }
}
const _up = new THREE.Vector3(0, 1, 0);
function placeSeg(m, a, b) {
  m.position.copy(a).add(b).multiplyScalar(0.5);
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  m.quaternion.setFromUnitVectors(_up, dir);
  // 집게발 면이 바깥을 보게 회전
}

// ------------------------------------------------------------------
// 인형 부위(몸통/머리)의 월드 위치
// ------------------------------------------------------------------
function dollParts(d) {
  const out = [];
  const b = d.body;
  for (let i = 0; i < b.shapes.length; i++) {
    const off = b.quaternion.vmult(b.shapeOffsets[i]);
    out.push({ d, idx: i, x: b.position.x + off.x, y: b.position.y + off.y, z: b.position.z + off.z, r: b.shapes[i].radius, isHead: i === 1 });
  }
  return out;
}
const liveDolls = () => dolls.filter(d => !d.gone && !d.won);

// ------------------------------------------------------------------
// 그립 판정 — 이 게임의 핵심. 결과의 "근거"를 계산합니다.
// ------------------------------------------------------------------
const SECURE = 0.6, LIFT = 0.2;

function evaluateGrip() {
  const hx = claw.x + claw.swayX, hz = claw.z + claw.swayZ;
  // 집게를 내린 상태에서의 집게발 끝 평균 높이
  let tipY = 0;
  for (let i = 0; i < 3; i++) tipY += prongPoints(i, PRONG.open).tip.y;
  tipY /= 3;

  let best = null, nearest = Infinity;
  for (const d of liveDolls()) {
    for (const p of dollParts(d)) {
      const dx = hx - p.x, dz = hz - p.z;
      const off = Math.hypot(dx, dz);
      nearest = Math.min(nearest, Math.max(0, off - p.r));
      if (off > p.r * 1.25) continue;
      // ① 정확도: 집게 중심이 부위 중심에 얼마나 가까운가 (반지름의 15% 이내면 만점)
      const acc = clamp01(1 - Math.max(0, off - p.r * 0.15) / (p.r * 0.95));
      // ② 깊이: 집게발 끝이 부위의 가장 넓은 곳(적도) 아래로 내려갔는가
      const depth = clamp01((p.y + p.r - tipY) / (p.r * 1.6));
      const s = acc * depth;
      if (s > 0 && (!best || s > best.acc * best.depth)) best = { p, dx, dz, off, acc, depth };
    }
  }
  if (!best) return { kind: 'none', nearest, tipY };

  const { p } = best;
  // ③ 방해: 위에 다른 인형이 눌러 있으면 들어올리기 어려움
  let covered = 0;
  for (const o of liveDolls()) {
    if (o === p.d) continue;
    let on = false;
    for (const q of dollParts(o)) {
      const hd = Math.hypot(q.x - p.x, q.z - p.z), dist = Math.hypot(hd, q.y - p.y);
      if (q.y > p.y + p.r * 0.35 && hd < (p.r + q.r) * 0.85 && dist < p.r + q.r + 0.012) on = true;
    }
    if (on) covered++;
  }
  const free = Math.max(0, 1 - 0.38 * covered);
  // ④ 크기: 집게 벌림 폭보다 크면 잘 안 감싸짐
  const openR = prongPoints(0, PRONG.open, 0, 0, 0).tip.length() ;
  const fit = clamp01(1.25 - (p.r / 0.087) * 0.5) ;
  const heavy = p.d.body.mass > 0.28 ? 0.9 : 1;
  const grip = Math.min(1, opts.strength * best.acc * best.depth * free * fit * heavy);
  return { kind: 'part', ...best, covered, free, fit, grip, tipY, openR };
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function describeOffset(dx, dz) {
  // dx>0: 집게가 인형보다 오른쪽 / dz>0: 집게가 인형보다 앞쪽(플레이어 쪽)
  const parts = [];
  if (Math.abs(dz) > 0.004) parts.push(dz > 0 ? '앞쪽' : '뒤쪽');
  if (Math.abs(dx) > 0.004) parts.push(dx > 0 ? '오른쪽' : '왼쪽');
  return parts.join('·');
}

// 닫힐 때 각 집게발이 인형에 닿아 멈추는 각도
function computeProngStops(target) {
  const stops = [];
  for (let i = 0; i < 3; i++) {
    let stop = PRONG.closed;
    if (target) {
      for (let a = PRONG.open; a >= PRONG.closed; a -= 0.02) {
        const pts = prongPoints(i, a);
        const hit = [pts.tip, pts.mid].some(v => Math.hypot(v.x - target.x, v.y - target.y, v.z - target.z) < target.r * 0.88 + PRONG.tipR);
        if (hit) { stop = a; break; }
      }
    }
    stops.push(stop);
  }
  return stops;
}

function attach(result) {
  const d = result.p.d;
  const b = d.body;
  b.wakeUp();
  // 잡은 지점: 집게 중심축이 인형 부위를 지나는 곳 → 중심에서 벗어나 잡으면 기울어져 매달림
  const gp = new CANNON.Vec3(claw.x + claw.swayX, Math.min(result.p.y + result.p.r * 0.3, claw.y - 0.1), claw.z + claw.swayZ);
  const local = b.pointToLocalFrame(gp);
  const c = new CANNON.PointToPointConstraint(anchorBody, new CANNON.Vec3(0, 0, 0), b, local, 60);
  world.addConstraint(c);
  b.collisionFilterGroup = G_HELD;
  b.collisionFilterMask = G_PLUSH | G_STATIC;
  b.angularDamping = 0.9;
  claw.held = d; claw.constraint = c;
}

function dropHeld(silent) {
  if (claw.constraint) world.removeConstraint(claw.constraint);
  if (claw.held) {
    const b = claw.held.body;
    b.collisionFilterGroup = G_PLUSH;
    b.collisionFilterMask = G_PLUSH | G_CLAW | G_STATIC | G_HELD;
    b.angularDamping = 0.65;
    b.wakeUp();
  }
  const had = !!claw.held;
  claw.held = null; claw.constraint = null; claw.slipAt = Infinity;
  if (had && !silent) sound('slip');
}

// ------------------------------------------------------------------
// 게임 진행
// ------------------------------------------------------------------
const PHASE_TEXT = { drop: '집게 내려가는 중…', close: '꽉!', rise: '올라가는 중…', return: '출구로 이동 중…', open: '두근두근…' };

function startPlay() {
  if (claw.phase !== 'ready') return;
  claw.phase = 'move'; claw.timer = opts.playTime; claw.playing = true;
  hideAnalysis();
  sound('coin');
  broadcastState();
}

function pressGrab() {
  if (claw.phase === 'ready') { startPlay(); return; }
  if (claw.phase !== 'move') return;
  claw.phase = 'drop'; claw.touched = false; claw.sinkLeft = 0.018;
  claw.vx = claw.vz = 0;
  sound('drop');
  broadcastState();
}

function stepGame(h) {
  // 줄 흔들림 (진자)
  const ax = claw.vx, az = claw.vz;
  claw.swayVX += (-60 * claw.swayX - 3.2 * claw.swayVX) * h;
  claw.swayVZ += (-60 * claw.swayZ - 3.2 * claw.swayVZ) * h;
  claw.swayX += claw.swayVX * h; claw.swayZ += claw.swayVZ * h;

  switch (claw.phase) {
    case 'ready':
    case 'move': {
      const sx = mode === 'demo' ? demoStick.x : (stick.x || keyStick.x), sy = mode === 'demo' ? demoStick.y : (stick.y || keyStick.y);
      if (claw.phase === 'ready' && (Math.abs(sx) > 0.2 || Math.abs(sy) > 0.2)) startPlay();
      if (claw.phase !== 'move') break;
      // 가속/감속이 있는 모터 움직임
      const tvx = sx * MOVE_SPEED, tvz = -sy * MOVE_SPEED;
      const k = 1 - Math.exp(-h * 9);
      const pvx = claw.vx, pvz = claw.vz;
      claw.vx += (tvx - claw.vx) * k; claw.vz += (tvz - claw.vz) * k;
      claw.swayVX -= (claw.vx - pvx) / h * 0.012 * h * 60;
      claw.swayVZ -= (claw.vz - pvz) / h * 0.012 * h * 60;
      claw.x = Math.max(LIM.x0, Math.min(LIM.x1, claw.x + claw.vx * h));
      claw.z = Math.max(LIM.z0, Math.min(LIM.z1, claw.z + claw.vz * h));
      if (claw.x === LIM.x0 || claw.x === LIM.x1) claw.vx = 0;
      if (claw.z === LIM.z0 || claw.z === LIM.z1) claw.vz = 0;
      claw.timer -= h;
      if (claw.timer <= 0) { claw.timer = 0; pressGrab(); }
      break;
    }
    case 'drop': {
      claw.y -= DROP_SPEED * h;
      // 집게 아래 인형 깨우기
      for (const d of liveDolls()) if (Math.hypot(d.body.position.x - claw.x, d.body.position.z - claw.z) < 0.2) d.body.wakeUp();
      if (!claw.touched && clawTouching()) { claw.touched = true; sendCtl({ type: 'fx', kind: 'touch' }); sound('touch'); }
      if (claw.touched) claw.sinkLeft -= DROP_SPEED * h;
      const tipY = prongPoints(0, PRONG.open).tip.y;
      if ((claw.touched && claw.sinkLeft <= 0) || tipY <= 0.012) {
        claw.phase = 'close'; claw.t = 0;
        claw.grip = evaluateGrip();
        claw.prongStart = [...claw.prongAngles];
        claw.prongTarget = computeProngStops(claw.grip.kind === 'part' && claw.grip.grip >= 0.05 ? claw.grip.p : null);
        sound('close');
        broadcastState();
      }
      break;
    }
    case 'close': {
      claw.t += h;
      const k = Math.min(1, claw.t / 0.7);
      for (let i = 0; i < 3; i++) claw.prongAngles[i] = claw.prongStart[i] + (claw.prongTarget[i] - claw.prongStart[i]) * easeInOut(k);
      if (claw.t >= 0.95) {
        const g = claw.grip;
        if (g.kind === 'part' && g.grip >= LIFT) {
          attach(g);
          // 그립이 약하면 들어 올리는 도중/이동 중 미끄러짐. 약할수록 빨리.
          claw.slipAt = g.grip >= SECURE ? Infinity : 0.35 + (g.grip - LIFT) / (SECURE - LIFT) * 4.2;
          sendCtl({ type: 'fx', kind: 'grab' });
        } else {
          // 잡지 못하면 집게발이 완전히 오므라듦
          claw.prongTarget = [PRONG.closed, PRONG.closed, PRONG.closed];
        }
        claw.phase = 'rise'; claw.liftT = 0;
        broadcastState();
      }
      break;
    }
    case 'rise': {
      claw.liftT += h;
      for (let i = 0; i < 3; i++) claw.prongAngles[i] += (claw.prongTarget[i] - claw.prongAngles[i]) * Math.min(1, h * 8);
      claw.y = Math.min(CLAW_TOP, claw.y + RISE_SPEED * h);
      checkSlip();
      if (claw.y >= CLAW_TOP) {
        claw.phase = 'return'; claw.t = 0;
        // 꼭대기에서 멈출 때 덜컹
        claw.swayVX += (Math.random() - 0.5) * 0.05; claw.swayVZ += (Math.random() - 0.5) * 0.05;
        broadcastState();
      }
      break;
    }
    case 'return': {
      claw.liftT += h;
      claw.t += h;
      if (claw.t > 0.35) {
        const dx = HOME.x - claw.x, dz = HOME.z - claw.z, dist = Math.hypot(dx, dz);
        const sp = RETURN_SPEED * Math.min(1, (claw.t - 0.35) * 2);
        const pvx = claw.vx, pvz = claw.vz;
        if (dist < 0.003) { claw.x = HOME.x; claw.z = HOME.z; claw.vx = claw.vz = 0; claw.phase = 'open'; claw.t = 0; broadcastState(); }
        else {
          const step = Math.min(dist, sp * h);
          claw.vx = dx / dist * sp; claw.vz = dz / dist * sp;
          claw.x += dx / dist * step; claw.z += dz / dist * step;
        }
        claw.swayVX -= (claw.vx - pvx) * 0.7; claw.swayVZ -= (claw.vz - pvz) * 0.7;
      }
      checkSlip();
      break;
    }
    case 'open': {
      claw.t += h;
      for (let i = 0; i < 3; i++) claw.prongAngles[i] += (PRONG.open - claw.prongAngles[i]) * Math.min(1, h * 6);
      if (claw.t > 0.15 && claw.held) dropHeld(true);
      if (claw.t > 1.6) endRound();
      break;
    }
  }
}

function checkSlip() {
  if (claw.held && claw.liftT >= claw.slipAt) {
    dropHeld();
    claw.slipped = true;
    for (let i = 0; i < 3; i++) claw.prongTarget[i] = Math.max(PRONG.closed, claw.prongTarget[i] - 0.15);
    sendCtl({ type: 'fx', kind: 'slip' });
  }
}

function clawTouching() {
  const pts = [{ x: claw.x, y: claw.y - 0.035, z: claw.z }];
  for (let i = 0; i < 3; i++) pts.push(prongPoints(i, claw.prongAngles[i]).tip);
  for (const d of liveDolls()) for (const p of dollParts(d)) for (const v of pts) {
    if (Math.hypot(v.x - p.x, v.y - p.y, v.z - p.z) < p.r + PRONG.tipR + 0.004) return true;
  }
  return false;
}

let roundWins = 0;
function endRound() {
  const g = claw.grip;
  const won = roundWins > 0;
  if (mode === 'game') showAnalysis(g, won, claw.slipped);
  demo.wait = 1.5;
  claw.phase = 'ready'; claw.playing = false; claw.timer = opts.playTime; claw.slipped = false; roundWins = 0;
  claw.prongAngles = [PRONG.open, PRONG.open, PRONG.open];
  broadcastState();
}

const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

// ------------------------------------------------------------------
// 결과 분석 표시 (근거)
// ------------------------------------------------------------------
const analysisEl = document.getElementById('analysis');
let analysisTimer;
function buildAnalysis(g, won, slipped) {
  if (!g) return null;
  if (g.kind === 'none') {
    const cm = isFinite(g.nearest) ? (g.nearest * 100).toFixed(1) : '?';
    return { ok: won, title: won ? '🎉 당첨!' : '😅 빈손', detail: `집게 아래에 인형이 없었어요. 가장 가까운 인형까지 ${cm}cm 떨어져 있었어요.`, bars: null };
  }
  const name = (prizes[g.p.d.pi] || {}).name || '인형';
  const where = g.p.isHead ? '머리' : '몸통';
  const offCm = (g.off * 100).toFixed(1);
  const dir = describeOffset(g.dx, g.dz);
  const lines = [];
  lines.push(g.off < g.p.r * 0.15 ? `${name}의 ${where} 정중앙을 잡았어요.` : `${name}의 ${where} 중심에서 집게가 ${dir}으로 ${offCm}cm 벗어났어요.`);
  if (g.depth < 0.7) lines.push('집게가 충분히 깊이 내려가지 못했어요 (인형 위쪽만 잡음).');
  if (g.covered) lines.push(`위에 다른 인형 ${g.covered}개가 눌러서 무거웠어요.`);
  if (g.fit < 0.85) lines.push('인형이 커서 집게가 다 감싸지 못했어요.');
  let title;
  if (won) title = '🎉 당첨!';
  else if (g.grip >= SECURE) title = '💪 꽉 잡았는데 출구를 빗나갔어요';
  else if (g.grip >= LIFT) title = slipped ? '😭 아깝다! 미끄러졌어요' : '😭 아깝다!';
  else title = '🙃 헛잡았어요';
  return {
    ok: won, title, detail: lines.join(' '),
    bars: [
      ['정확도', g.acc], ['깊이', g.depth], ['방해', g.free], ['그립', g.grip, SECURE],
    ],
  };
}
function showAnalysis(g, won, slipped) {
  const a = buildAnalysis(g, won, slipped);
  if (!a) return;
  let html = `<h3>${a.title}</h3><div class="detail">${a.detail}</div>`;
  if (a.bars) for (const [label, v, mark] of a.bars) {
    html += `<div class="bar ${mark ? 'total' : ''}"><span>${label}</span><div class="track"><div class="fill" style="width:${Math.round(v * 100)}%"></div>${mark ? `<div class="mark" style="left:${mark * 100}%" title="성공 기준"></div>` : ''}</div><span>${Math.round(v * 100)}%</span></div>`;
  }
  if (a.bars) html += `<div class="detail" style="margin:8px 0 0;font-size:13px">그립이 흰 선(${Math.round(SECURE * 100)}%)을 넘으면 끝까지 들고 와요. ${Math.round(LIFT * 100)}%~${Math.round(SECURE * 100)}%는 들었다가 미끄러져요.</div>`;
  analysisEl.innerHTML = html;
  analysisEl.classList.add('show');
  clearTimeout(analysisTimer);
  analysisTimer = setTimeout(hideAnalysis, 9000);
  sendCtl({ type: 'result', ok: a.ok, title: a.title, detail: a.detail, bars: a.bars, secure: SECURE });
}
function hideAnalysis() { analysisEl.classList.remove('show'); }

// ------------------------------------------------------------------
// 당첨 처리
// ------------------------------------------------------------------
const winEl = document.getElementById('win');
function checkWins(dt) {
  for (const d of dolls) {
    if (d.gone) continue;
    const p = d.body.position;
    if (!d.won && p.y < -0.12 && p.x < CHUTE.x1 && p.z > CHUTE.z0) {
      d.won = true;
      if (claw.held === d) dropHeld(true);
      onWin(d);
    }
    if (d.won) { d.fade -= dt; if (d.fade <= 0) removeDoll(d); }
    if (!d.won && p.y < -1) removeDoll(d); // 안전장치
  }
}
function onWin(d) {
  const p = prizes[d.pi];
  if (!p) return;
  if (mode === 'demo') {
    // 시연 중 당첨은 기록하지 않고 같은 인형을 다시 채움
    sound('win');
    setTimeout(() => { const { x, z } = randomPitPos(); spawnDoll(d.pi, x, 0.75, z); }, 1200);
    return;
  }
  roundWins++;
  p.count = Math.max(0, p.count - 1);
  save(PRIZE_KEY, prizes);
  history.unshift({ name: p.name, emoji: p.emoji, at: Date.now() });
  history = history.slice(0, 50);
  save(HIST_KEY, history);
  renderHistory();
  topUp(d.pi);
  document.getElementById('winIcon').innerHTML = p.img ? `<img src="${p.img}">` : (p.emoji || '🎁');
  document.getElementById('winName').textContent = p.name;
  winEl.classList.add('show');
  setTimeout(() => winEl.classList.remove('show'), 3500);
  sound('win');
  sendCtl({ type: 'fx', kind: 'win', name: p.name, emoji: p.emoji, img: p.img && p.img.length < 150000 ? p.img : '' });
  // 라운드가 이미 끝난 뒤 들어간 경우(굴러 들어감)
  if (claw.phase === 'ready' || claw.phase === 'move') { roundWins = 0; }
}
winEl.addEventListener('click', () => winEl.classList.remove('show'));

function renderHistory() {
  const ol = document.getElementById('historyList');
  ol.innerHTML = history.length ? '' : '<span class="sub">아직 없어요</span>';
  for (const h of history) {
    const li = document.createElement('li');
    const t = new Date(h.at);
    li.textContent = `${h.emoji || '🎁'} ${h.name} · ${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`;
    ol.appendChild(li);
  }
}

// ------------------------------------------------------------------
// HUD
// ------------------------------------------------------------------
const timerEl = document.getElementById('timer'), phaseEl = document.getElementById('phaseMsg'), hintEl = document.getElementById('hint');
function updateHud() {
  const moving = claw.phase === 'move';
  timerEl.style.display = moving ? 'block' : 'none';
  timerEl.textContent = Math.ceil(claw.timer);
  timerEl.classList.toggle('low', claw.timer < 6);
  const pt = PHASE_TEXT[claw.phase];
  phaseEl.style.display = pt ? 'block' : 'none';
  if (pt) phaseEl.textContent = pt;
  if (mode === 'demo') { timerEl.style.display = 'none'; phaseEl.style.display = 'none'; }
  if (mode === 'game' && claw.phase === 'ready') {
    hintEl.style.display = analysisEl.classList.contains('show') ? 'none' : 'block';
    hintEl.textContent = ctlConnected ? '🕹️ 조이스틱을 움직이면 시작!' : '⌨️ 방향키로 움직이면 시작!';
  } else hintEl.style.display = 'none';
}

// ------------------------------------------------------------------
// 시작 화면 / 시연(데모) 모드
// ------------------------------------------------------------------
let mode = 'demo';                 // 'demo' = 시작 화면에서 자동 시연, 'game' = 실제 플레이
const demoStick = { x: 0, y: 0 };
const demo = { target: null, wait: 1.0, aimT: 0, jitter: { x: 0, z: 0 } };
const startEl = document.getElementById('start');
const demoBadge = document.getElementById('demoBadge');
const cornerEl = document.getElementById('corner');

function pickDemoTarget() {
  // 위에 덮인 것 없는, 출구에서 너무 멀지 않은 인형 부위
  const parts = liveDolls().flatMap(dollParts).filter(p =>
    p.x > LIM.x0 + 0.02 && p.x < LIM.x1 - 0.02 && p.z > LIM.z0 + 0.02 && p.z < LIM.z1 - 0.02 &&
    !(p.x < CHUTE.x1 + 0.05 && p.z > CHUTE.z0 - 0.05));
  parts.sort((a, b) => (b.y - Math.hypot(b.x - HOME.x, b.z - HOME.z) * 0.3) - (a.y - Math.hypot(a.x - HOME.x, a.z - HOME.z) * 0.3));
  const top = parts.slice(0, 4);
  return top[Math.floor(Math.random() * top.length)] || null;
}

function updateDemo(dt) {
  if (mode !== 'demo') { demoStick.x = demoStick.y = 0; return; }
  if (claw.phase === 'ready') {
    demo.wait -= dt;
    if (demo.wait <= 0) {
      demo.target = pickDemoTarget();
      if (!demo.target) { demo.wait = 1; return; }
      // 시연도 가끔 빗나가게 (사람이 하는 것처럼)
      const miss = Math.random() < 0.35 ? 0.025 + Math.random() * 0.02 : Math.random() * 0.008;
      const a = Math.random() * Math.PI * 2;
      demo.jitter = { x: Math.cos(a) * miss, z: Math.sin(a) * miss };
      demo.aimT = 0;
      startPlay();
    }
    return;
  }
  if (claw.phase === 'move' && demo.target) {
    // 목표 부위의 현재 위치를 따라감
    const d = demo.target.d;
    const part = dollParts(d)[demo.target.idx];
    const tx = part.x + demo.jitter.x, tz = part.z + demo.jitter.z;
    const dx = tx - claw.x, dz = tz - claw.z, dist = Math.hypot(dx, dz);
    demo.aimT += dt;
    if (dist < 0.004 || demo.aimT > 9 || d.gone || d.won) {
      demoStick.x = demoStick.y = 0;
      if (Math.hypot(claw.vx, claw.vz) < 0.01) { demo.target = null; pressGrab(); }
    } else {
      const k = Math.min(1, dist / 0.06);
      demoStick.x = dx / dist * k; demoStick.y = -dz / dist * k;
    }
  }
}

function enterGame() {
  if (mode === 'game') return;
  mode = 'game';
  demoStick.x = demoStick.y = 0;
  startEl.classList.add('hide');
  demoBadge.style.display = 'none';
  resetClaw(); refill();
  broadcastState();
}
function enterDemo() {
  if (mode === 'demo') return;
  mode = 'demo';
  document.getElementById('settings').classList.remove('show');
  startEl.classList.remove('hide');
  demoBadge.style.display = '';
  hideAnalysis();
  resetClaw(); refill();
  demo.wait = 1.5;
}

// ------------------------------------------------------------------
// 카메라
// ------------------------------------------------------------------
function cycleCam() {
  camName = CAM_ORDER[(CAM_ORDER.indexOf(camName) + 1) % CAM_ORDER.length];
  document.getElementById('camLabel').textContent = CAMS[camName].label;
  sendCtl({ type: 'cam', name: CAMS[camName].label });
}
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // 화면이 좁으면 더 멀리서 보기
  // 가로로 놀이 영역(약 0.95m)이 다 들어오도록 세로 화각 계산
  const hHalf = Math.atan(0.52 / 1.05);
  const vfov = 2 * Math.atan(Math.tan(hHalf) / (w / h)) * 180 / Math.PI;
  camera.fov = Math.min(80, Math.max(50, vfov));
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ------------------------------------------------------------------
// 메인 루프
// ------------------------------------------------------------------
const H_STEP = 1 / 120;
let acc = 0, last = performance.now(), lastSent = 0, ledT = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  acc += dt;
  while (acc >= H_STEP) {
    stepGame(H_STEP);
    driveKinematics(H_STEP);
    world.step(H_STEP);
    acc -= H_STEP;
  }
  checkWins(dt);
  for (const d of dolls) {
    if (d.gone) continue;
    d.mesh.position.copy(d.body.position);
    d.mesh.quaternion.copy(d.body.quaternion);
    if (d.won) d.mesh.scale.setScalar(Math.max(0.01, d.fade));
  }
  syncClawVisual();
  // 카메라 부드럽게 이동
  const c = CAMS[camName];
  camera.position.lerp(c.pos, 1 - Math.exp(-dt * 4));
  camLook.lerp(c.look, 1 - Math.exp(-dt * 4));
  camera.lookAt(camLook);
  // LED 색 변화
  ledT += dt;
  ledMat.color.setHSL((ledT * 0.08) % 1, 0.9, 0.6);
  updateDemo(dt);
  updateHud();
  motorSound(claw.phase === 'move' ? Math.hypot(claw.vx, claw.vz) / MOVE_SPEED : (['drop', 'rise', 'return'].includes(claw.phase) ? 0.7 : 0));
  renderer.render(scene, camera);
  if (now - lastSent > 500) { lastSent = now; broadcastState(); }
  requestAnimationFrame(loop);
}
setInterval(() => { if (performance.now() - lastSent > 900) { lastSent = performance.now(); broadcastState(); } }, 1000);

// ------------------------------------------------------------------
// 소리
// ------------------------------------------------------------------
let actx, motorOsc, motorGain;
function audio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function sound(kind) {
  const a = audio(); if (!a) return;
  const seq = {
    coin: [[988, .08], [1319, .25]], drop: [[440, .1], [330, .15]], touch: [[200, .06]], close: [[150, .12], [120, .12]],
    slip: [[520, .1], [380, .1], [260, .25]], win: [[523, .12], [659, .12], [784, .12], [1047, .4]], beep: [[880, .1]],
  }[kind] || [[600, .1]];
  let t = a.currentTime;
  for (const [f, d] of seq) {
    const o = a.createOscillator(), g = a.createGain();
    o.type = kind === 'touch' || kind === 'close' ? 'triangle' : 'square';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0008, t + d);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + 0.02);
    t += d * 0.9;
  }
}
function motorSound(level) {
  if (!actx) return;
  if (!motorOsc) {
    motorOsc = actx.createOscillator(); motorGain = actx.createGain();
    motorOsc.type = 'sawtooth'; motorOsc.frequency.value = 70;
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
    motorOsc.connect(lp); lp.connect(motorGain); motorGain.connect(actx.destination);
    motorGain.gain.value = 0; motorOsc.start();
  }
  motorGain.gain.setTargetAtTime(level * 0.025, actx.currentTime, 0.05);
  motorOsc.frequency.setTargetAtTime(60 + level * 30, actx.currentTime, 0.1);
}

// ------------------------------------------------------------------
// 키보드 (PC 테스트용)
// ------------------------------------------------------------------
const held = new Set();
function updKeys() {
  keyStick.x = (held.has('ArrowRight') || held.has('KeyD') ? 1 : 0) - (held.has('ArrowLeft') || held.has('KeyA') ? 1 : 0);
  keyStick.y = (held.has('ArrowUp') || held.has('KeyW') ? 1 : 0) - (held.has('ArrowDown') || held.has('KeyS') ? 1 : 0);
}
addEventListener('keydown', (e) => {
  if (document.querySelector('.modal.show')) return;
  audio();
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) { held.add(e.code); updKeys(); e.preventDefault(); if (mode === 'demo') enterGame(); }
  if (e.code === 'Space') { e.preventDefault(); if (mode === 'demo') { enterGame(); return; } if (!e.repeat) pressGrab(); }
  if (e.code === 'KeyC' && !e.repeat) cycleCam();
  if (e.code === 'Escape') enterDemo();
});
addEventListener('keyup', (e) => { held.delete(e.code); updKeys(); });
addEventListener('pointerdown', () => audio(), { once: true });

// ------------------------------------------------------------------
// 네트워크 (인터넷 중계)
// ------------------------------------------------------------------
let room = sessionStorage.getItem('claw.room');
if (!room || room.length < 8) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  room = Array.from({ length: 8 }, () => A[Math.floor(Math.random() * A.length)]).join('');
  sessionStorage.setItem('claw.room', room);
}
let net, ctlConnected = false, ctlId = null, lastPing = 0, lastStickAt = 0;

function connect() {
  net = ClawNet.open(room, 'host', {
    onOpen: () => { if (!ctlConnected) setStatus('폰 연결 대기 중'); broadcastState(); },
    onClose: () => { if (!ctlConnected) setStatus('중계 서버 연결 중…'); },
    onMessage: (m) => {
      if (!m || !m.id) return;
      if (m.type === 'join' || (m.type === 'ping' && !ctlId)) {
        if (ctlId && ctlId !== m.id) sendCtl({ type: 'kicked', id: ctlId });
        ctlId = m.id; lastPing = performance.now();
        sendCtl({ type: 'joined', id: m.id, cam: CAMS[camName].label });
        if (!ctlConnected) sound('beep');
        setConnected(true); broadcastState();
        return;
      }
      if (m.id !== ctlId) return;
      lastPing = performance.now();
      if (!ctlConnected) setConnected(true);
      if (m.type === 'stick') { stick.x = clampS(m.x); stick.y = clampS(m.y); lastStickAt = performance.now(); }
      if (m.type === 'grab') pressGrab();
      if (m.type === 'cam') cycleCam();
    },
  });
  setInterval(() => {
    const now = performance.now();
    if (ctlConnected && now - lastPing > 9000) { setConnected(false); ctlId = null; }
    // 조이스틱 신호가 끊기면 멈춤 (손 뗀 신호 유실 대비)
    if ((stick.x || stick.y) && now - lastStickAt > 1500) { stick.x = stick.y = 0; }
  }, 500);
}
const clampS = (v) => Math.max(-1, Math.min(1, Number(v) || 0));
function sendCtl(m) { if (net) net.send(m); }
function broadcastState() {
  sendCtl({ type: 'state', phase: claw.phase, timer: Math.ceil(claw.timer), playing: claw.playing });
}
function setStatus(t) { document.getElementById('statusText').textContent = t; }
function setConnected(on) {
  const was = ctlConnected;
  ctlConnected = on;
  if (!on) stick.x = stick.y = 0;
  document.getElementById('dot').classList.toggle('on', on);
  setStatus(on ? '📱 폰 연결됨!' : '폰 연결 대기 중');
  cornerEl.classList.toggle('show', on);
  if (on && !was) enterGame();
  if (!on && was) enterDemo();
}

function setupQR() {
  const box = document.getElementById('qrBox');
  const base = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
  const link = `${base}controller.html?room=${room}`;
  document.getElementById('link').textContent = link;
  box.innerHTML = '';
  if (window.QRCode) new QRCode(box, { text: link, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M });
  else box.textContent = 'QR을 만들지 못했어요. 아래 주소를 폰에 직접 입력하세요.';
  if (/^(localhost|127\.|\[::1\])/.test(location.hostname)) {
    document.getElementById('link').textContent = link + '  ⚠ localhost 주소는 폰에서 열 수 없어요.';
  }
}

// ------------------------------------------------------------------
// 상품 설정 UI
// ------------------------------------------------------------------
const modal = document.getElementById('settings');
const listEl = document.getElementById('prizeList');
const filePick = document.getElementById('filePick');
let draft = [], pickFor = -1;
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function openSettings() {
  draft = structuredClone(prizes);
  document.getElementById('optStrength').value = String(opts.strength);
  document.getElementById('optTime').value = String(opts.playTime);
  renderDraft();
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
      <input data-k="count" type="number" min="0" max="99" value="${p.count}">
      <select data-k="size"><option value="S">작음</option><option value="M">보통</option><option value="L">큼</option></select>
      <button class="del" title="삭제">✕</button>`;
    row.querySelector('select').value = p.size || 'M';
    row.querySelector('.thumb').onclick = () => {
      if (p.img && confirm('사진을 지우고 이모지로 돌아갈까요?')) { p.img = ''; renderDraft(); return; }
      pickFor = i; filePick.value = ''; filePick.click();
    };
    row.querySelectorAll('input, select').forEach(inp => inp.oninput = () => {
      const k = inp.dataset.k;
      p[k] = k === 'count' ? Math.max(0, Math.min(99, Number(inp.value) || 0)) : inp.value;
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
      const c = document.createElement('canvas'); c.width = c.height = 160;
      const s = Math.min(im.width, im.height);
      c.getContext('2d').drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 160, 160);
      draft[pickFor].img = c.toDataURL('image/jpeg', 0.85);
      renderDraft();
    };
    im.src = reader.result;
  };
  reader.readAsDataURL(f);
};
document.getElementById('openSettings').onclick = openSettings;
document.getElementById('cancelSettings').onclick = () => modal.classList.remove('show');
document.getElementById('addPrize').onclick = () => { draft.push({ name: '새 상품', emoji: '🎁', img: '', count: 3, size: 'M' }); renderDraft(); listEl.scrollTop = listEl.scrollHeight; };
document.getElementById('resetPrizes').onclick = () => { if (confirm('기본 상품으로 되돌릴까요?')) { draft = structuredClone(DEFAULT_PRIZES); renderDraft(); } };
document.getElementById('saveSettings').onclick = () => {
  const clean = draft.filter(p => String(p.name).trim());
  if (!clean.length) { alert('상품을 하나 이상 넣어주세요.'); return; }
  prizes = clean.map(p => ({ ...p, name: String(p.name).trim() }));
  opts.strength = Number(document.getElementById('optStrength').value);
  opts.playTime = Number(document.getElementById('optTime').value);
  if (!save(PRIZE_KEY, prizes)) alert('저장 공간이 부족해요. 사진 수를 줄여주세요.');
  save(OPT_KEY, opts);
  faceTexCache.clear();
  modal.classList.remove('show');
  resetClaw(); refill();
};
document.getElementById('refill').onclick = () => { resetClaw(); refill(); };

function resetClaw() {
  dropHeld(true);
  Object.assign(claw, { x: HOME.x, z: HOME.z, y: CLAW_TOP, vx: 0, vz: 0, phase: 'ready', playing: false, timer: opts.playTime, prongAngles: [PRONG.open, PRONG.open, PRONG.open], slipped: false });
  roundWins = 0;
  hideAnalysis();
  // 키네마틱 몸체를 바로 제자리로
  headBody.position.set(claw.x, claw.y, claw.z);
  anchorBody.position.set(claw.x, claw.y - 0.1, claw.z);
  for (let i = 0; i < 3; i++) { const p = prongPoints(i, PRONG.open); for (const k of ['elbow', 'mid', 'tip']) prongBodies[i][k].position.set(p[k].x, p[k].y, p[k].z); }
}

// ------------------------------------------------------------------
// 시작
// ------------------------------------------------------------------
buildMachine();
resetClaw();
refill();
renderHistory();
setupQR();
connect();
resize();
document.getElementById('loading').remove();
requestAnimationFrame(loop);

// 디버그/테스트용
window.__claw = { world, renderer, scene, camera, claw, dolls: () => dolls, liveDolls, dollParts, evaluateGrip, pressGrab, startPlay, stick, cycleCam, prizes: () => prizes, SECURE, LIFT };

// ===================== 강동 청년회 럭키박스 · 단체 이벤트 (메인 게시판) =====================
// - 폰(event-play.html)은 닉네임으로 입장 → 자기 폰에서 뽑기 1회
// - 당첨/꽝은 여기서 결정: "남은 당첨 자리 ÷ 아직 안 뽑은 인원" 확률로 뽑아서 목표 비율에 맞춤
// - 모든 상태는 이 브라우저에 저장 (새로고침해도 유지)
(() => {
'use strict';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEY = 'lb.event.v1';
const newRoom = () => 'E' + Array.from({ length: 7 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
const pid = () => 'p' + Math.random().toString(36).slice(2, 9);

const DEFAULT = () => ({
  room: newRoom(), open: true, expected: 30, autoExp: true, ratio: 40,
  prizes: [
    { id: pid(), name: '음료 쿠폰', emoji: '🥤', img: '', desc: '', total: 5, left: 5 },
    { id: pid(), name: '스티커 세트', emoji: '⭐', img: '', desc: '', total: 4, left: 4 },
    { id: pid(), name: '곰돌이 키링', emoji: '🧸', img: '', desc: '', total: 2, left: 2 },
    { id: pid(), name: '1등 선물', emoji: '🎁', img: '', desc: '', total: 1, left: 1 },
  ],
  players: {},     // id → { nick, at, result: { win, pid, name, emoji, at } }
});
let S;
try { S = JSON.parse(localStorage.getItem(KEY)); } catch {}
if (!S || !S.room) S = DEFAULT();
function persist() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('⚠ 저장 공간이 부족해요 (사진 크기를 줄여주세요)'); } }
persist();

// ------------------------------------------------------------------
// 계산
// ------------------------------------------------------------------
const players = () => Object.entries(S.players).map(([id, p]) => ({ id, ...p }));
function stats() {
  const ps = players();
  const joined = ps.length;
  const done = ps.filter(p => p.result);
  const wins = done.filter(p => p.result.win).length;
  const totalStock = S.prizes.reduce((n, p) => n + p.total, 0);
  const stockLeft = S.prizes.reduce((n, p) => n + p.left, 0);
  const base = S.autoExp ? Math.max(S.expected, joined) : Math.max(S.expected, done.length + 1);
  const target = Math.min(totalStock, Math.round(base * S.ratio / 100));
  const slots = Math.max(0, Math.min(stockLeft, target - wins));
  const remain = Math.max(1, base - done.length);
  const p = Math.min(1, slots / remain);
  return { joined, played: done.length, wins, totalStock, stockLeft, base, target, slots, remain, p };
}

// 다음 사람의 결과 결정
function decide() {
  const st = stats();
  if (st.slots > 0 && Math.random() < st.p) {
    // 남은 수량에 비례해서 선물 고르기
    const pool = S.prizes.filter(p => p.left > 0);
    let r = Math.random() * pool.reduce((n, p) => n + p.left, 0);
    for (const p of pool) { r -= p.left; if (r < 0) return p; }
    return pool[pool.length - 1];
  }
  return null;
}

// ------------------------------------------------------------------
// 네트워크
// ------------------------------------------------------------------
let net;
function send(m) { if (net) net.send(m); }
function resultMsg(id) {
  const pl = S.players[id], r = pl.result;
  const pr = r.win ? (S.prizes.find(p => p.id === r.pid) || { name: r.name, emoji: r.emoji, img: '', desc: '' }) : null;
  return {
    win: r.win, nick: pl.nick, at: r.at,
    prize: pr ? { name: pr.name, emoji: pr.emoji, img: pr.img && pr.img.length < 400000 ? pr.img : '', desc: pr.desc || '' } : null,
  };
}
function cleanNick(n) { return String(n || '').replace(/\s+/g, ' ').trim().slice(0, 12); }
function uniqueNick(nick, selfId) {
  const taken = new Set(players().filter(p => p.id !== selfId).map(p => p.nick));
  if (!taken.has(nick)) return nick;
  for (let i = 2; ; i++) if (!taken.has(`${nick}${i}`)) return `${nick}${i}`;
}

function register(id, nick) {
  nick = uniqueNick(cleanNick(nick) || '참가자', id);
  S.players[id] = { nick, at: Date.now(), result: null };
  persist(); render();
  toast(`👋 ${nick} 님 입장`);
  return S.players[id];
}

function onMessage(m) {
  if (!m || !m.id || typeof m.id !== 'string' || m.id.length > 40) return;
  const id = m.id;
  if (m.type === 'hello') {
    let pl = S.players[id];
    if (pl) {
      if (pl.result) send({ type: 'welcome', id, nick: pl.nick, status: 'done', result: resultMsg(id) });
      else send({ type: 'welcome', id, nick: pl.nick, status: S.open ? 'ready' : 'closed' });
      return;
    }
    if (!S.open) { send({ type: 'welcome', id, status: 'closed' }); return; }
    if (stats().stockLeft <= 0) { send({ type: 'welcome', id, status: 'full' }); return; }
    pl = register(id, m.nick);
    send({ type: 'welcome', id, nick: pl.nick, status: 'ready' });
    return;
  }
  if (m.type === 'draw') {
    let pl = S.players[id];
    if (!pl) { if (!S.open) return; pl = register(id, m.nick); }
    if (!pl.result) {
      const prize = decide();
      if (prize) prize.left = Math.max(0, prize.left - 1);
      pl.result = prize ? { win: true, pid: prize.id, name: prize.name, emoji: prize.emoji, at: Date.now() } : { win: false, at: Date.now() };
      persist();
      render(id);
      if (prize) announce(pl.nick, prize); else toast(`🍀 ${pl.nick} 님 꽝!`);
    }
    send({ type: 'result', id, ...resultMsg(id) });
  }
}

function connect() {
  net = ClawNet.open(S.room, 'host', {
    onOpen: () => broadcast(),
    onMessage,
  });
  setInterval(broadcast, 3000);
}
function broadcast() { send({ type: 'board', open: S.open }); }

function setupQR() {
  const box = $('qrBox');
  const base = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
  const link = `${base}event-play.html?room=${S.room}`;
  box.innerHTML = '';
  if (window.QRCode) new QRCode(box, { text: link, width: 420, height: 420, correctLevel: QRCode.CorrectLevel.M });
  else box.textContent = link;
  box.title = link;
}

// ------------------------------------------------------------------
// 화면
// ------------------------------------------------------------------
function render(newId) {
  const st = stats();
  $('sJoined').textContent = st.joined;
  $('sPlayed').textContent = st.played;
  $('sWin').textContent = st.wins;
  $('sLeft').textContent = st.stockLeft;
  $('giftSum').textContent = `남은 ${st.stockLeft} / 전체 ${st.totalStock}`;
  const badge = $('stateBadge');
  badge.className = 'state ' + (S.open ? 'open' : 'closed');
  badge.textContent = S.open ? '참여 가능' : '참여 마감';

  $('prizes').innerHTML = S.prizes.map(p => `
    <div class="gift ${p.left <= 0 ? 'out' : ''}" data-id="${p.id}">
      <div class="ph">${p.img ? `<img src="${p.img}">` : esc(p.emoji || '🎁')}</div>
      <div class="nm">${esc(p.name)}</div>
      <div class="left"><span>남은 수량</span><span><b>${p.left}</b> / ${p.total}</span></div>
      <div class="bar"><i style="width:${p.total ? (p.left / p.total * 100) : 0}%"></i></div>
    </div>`).join('');

  const done = players().filter(p => p.result).sort((a, b) => b.result.at - a.result.at);
  const wins = done.filter(p => p.result.win), loses = done.filter(p => !p.result.win);
  $('winCount').textContent = `${wins.length}명`;
  $('loseCount').textContent = `${loses.length}명`;
  $('winners').innerHTML = wins.length ? wins.map(p => {
    const pr = S.prizes.find(x => x.id === p.result.pid);
    const th = pr && pr.img ? `<img src="${pr.img}">` : esc(p.result.emoji || '🎁');
    return `<li class="${p.id === newId ? 'new' : ''}"><span class="th">${th}</span><span class="who">${esc(p.nick)}</span><span class="what">${esc(pr ? pr.name : p.result.name)}</span></li>`;
  }).join('') : '<div class="empty">아직 당첨자가 없어요</div>';
  $('losers').innerHTML = loses.length ? loses.map(p => `<span class="${p.id === newId ? 'new' : ''}">${esc(p.nick)}</span>`).join('') : '<div class="empty">아직 없어요</div>';
}

// 당첨 발표 (여러 명이 동시에 당첨되면 순서대로)
const annQueue = [];
let annBusy = false;
function announce(nick, prize) {
  annQueue.push({ nick, prize });
  const el = document.querySelector(`.gift[data-id="${prize.id}"]`);
  if (el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  if (!annBusy) nextAnn();
}
function nextAnn() {
  const a = annQueue.shift();
  if (!a) { annBusy = false; return; }
  annBusy = true;
  $('annPh').innerHTML = a.prize.img ? `<img src="${a.prize.img}">` : esc(a.prize.emoji || '🎁');
  $('annWho').textContent = `🎉 ${a.nick} 님`;
  $('annWhat').textContent = `${a.prize.name} 당첨!`;
  const el = $('announce');
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  sound();
  let n = 0;
  const iv = setInterval(() => { for (let k = 0; k < 8; k++) confetti(); if (++n > 22) clearInterval(iv); }, 120);
  // 발표가 밀려 있으면 짧게 (평소 4.5초)
  setTimeout(() => { el.classList.remove('show'); setTimeout(nextAnn, 300); }, annQueue.length >= 2 ? 2200 : 4500);
}
const FX = ['#b6f24a', '#ffd447', '#ff6cc2', '#3d8bff', '#ffffff', '#ff8a3d'];
function confetti() {
  const p = document.createElement('div');
  p.className = 'confetti';
  const m = Math.min(innerWidth, innerHeight), w = m * (0.01 + Math.random() * 0.012);
  p.style.width = w + 'px'; p.style.height = w * 1.6 + 'px';
  p.style.left = Math.random() * innerWidth + 'px';
  p.style.background = FX[Math.floor(Math.random() * FX.length)];
  document.body.appendChild(p);
  const rot = (Math.random() - 0.5) * 1440;
  p.animate([{ transform: 'translateY(-5vh) rotate(0)' }, { transform: `translate(${(Math.random() - 0.5) * m * 0.3}px, 108vh) rotate(${rot}deg)` }],
    { duration: 2600 + Math.random() * 1600, easing: 'cubic-bezier(.3,.1,.6,1)', fill: 'forwards' }).onfinish = () => p.remove();
}
let actx;
addEventListener('pointerdown', () => { try { actx = actx || new AudioContext(); actx.resume(); } catch {} });
function sound() {
  if (!actx || actx.state !== 'running') return;
  let t = actx.currentTime;
  for (const [f, d] of [[523, .12], [659, .12], [784, .12], [1047, .2], [784, .1], [1047, .5]]) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.0008, t + d);
    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + .02); t += d * .9;
  }
}
let toastT;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2600); }

// ------------------------------------------------------------------
// 관리 (설정)
// ------------------------------------------------------------------
let draft = null, pickFor = -1;
function openAdmin() {
  draft = { expected: S.expected, autoExp: S.autoExp, ratio: S.ratio, open: S.open, prizes: structuredClone(S.prizes) };
  $('expected').value = draft.expected; $('autoExp').checked = draft.autoExp;
  $('ratio').value = draft.ratio; $('openChk').checked = draft.open;
  renderPList(); renderCalc();
  $('admin').classList.add('show');
}
function renderCalc() {
  draft.expected = Math.max(1, Number($('expected').value) || 1);
  draft.autoExp = $('autoExp').checked;
  draft.ratio = Number($('ratio').value);
  $('ratioVal').textContent = draft.ratio + '%';
  // 저장 전 값으로 미리 계산
  const keep = { expected: S.expected, autoExp: S.autoExp, ratio: S.ratio, prizes: S.prizes };
  Object.assign(S, { expected: draft.expected, autoExp: draft.autoExp, ratio: draft.ratio, prizes: previewPrizes() });
  const st = stats();
  Object.assign(S, keep);
  $('calc').innerHTML = `기준 인원 <b>${st.base}명</b> (입장 ${st.joined}명) × ${draft.ratio}% → 목표 당첨자 <b>${st.target}명</b> (선물 ${st.totalStock}개)<br>
    지금까지 뽑음 ${st.played}명 · 당첨 ${st.wins}명 · 남은 당첨 자리 <b>${st.slots}</b> · 아직 안 뽑은 인원 ${st.remain}명<br>
    👉 다음 사람의 당첨 확률 <b>${Math.round(st.p * 100)}%</b>`;
}
function previewPrizes() {
  return draft.prizes.map(p => {
    const old = S.prizes.find(o => o.id === p.id);
    const given = old ? old.total - old.left : 0;
    return { ...p, total: Math.max(0, p.total), left: Math.max(0, p.total - given) };
  });
}
function renderPList() {
  const list = $('plist');
  list.innerHTML = '';
  draft.prizes.forEach((p, i) => {
    const old = S.prizes.find(o => o.id === p.id);
    const given = old ? old.total - old.left : 0;
    const row = document.createElement('div');
    row.className = 'prow';
    row.innerHTML = `
      <div class="thumb" title="사진 넣기">${p.img ? `<img src="${p.img}">` : esc(p.emoji || '🎁')}</div>
      <div class="info">
        <input type="text" data-k="name" value="${esc(p.name)}" placeholder="선물 이름" maxlength="24">
        <textarea data-k="desc" rows="1" placeholder="설명 (당첨 화면에 표시)" maxlength="80">${esc(p.desc || '')}</textarea>
        <div class="hint">${given ? `이미 ${given}개 나감` : ''} ${p.img ? '<a href="#" class="unpick" style="color:#ff8a8a">사진 빼기</a>' : ''} <input type="text" data-k="emoji" value="${esc(p.emoji || '')}" maxlength="4" style="width:56px" title="사진 없을 때 이모지"></div>
      </div>
      <input type="number" data-k="total" min="0" max="999" value="${p.total}" title="전체 수량">
      <button class="del" title="삭제">✕</button>`;
    row.querySelector('.thumb').onclick = () => { pickFor = i; $('filePick').value = ''; $('filePick').click(); };
    const un = row.querySelector('.unpick'); if (un) un.onclick = (e) => { e.preventDefault(); p.img = ''; renderPList(); };
    row.querySelectorAll('[data-k]').forEach(inp => inp.oninput = () => {
      const k = inp.dataset.k;
      p[k] = k === 'total' ? Math.max(given, Math.min(999, Number(inp.value) || 0)) : inp.value;
      if (k === 'total') renderCalc();
    });
    row.querySelector('.del').onclick = () => {
      if (given && !confirm('이미 나간 선물이에요. 그래도 목록에서 뺄까요? (당첨 명단은 남아요)')) return;
      draft.prizes.splice(i, 1); renderPList(); renderCalc();
    };
    list.appendChild(row);
  });
}
$('filePick').onchange = () => {
  const f = $('filePick').files[0];
  if (!f || pickFor < 0) return;
  const rd = new FileReader();
  rd.onload = () => {
    const im = new Image();
    im.onload = () => {
      const max = 640, k = Math.min(1, max / Math.max(im.width, im.height));
      const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, c.width, c.height);
      draft.prizes[pickFor].img = c.toDataURL('image/jpeg', 0.86);
      renderPList();
    };
    im.src = rd.result;
  };
  rd.readAsDataURL(f);
};
['expected', 'autoExp', 'ratio'].forEach(id => $(id).addEventListener('input', renderCalc));
$('openAdmin').onclick = openAdmin;
$('closeAdmin').onclick = () => $('admin').classList.remove('show');
$('addP').onclick = () => { draft.prizes.push({ id: pid(), name: '새 선물', emoji: '🎁', img: '', desc: '', total: 1, left: 1 }); renderPList(); renderCalc(); };
$('saveAdmin').onclick = () => {
  renderCalc();
  S.expected = draft.expected; S.autoExp = draft.autoExp; S.ratio = draft.ratio; S.open = $('openChk').checked;
  S.prizes = previewPrizes().filter(p => String(p.name).trim());
  persist(); render(); broadcast();
  $('admin').classList.remove('show');
  toast('저장했어요');
};
$('csvBtn').onclick = () => {
  const rows = [['닉네임', '결과', '선물', '시간']];
  players().sort((a, b) => a.at - b.at).forEach(p => {
    const r = p.result;
    rows.push([p.nick, r ? (r.win ? '당첨' : '꽝') : '미참여', r && r.win ? r.name : '', r ? new Date(r.at).toLocaleString('ko-KR') : '']);
  });
  const csv = '﻿' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `럭키박스_명단_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
};
$('resetBtn').onclick = () => {
  if (!confirm('명단과 결과를 모두 지우고 새 행사를 시작할까요?\n(선물 목록은 그대로, 수량은 처음으로 돌아가고 QR이 바뀌어요)')) return;
  S.players = {};
  S.room = newRoom();
  S.prizes.forEach(p => { p.left = p.total; });
  persist();
  location.reload();
};

// ------------------------------------------------------------------
render();
setupQR();
connect();
window.__event = { S, stats, decide, onMessage };
})();

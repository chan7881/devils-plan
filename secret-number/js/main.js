/**
 * 시크릿 넘버 — DOM을 만지는 유일한 파일.
 * 계산은 전부 model.js와 ../../common/js/pieces.js가 한다.
 */
import {
  CARD_KINDS, CARD_LABELS, CARD_DESCRIPTIONS,
  assignNumbers, computeClue, scoreGuesses,
  initialTickets, canContact, spendTickets, TICKET_SET_COST,
} from './model.js';
import { PIECE_TABLES, distributePieces } from '../../common/js/pieces.js';

const STORE_KEY = 'devils-plan.secret-number.v1';
const $ = (id) => document.getElementById(id);

/* ── 상태 ─────────────────────────────────────────────────────── */

const defaultState = () => ({
  teamCount: 10,
  min: 1,
  max: 100,
  bucketSum: true,
  secrets: [],            // 팀별 고유번호 (아직 배정 전이면 빈 배열)
  tickets: [],            // 팀별 {add,mul,div,zero}
  pieces: [],             // 팀별 보유 피스 (티켓 추가 구입에 쓴다)
  boughtSet: [],          // 팀별 추가 구입 여부 (팀당 1회)
  log: [],                // 단서 기록
  guesses: [],            // guesses[i][j]
  masked: true,
  showLogDetail: false,
});

let state = load() || defaultState();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return (s && typeof s === 'object' && Array.isArray(s.secrets)) ? { ...defaultState(), ...s } : null;
  } catch (_) { return null; }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) { /* 사파리 비공개 모드 등 */ }
}

/** 팀 수가 바뀌면 팀별 배열들의 길이를 맞춘다 (기존 값은 살린다). */
function resizeTeams(n) {
  const keep = (arr, fill) => Array.from({ length: n }, (_, i) => (arr[i] !== undefined ? arr[i] : fill));
  state.teamCount = n;
  state.secrets = state.secrets.length ? keep(state.secrets, null) : [];
  state.tickets = keep(state.tickets.length ? state.tickets : initialTickets(n),
    Object.fromEntries(CARD_KINDS.map((k) => [k, 1])));
  state.pieces = keep(state.pieces, 0);
  state.boughtSet = keep(state.boughtSet, false);
  state.guesses = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (state.guesses[i] ?? [])[j] ?? null));
}

const teamName = (i) => `${i + 1}팀`;

/* ── 탭 ───────────────────────────────────────────────────────── */

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    document.querySelectorAll('.panel-page').forEach((p) => { p.hidden = true; });
    $(`page-${btn.dataset.page}`).hidden = false;
  });
});

/* ── ① 설정 ───────────────────────────────────────────────────── */

function renderSecrets() {
  const grid = $('secretGrid');
  grid.classList.toggle('masked', state.masked);
  $('secretMaskState').textContent = state.masked ? '(가려짐)' : '(보이는 중)';
  $('btnToggleMask').textContent = state.masked ? '번호 보기' : '번호 가리기';

  grid.innerHTML = '';
  for (let i = 0; i < state.teamCount; i++) {
    const cell = document.createElement('div');
    cell.className = 'secret-cell';
    const t = document.createElement('div');
    t.className = 'team';
    t.textContent = teamName(i);
    const n = document.createElement('div');
    n.className = 'num';
    const v = state.secrets[i];
    n.textContent = (v === undefined || v === null) ? '—' : String(v);
    cell.append(t, n);
    grid.append(cell);
  }
}

function renderManualInputs() {
  const grid = $('secretGrid');
  grid.classList.remove('masked');
  state.masked = false;
  grid.innerHTML = '';
  for (let i = 0; i < state.teamCount; i++) {
    const cell = document.createElement('div');
    cell.className = 'secret-cell';
    const t = document.createElement('div');
    t.className = 'team';
    t.textContent = teamName(i);
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.min = String(state.min);
    inp.max = String(state.max);
    inp.value = state.secrets[i] ?? '';
    inp.addEventListener('change', () => {
      const v = inp.value === '' ? null : Number(inp.value);
      state.secrets[i] = v;
      save();
      checkDuplicates();
    });
    cell.append(t, inp);
    grid.append(cell);
  }
  checkDuplicates();
}

function checkDuplicates() {
  const used = state.secrets.filter((v) => v !== null && v !== undefined);
  const dup = used.length !== new Set(used).size;
  const outOfRange = used.some((v) => v < state.min || v > state.max);
  const warn = $('setupWarn');
  if (dup) {
    warn.className = 'notice bad';
    warn.textContent = '같은 번호를 쓴 팀이 있습니다.';
  } else if (outOfRange) {
    warn.className = 'notice warn';
    warn.textContent = `번호 범위(${state.min}~${state.max})를 벗어난 팀이 있습니다.`;
  } else {
    warn.className = '';
    warn.textContent = '';
  }
}

$('btnAssign').addEventListener('click', () => {
  const n = Math.max(2, Math.min(20, Number($('teamCount').value) || 10));
  const min = Number($('numMin').value);
  const max = Number($('numMax').value);
  if (max <= min) { alertBox('setupWarn', 'bad', '최댓값이 최솟값보다 커야 합니다.'); return; }
  if (max - min + 1 < n) { alertBox('setupWarn', 'bad', `번호 범위가 좁아 ${n}팀에게 서로 다른 번호를 줄 수 없습니다.`); return; }
  state.min = min; state.max = max;
  resizeTeams(n);
  state.secrets = assignNumbers(n, { min, max });
  state.tickets = initialTickets(n);
  state.boughtSet = new Array(n).fill(false);
  state.masked = true;
  save();
  renderAll();
  alertBox('setupWarn', 'ok', '번호를 새로 배정했습니다. 티켓도 초기화했습니다.');
});

function alertBox(id, kind, text) {
  const el = $(id);
  el.className = `notice ${kind}`;
  el.textContent = text;
}

$('btnToggleMask').addEventListener('click', () => {
  state.masked = !state.masked;
  save();
  renderSecrets();
});

$('btnManual').addEventListener('click', () => {
  const n = Math.max(2, Math.min(20, Number($('teamCount').value) || 10));
  state.min = Number($('numMin').value);
  state.max = Number($('numMax').value);
  resizeTeams(n);
  if (!state.secrets.length) state.secrets = new Array(n).fill(null);
  save();
  renderManualInputs();
  renderContactOptions();
  renderTickets();
  renderGuessTable();
});

$('bucketSum').addEventListener('change', () => {
  state.bucketSum = $('bucketSum').checked;
  save();
});

$('btnReset').addEventListener('click', () => {
  if (!confirm('번호·티켓·단서 기록·추측을 모두 지우고 새 게임을 시작할까요?')) return;
  state = defaultState();
  save();
  syncInputs();
  renderAll();
});

function syncInputs() {
  $('teamCount').value = state.teamCount;
  $('numMin').value = state.min;
  $('numMax').value = state.max;
  $('bucketSum').checked = state.bucketSum;
}

$('teamCount').addEventListener('change', () => {
  const n = Math.max(2, Math.min(20, Number($('teamCount').value) || 10));
  $('teamCount').value = n;
  resizeTeams(n);
  save();
  renderAll();
});

/* ── ② 콘택트룸 ───────────────────────────────────────────────── */

let pickedKind = null;

function renderContactOptions() {
  for (const id of ['teamA', 'teamB']) {
    const sel = $(id);
    const prev = sel.value;
    sel.innerHTML = '';
    for (let i = 0; i < state.teamCount; i++) {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = teamName(i);
      sel.append(o);
    }
    if (prev && Number(prev) < state.teamCount) sel.value = prev;
    else sel.value = id === 'teamA' ? '0' : '1';
  }
}

function renderKindPick() {
  const wrap = $('kindPick');
  wrap.innerHTML = '';
  for (const k of CARD_KINDS) {
    const b = document.createElement('button');
    b.className = 'kind-btn';
    b.type = 'button';
    b.setAttribute('aria-pressed', String(pickedKind === k));
    const name = document.createElement('span');
    name.className = 'k-name';
    name.textContent = CARD_LABELS[k];
    const desc = document.createElement('span');
    desc.className = 'k-desc';
    desc.textContent = CARD_DESCRIPTIONS[k];
    b.append(name, desc);
    b.addEventListener('click', () => { pickedKind = k; renderKindPick(); });
    wrap.append(b);
  }
}

$('btnReveal').addEventListener('click', () => {
  const a = Number($('teamA').value);
  const b = Number($('teamB').value);
  const msg = $('contactMsg');

  if (!pickedKind) { msg.className = 'notice warn'; msg.textContent = '카드 종류를 고르세요.'; return; }
  if (state.secrets[a] == null || state.secrets[b] == null) {
    msg.className = 'notice bad'; msg.textContent = '아직 번호가 배정되지 않은 팀이 있습니다. ① 설정에서 먼저 배정하세요.';
    return;
  }
  const ok = canContact(state.tickets, a, b, pickedKind);
  if (!ok.ok) { msg.className = 'notice bad'; msg.textContent = ok.reason; return; }

  const clue = computeClue(pickedKind, state.secrets[a], state.secrets[b], { bucketSum: state.bucketSum });
  state.tickets = spendTickets(state.tickets, a, b, pickedKind);
  state.log.unshift({
    a, b, kind: pickedKind, display: clue.display, detail: clue.detail,
    at: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
  });
  save();

  $('clueScreen').hidden = false;
  $('clueLabel').textContent = `${teamName(a)} ↔ ${teamName(b)} · ${CARD_LABELS[pickedKind]}`;
  $('clueValue').textContent = clue.display;
  $('clueDetail').textContent = CARD_DESCRIPTIONS[pickedKind];
  msg.className = 'notice ok';
  msg.textContent = `티켓을 양쪽에서 1장씩 차감했습니다.`;
  renderTickets();
  renderLog();
});

$('btnToggleLogDetail').addEventListener('click', () => {
  state.showLogDetail = !state.showLogDetail;
  save();
  renderLog();
});

function renderLog() {
  const box = $('clueLog');
  $('btnToggleLogDetail').textContent = state.showLogDetail ? '계산 근거 가리기' : '계산 근거 보기';
  box.innerHTML = '';
  if (!state.log.length) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = '아직 공개한 단서가 없습니다.';
    box.append(e);
    return;
  }
  for (const r of state.log) {
    const d = document.createElement('div');
    const head = document.createElement('span');
    head.textContent = `${r.at} · ${teamName(r.a)} ↔ ${teamName(r.b)} · ${CARD_LABELS[r.kind]} → `;
    const val = document.createElement('mark');
    val.textContent = r.display;
    d.append(head, val);
    if (state.showLogDetail) {
      const det = document.createElement('div');
      det.style.cssText = 'font-size:12px;color:var(--text-dim);margin-top:2px';
      det.textContent = r.detail;
      d.append(det);
    }
    box.append(d);
  }
}

/* ── ③ 티켓 ───────────────────────────────────────────────────── */

function renderTickets() {
  const table = $('ticketTable');
  table.innerHTML = '';

  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  hr.append(th('팀', 'left'));
  for (const k of CARD_KINDS) hr.append(th(CARD_LABELS[k]));
  hr.append(th('피스'), th('티켓 세트 추가'));
  thead.append(hr);
  table.append(thead);

  const tbody = document.createElement('tbody');
  for (let i = 0; i < state.teamCount; i++) {
    const tr = document.createElement('tr');
    tr.append(td(teamName(i), 'left'));

    for (const k of CARD_KINDS) {
      const cell = document.createElement('td');
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.min = '0';
      inp.value = String(state.tickets[i]?.[k] ?? 0);
      inp.addEventListener('change', () => {
        const v = Math.max(0, Number(inp.value) || 0);
        inp.value = String(v);
        state.tickets[i] = { ...state.tickets[i], [k]: v };
        save();
      });
      cell.append(inp);
      tr.append(cell);
    }

    const pieceCell = document.createElement('td');
    const pinp = document.createElement('input');
    pinp.type = 'number';
    pinp.min = '0';
    pinp.value = String(state.pieces[i] ?? 0);
    pinp.addEventListener('change', () => {
      state.pieces[i] = Math.max(0, Number(pinp.value) || 0);
      save();
      renderTickets();
    });
    pieceCell.append(pinp);
    tr.append(pieceCell);

    const buyCell = document.createElement('td');
    const btn = document.createElement('button');
    btn.className = 'small';
    const already = state.boughtSet[i];
    const canAfford = (state.pieces[i] ?? 0) >= TICKET_SET_COST;
    btn.textContent = already ? '구입함' : `피스 ${TICKET_SET_COST}개로 구입`;
    btn.disabled = already || !canAfford;
    btn.addEventListener('click', () => {
      state.pieces[i] -= TICKET_SET_COST;
      state.boughtSet[i] = true;
      for (const k of CARD_KINDS) state.tickets[i][k] = (state.tickets[i][k] ?? 0) + 1;
      save();
      renderTickets();
    });
    buyCell.append(btn);
    tr.append(buyCell);

    tbody.append(tr);
  }
  table.append(tbody);
}

function th(text, cls = '') { const e = document.createElement('th'); e.textContent = text; if (cls) e.className = cls; return e; }
function td(text, cls = '') { const e = document.createElement('td'); e.textContent = text; if (cls) e.className = cls; return e; }

/* ── ④ 채점 ───────────────────────────────────────────────────── */

function renderGuessTable() {
  const table = $('guessTable');
  table.innerHTML = '';
  const n = state.teamCount;

  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  hr.append(th('추측한 팀 ↓ / 대상 →', 'left'));
  for (let j = 0; j < n; j++) hr.append(th(teamName(j)));
  thead.append(hr);
  table.append(thead);

  const tbody = document.createElement('tbody');
  for (let i = 0; i < n; i++) {
    const tr = document.createElement('tr');
    tr.append(td(teamName(i), 'left'));
    for (let j = 0; j < n; j++) {
      const cell = document.createElement('td');
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.placeholder = i === j ? '내 번호' : '';
      inp.value = state.guesses[i]?.[j] ?? '';
      if (i === j) inp.style.borderColor = 'var(--accent)';
      inp.addEventListener('change', () => {
        if (!state.guesses[i]) state.guesses[i] = [];
        state.guesses[i][j] = inp.value === '' ? null : Number(inp.value);
        save();
      });
      cell.append(inp);
      tr.append(cell);
    }
    tbody.append(tr);
  }
  table.append(tbody);
}

$('btnClearGuess').addEventListener('click', () => {
  if (!confirm('입력한 추측을 전부 지울까요?')) return;
  state.guesses = Array.from({ length: state.teamCount }, () => new Array(state.teamCount).fill(null));
  save();
  renderGuessTable();
  $('resultBox').hidden = true;
});

$('btnScore').addEventListener('click', () => {
  if (state.secrets.some((v) => v == null) || !state.secrets.length) {
    alert('아직 번호가 배정되지 않은 팀이 있습니다. ① 설정에서 먼저 배정하세요.');
    return;
  }
  const rows = scoreGuesses(state.secrets, state.guesses);
  const pieces = distributePieces(
    rows.map((r) => ({ id: r.team, score: r.score })),
    PIECE_TABLES['secret-number']);
  const pieceOf = Object.fromEntries(pieces.map((p) => [p.id, p]));

  const table = $('resultTable');
  table.innerHTML = '';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  ['등수', '팀', '고유번호', '자기 번호', '다른 팀', '보너스', '패널티', '최종 점수', '피스']
    .forEach((h, i) => hr.append(th(h, i === 1 ? 'left' : '')));
  thead.append(hr);
  table.append(thead);

  const tbody = document.createElement('tbody');
  const sorted = [...rows].sort((a, b) => (pieceOf[a.team].rank - pieceOf[b.team].rank) || (b.score - a.score));
  for (const r of sorted) {
    const p = pieceOf[r.team];
    const tr = document.createElement('tr');
    tr.append(td(`${p.rank}등`));
    tr.append(td(teamName(r.team), 'left'));
    tr.append(td(String(state.secrets[r.team])));
    tr.append(signed(r.self));
    tr.append(signed(r.others));
    tr.append(signed(r.bonus));
    tr.append(signed(r.penalty));
    const sc = td(String(r.score));
    sc.style.fontWeight = '800';
    tr.append(sc);
    const pc = td(String(p.pieces));
    pc.style.fontWeight = '800';
    pc.style.color = 'var(--accent)';
    tr.append(pc);
    tbody.append(tr);
  }
  table.append(tbody);
  $('resultBox').hidden = false;
  $('resultBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

function signed(v) {
  const e = td(v > 0 ? `+${v}` : String(v));
  if (v > 0) e.className = 'pos';
  else if (v < 0) e.className = 'neg';
  return e;
}

/* ── 처음 그리기 ──────────────────────────────────────────────── */

function renderAll() {
  if (!state.tickets.length) resizeTeams(state.teamCount);
  renderSecrets();
  renderContactOptions();
  renderKindPick();
  renderTickets();
  renderLog();
  renderGuessTable();
}

syncInputs();
renderAll();

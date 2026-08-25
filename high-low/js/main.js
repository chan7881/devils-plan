/**
 * 수식 하이로우 — DOM을 만지는 유일한 파일.
 * 계산·판정은 deck.js · formula.js · judge.js · ../../common/js/pieces.js 가 한다.
 */
import { buildDeck, shuffle, dealToTeam, COLOR_LABELS, OP_LABELS } from './deck.js';
import { evaluate, formulaText, formatValue, checkAgainstHand } from './formula.js';
import { judgeRound } from './judge.js';
import { PIECE_TABLES, distributePieces } from '../../common/js/pieces.js';

const STORE_KEY = 'devils-plan.high-low.v1';
const $ = (id) => document.getElementById(id);
const teamName = (i) => `${i + 1}팀`;

/* ── 상태 ─────────────────────────────────────────────────────── */

const defaultState = () => ({
  teamCount: 10,
  targetHigh: 20,
  targetLow: 1,
  limitSec: 120,
  onlineDeal: true,
  checkColor: true,
  round: 1,
  hands: [],        // 팀별 { numbers:[card], ops:[opName], hiddenKey:string, discarded:[] }
  subs: [],         // 팀별 { declaration, high:[tokens], low:[tokens], submitted:bool }
  totals: [],       // 팀별 누적 점수
  roundRows: null,  // 마지막 판정 결과
  current: 0,       // 지금 편집 중인 팀
  slot: 'high',     // 스윙일 때 어느 수식을 편집 중인지
});

let state = load() || defaultState();
let caret = 0;         // 수식 안 커서 위치 (0 = 맨 앞)
let selectedTok = null;

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return (s && typeof s === 'object' && Array.isArray(s.hands)) ? { ...defaultState(), ...s } : null;
  } catch (_) { return null; }
}
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) {} }

function resizeTeams(n) {
  const keep = (arr, make) => Array.from({ length: n }, (_, i) => arr[i] ?? make());
  state.teamCount = n;
  state.hands = keep(state.hands, () => null);
  state.subs = keep(state.subs, () => ({ declaration: null, high: [], low: [], submitted: false }));
  state.totals = keep(state.totals, () => 0);
  if (state.current >= n) state.current = 0;
}

/* ── 탭 ───────────────────────────────────────────────────────── */

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    document.querySelectorAll('.panel-page').forEach((p) => { p.hidden = true; });
    $(`page-${btn.dataset.page}`).hidden = false;
  });
});

/* ── ① 설정 ───────────────────────────────────────────────────── */

function syncInputs() {
  $('teamCount').value = state.teamCount;
  $('targetHigh').value = state.targetHigh;
  $('targetLow').value = state.targetLow;
  $('limitSec').value = state.limitSec;
  $('onlineDeal').checked = state.onlineDeal;
  $('checkColor').checked = state.checkColor;
}

$('teamCount').addEventListener('change', () => {
  const n = Math.max(2, Math.min(12, Number($('teamCount').value) || 10));
  $('teamCount').value = n;
  resizeTeams(n);
  save(); renderAll();
});
for (const [id, key, num] of [['targetHigh', 'targetHigh', true], ['targetLow', 'targetLow', true], ['limitSec', 'limitSec', true]]) {
  $(id).addEventListener('change', () => {
    state[key] = num ? Number($(id).value) : $(id).value;
    if (key === 'limitSec') resetTimer();
    save();
  });
}
$('onlineDeal').addEventListener('change', () => { state.onlineDeal = $('onlineDeal').checked; save(); renderDeal(); });
$('checkColor').addEventListener('change', () => { state.checkColor = $('checkColor').checked; save(); renderBuilder(); });

$('btnReset').addEventListener('click', () => {
  if (!confirm('배부한 카드·제출 수식·누적 점수를 모두 지울까요?')) return;
  state = defaultState();
  save(); syncInputs(); renderAll();
});

/* ── ② 카드 배부 ──────────────────────────────────────────────── */

$('btnDeal').addEventListener('click', () => {
  const bag = shuffle(buildDeck());
  const hands = [];
  try {
    for (let i = 0; i < state.teamCount; i++) {
      // 곱하기를 받으면 무엇을 버릴지는 팀이 정한다. 기본은 더하기를 버리고,
      // 배부 후 화면에서 바꿀 수 있게 한다.
      const dealt = dealToTeam(bag);
      hands.push({
        numbers: [dealt.hidden, ...dealt.open],
        ops: dealt.ops,
        hiddenKey: `${dealt.hidden.value}-${dealt.hidden.color}`,
        discarded: dealt.discarded,
      });
    }
  } catch (e) {
    notice('dealMsg', 'bad', `배부 중 카드가 모자랍니다: ${e.message}`);
    return;
  }
  state.hands = hands;
  state.subs = Array.from({ length: state.teamCount }, () => ({ declaration: null, high: [], low: [], submitted: false }));
  save();
  notice('dealMsg', 'ok', `${state.teamCount}팀에게 배부했습니다.`);
  renderDeal(); renderBuilder(); renderTeamPicker();
});

$('btnNextRound').addEventListener('click', () => {
  state.round += 1;
  state.hands = [];
  state.subs = Array.from({ length: state.teamCount }, () => ({ declaration: null, high: [], low: [], submitted: false }));
  state.roundRows = null;
  save();
  renderAll();
  notice('dealMsg', 'ok', `${state.round}라운드입니다. 카드를 새로 배부하세요.`);
});

function notice(id, kind, text) {
  const el = $(id);
  el.className = `notice ${kind}`;
  el.textContent = text;
}

function cardTile(card, { onClick = null, disabled = false, isHidden = false } = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'card-tile ' + (card.type === 'number' ? `c-${card.color}` : 'c-op');
  if (isHidden) b.classList.add('hidden-card');
  b.disabled = !!disabled;

  const main = document.createElement('span');
  main.textContent = card.type === 'number' ? String(card.value) : OP_LABELS[card.op];
  b.append(main);

  const sub = document.createElement('span');
  sub.className = 'cname';
  sub.textContent = card.type === 'number' ? COLOR_LABELS[card.color] : '';
  b.append(sub);

  if (onClick) b.addEventListener('click', onClick);
  return b;
}

function renderDeal() {
  $('roundNum').textContent = String(state.round);
  const wrap = $('dealList');
  wrap.innerHTML = '';
  if (!state.onlineDeal) {
    const box = document.createElement('div');
    box.className = 'box';
    box.innerHTML = '<p class="hint" style="margin:0">실물 카드로 진행하는 중입니다. ③ 수식 제출에서 제출된 수식만 검증합니다.</p>';
    wrap.append(box);
    return;
  }
  if (!state.hands.length || state.hands.some((h) => !h)) {
    const box = document.createElement('div');
    box.className = 'box';
    box.innerHTML = '<p class="hint" style="margin:0">아직 배부하지 않았습니다.</p>';
    wrap.append(box);
    return;
  }

  for (let i = 0; i < state.teamCount; i++) {
    const h = state.hands[i];
    const box = document.createElement('div');
    box.className = 'box';

    const title = document.createElement('h2');
    title.textContent = `${teamName(i)}`;
    box.append(title);

    const row = document.createElement('div');
    row.className = 'card-row';

    for (const c of h.numbers) {
      const isHidden = `${c.value}-${c.color}` === h.hiddenKey && !row.querySelector('.hidden-card');
      const wrapCell = document.createElement('div');
      wrapCell.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px';
      wrapCell.append(cardTile(c, { disabled: true, isHidden }));
      const badge = document.createElement('span');
      badge.className = 'hidden-badge';
      badge.textContent = isHidden ? '비공개' : '공개';
      wrapCell.append(badge);
      row.append(wrapCell);
    }

    const sep = document.createElement('span');
    sep.style.cssText = 'width:1px;align-self:stretch;background:var(--border);margin:0 4px';
    row.append(sep);

    for (const op of h.ops) row.append(cardTile({ type: 'op', op }, { disabled: true }));
    box.append(row);

    if (h.discarded.length) {
      const d = document.createElement('p');
      d.className = 'hint';
      d.textContent = `버린 카드: ${h.discarded.map((o) => OP_LABELS[o] ?? o).join(', ')}`;
      box.append(d);
    }
    wrap.append(box);
  }
}

/* ── ③ 수식 제출 ──────────────────────────────────────────────── */

function renderTeamPicker() {
  const wrap = $('teamPicker');
  wrap.innerHTML = '';
  for (let i = 0; i < state.teamCount; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'team-pill';
    const s = state.subs[i];
    if (s?.submitted) b.classList.add('done');
    b.textContent = teamName(i) + (s?.submitted ? ' ✓' : '');
    if (i === state.current) b.style.outline = '2px solid var(--accent)';
    b.addEventListener('click', () => {
      state.current = i; state.slot = 'high'; caret = curTokens().length; selectedTok = null;
      save(); renderTeamPicker(); renderBuilder();
    });
    wrap.append(b);
  }
}

const curSub = () => state.subs[state.current] ?? (state.subs[state.current] = { declaration: null, high: [], low: [], submitted: false });
const curTokens = () => (state.slot === 'low' ? curSub().low : curSub().high);
function setCurTokens(toks) {
  if (state.slot === 'low') curSub().low = toks; else curSub().high = toks;
}

function renderBuilder() {
  const sub = curSub();
  const hand = state.hands[state.current];

  // 배부된 카드 (온라인 배부일 때만 눌러서 넣을 수 있다)
  const handWrap = $('handCards');
  handWrap.innerHTML = '';
  if (state.onlineDeal && hand) {
    const used = new Map();
    for (const t of curTokens()) {
      if (t.type === 'number') { const k = `${t.value}-${t.color}`; used.set(k, (used.get(k) ?? 0) + 1); }
      else used.set(t.op, (used.get(t.op) ?? 0) + 1);
    }
    const seen = new Map();
    for (const c of hand.numbers) {
      const k = `${c.value}-${c.color}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
      const disabled = (used.get(k) ?? 0) >= seen.get(k);
      handWrap.append(cardTile(c, { onClick: () => insertToken({ type: 'number', value: c.value, color: c.color }), disabled }));
    }
    const sep = document.createElement('span');
    sep.style.cssText = 'width:1px;align-self:stretch;background:var(--border);margin:0 4px';
    handWrap.append(sep);
    for (const op of hand.ops) {
      const disabled = (used.get(op) ?? 0) >= 1;
      handWrap.append(cardTile({ type: 'op', op }, { onClick: () => insertToken({ type: 'op', op }), disabled }));
    }
  } else {
    // 실물 카드 모드 — 0~10과 연산자를 자유롭게 누른다
    for (let v = 0; v <= 10; v++) {
      handWrap.append(cardTile({ type: 'number', value: v, color: 'red' },
        { onClick: () => insertToken({ type: 'number', value: v, color: 'red' }) }));
    }
    const sep = document.createElement('span');
    sep.style.cssText = 'width:1px;align-self:stretch;background:var(--border);margin:0 4px';
    handWrap.append(sep);
    for (const op of ['add', 'sub', 'mul', 'div', 'sqrt']) {
      handWrap.append(cardTile({ type: 'op', op }, { onClick: () => insertToken({ type: 'op', op }) }));
    }
  }

  renderStrip();
  renderDeclaration();
  renderEval();
}

function renderStrip() {
  const strip = $('formulaStrip');
  const toks = curTokens();
  strip.innerHTML = '';
  if (caret > toks.length) caret = toks.length;
  if (caret < 0) caret = 0;

  const addCaret = () => {
    const c = document.createElement('span');
    c.className = 'caret';
    strip.append(c);
  };

  if (!toks.length) {
    addCaret();
    const e = document.createElement('span');
    e.className = 'empty';
    e.textContent = '위의 카드를 눌러 수식을 만드세요.';
    strip.append(e);
    return;
  }

  for (let i = 0; i <= toks.length; i++) {
    if (i === caret) addCaret();
    if (i === toks.length) break;
    const t = toks[i];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tok ' + (t.type === 'number' ? `c-${t.color}` : 'c-op');
    if (selectedTok === i) b.classList.add('selected');
    b.textContent = t.type === 'number' ? String(t.value) : OP_LABELS[t.op];
    b.addEventListener('click', () => { caret = i + 1; selectedTok = i; renderStrip(); });
    strip.append(b);
  }
}

function insertToken(tok) {
  const toks = [...curTokens()];
  toks.splice(caret, 0, tok);
  setCurTokens(toks);
  caret += 1;
  selectedTok = null;
  curSub().submitted = false;
  save();
  renderBuilder();
  renderTeamPicker();
}

$('btnCaretLeft').addEventListener('click', () => { caret = Math.max(0, caret - 1); selectedTok = null; renderStrip(); });
$('btnCaretRight').addEventListener('click', () => { caret = Math.min(curTokens().length, caret + 1); selectedTok = null; renderStrip(); });
$('btnDelToken').addEventListener('click', () => {
  const toks = [...curTokens()];
  const idx = selectedTok !== null ? selectedTok : caret - 1;
  if (idx < 0 || idx >= toks.length) return;
  toks.splice(idx, 1);
  setCurTokens(toks);
  caret = Math.min(idx, toks.length);
  selectedTok = null;
  curSub().submitted = false;
  save(); renderBuilder(); renderTeamPicker();
});
$('btnClearFormula').addEventListener('click', () => {
  setCurTokens([]); caret = 0; selectedTok = null;
  curSub().submitted = false;
  save(); renderBuilder(); renderTeamPicker();
});

function renderDeclaration() {
  const sub = curSub();
  document.querySelectorAll('.decl-btn').forEach((b) => {
    b.setAttribute('aria-pressed', String(sub.declaration === b.dataset.decl));
  });
  const isSwing = sub.declaration === 'swing';
  $('swingHint').hidden = !isSwing;
  $('swingSlotRow').hidden = !isSwing;
  if (isSwing) {
    $('btnEditHigh').setAttribute('aria-pressed', String(state.slot === 'high'));
    $('btnEditLow').setAttribute('aria-pressed', String(state.slot === 'low'));
    $('btnEditHigh').classList.toggle('primary', state.slot === 'high');
    $('btnEditLow').classList.toggle('primary', state.slot === 'low');
    const h = sub.high.length ? '있음' : '없음';
    const l = sub.low.length ? '있음' : '없음';
    $('swingState').textContent = `지금 편집: ${state.slot === 'low' ? '로우' : '하이'} 수식 · 하이 ${h} / 로우 ${l}`;
  }
}

document.querySelectorAll('.decl-btn').forEach((b) => {
  b.addEventListener('click', () => {
    const sub = curSub();
    sub.declaration = sub.declaration === b.dataset.decl ? null : b.dataset.decl;
    if (sub.declaration !== 'swing') { state.slot = 'high'; }
    sub.submitted = false;
    caret = curTokens().length;
    save(); renderBuilder(); renderTeamPicker();
  });
});
$('btnEditHigh').addEventListener('click', () => { state.slot = 'high'; caret = curTokens().length; selectedTok = null; save(); renderBuilder(); });
$('btnEditLow').addEventListener('click', () => { state.slot = 'low'; caret = curTokens().length; selectedTok = null; save(); renderBuilder(); });

function renderEval() {
  const toks = curTokens();
  const out = $('evalOut');
  out.innerHTML = '';

  if (!toks.length) { out.textContent = '수식을 만들어 주세요.'; }
  else {
    const r = evaluate(toks);
    const line = document.createElement('div');
    line.textContent = formulaText(toks) + ' = ';
    const v = document.createElement('span');
    v.className = 'num';
    if (r.ok) {
      v.textContent = formatValue(r.value);
      v.style.color = 'var(--accent)';
      const target = state.slot === 'low' ? state.targetLow : state.targetHigh;
      const dist = document.createElement('div');
      dist.style.cssText = 'font-size:13px;font-weight:600;color:var(--text-dim);margin-top:4px';
      dist.textContent = `목표 ${target}에서 ${formatValue(Math.abs(r.value - target))} 떨어짐`;
      line.append(v);
      out.append(line, dist);
    } else {
      v.textContent = '오류';
      v.style.color = 'var(--bad)';
      line.append(v);
      const why = document.createElement('div');
      why.className = 'notice bad';
      why.style.marginTop = '8px';
      why.textContent = r.error;
      out.append(line, why);
    }
  }

  // 배부 카드 대조
  const chk = $('handCheck');
  chk.innerHTML = '';
  const hand = state.hands[state.current];
  if (state.onlineDeal && hand && toks.length) {
    const res = checkAgainstHand(toks, hand, { checkColor: state.checkColor });
    const el = document.createElement('div');
    el.className = `notice ${res.ok ? 'ok' : 'bad'}`;
    el.textContent = res.ok ? '배부된 카드를 정확하게 사용했습니다.' : res.problems.join(' / ');
    chk.append(el);
  }
}

$('btnSubmit').addEventListener('click', () => {
  const sub = curSub();
  if (!sub.declaration) { notice('submitMsg', 'warn', '하이·로우·스윙 중 하나를 선언하세요.'); return; }
  if (sub.declaration === 'swing') {
    if (!sub.high.length || !sub.low.length) { notice('submitMsg', 'bad', '스윙은 수식이 두 개 필요합니다.'); return; }
  } else if (!curTokens().length) {
    notice('submitMsg', 'bad', '수식이 비어 있습니다.'); return;
  }
  sub.submitted = true;
  save();
  notice('submitMsg', 'ok', `${teamName(state.current)} 제출을 저장했습니다.`);
  renderTeamPicker();
});

$('btnUnsubmit').addEventListener('click', () => {
  curSub().submitted = false;
  save();
  notice('submitMsg', 'warn', '제출을 취소했습니다.');
  renderTeamPicker();
});

/* ── 타이머 ───────────────────────────────────────────────────── */

let timerId = null, remain = 0;

function resetTimer() {
  clearInterval(timerId); timerId = null;
  remain = state.limitSec;
  paintTimer();
  $('btnTimerStart').textContent = '시작';
}
function paintTimer() {
  const m = Math.floor(remain / 60), s = remain % 60;
  const el = $('timerText');
  el.textContent = `${m}:${String(s).padStart(2, '0')}`;
  el.classList.toggle('warn', remain <= 10);
}
$('btnTimerStart').addEventListener('click', () => {
  if (timerId) { clearInterval(timerId); timerId = null; $('btnTimerStart').textContent = '이어서'; return; }
  $('btnTimerStart').textContent = '멈춤';
  timerId = setInterval(() => {
    remain = Math.max(0, remain - 1);
    paintTimer();
    if (remain === 0) { clearInterval(timerId); timerId = null; $('btnTimerStart').textContent = '시작'; }
  }, 1000);
});
$('btnTimerReset').addEventListener('click', resetTimer);

/* ── ④ 결과 ───────────────────────────────────────────────────── */

$('btnJudge').addEventListener('click', () => {
  const submissions = [];
  for (let i = 0; i < state.teamCount; i++) {
    const s = state.subs[i] ?? {};
    const evalOf = (toks) => {
      if (!toks || !toks.length) return null;
      const r = evaluate(toks);
      return r.ok ? r.value : null;
    };
    submissions.push({
      id: i,
      declaration: s.submitted ? s.declaration : null,
      highValue: evalOf(s.high),
      lowValue: s.declaration === 'swing' ? evalOf(s.low) : evalOf(s.high),
    });
  }
  const rows = judgeRound(submissions, { targetHigh: state.targetHigh, targetLow: state.targetLow });
  state.roundRows = rows;
  for (const r of rows) state.totals[r.id] = (state.totals[r.id] ?? 0) + r.points;
  save();
  notice('judgeMsg', 'ok', `${state.round}라운드를 판정해 누적 점수에 더했습니다.`);
  renderResult();
});

function renderResult() {
  const rt = $('roundTable');
  rt.innerHTML = '';
  if (state.roundRows) {
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    ['팀', '선언', '수식', '값', '목표와의 거리', '순위', '점수'].forEach((h, i) => hr.append(th(h, i === 2 ? 'left' : '')));
    thead.append(hr);
    rt.append(thead);
    const tb = document.createElement('tbody');
    for (const r of state.roundRows) {
      const s = state.subs[r.id] ?? {};
      const tr = document.createElement('tr');
      tr.append(td(teamName(r.id)));
      tr.append(td({ high: '하이', low: '로우', swing: '스윙' }[r.declaration] ?? '—'));
      const f = r.declaration === 'swing'
        ? `${formulaText(s.high)} / ${formulaText(s.low)}`
        : formulaText(s.high);
      tr.append(td(f || '—', 'left'));
      const vHigh = s.high?.length ? evaluate(s.high) : null;
      tr.append(td(vHigh && vHigh.ok ? formatValue(vHigh.value) : (vHigh ? '오류' : '—')));
      tr.append(td(r.distance === null ? '—' : formatValue(r.distance)));
      tr.append(td(r.note || '—'));
      const p = td(String(r.points));
      p.style.fontWeight = '800';
      tr.append(p);
      tb.append(tr);
    }
    rt.append(tb);
  }

  const tt = $('totalTable');
  tt.innerHTML = '';
  const pieces = distributePieces(
    Array.from({ length: state.teamCount }, (_, i) => ({ id: i, score: state.totals[i] ?? 0 })),
    PIECE_TABLES['high-low']);
  const pieceOf = Object.fromEntries(pieces.map((p) => [p.id, p]));

  const thead2 = document.createElement('thead');
  const hr2 = document.createElement('tr');
  ['등수', '팀', '누적 점수', '가감', '피스'].forEach((h, i) => hr2.append(th(h, i === 1 ? 'left' : '')));
  thead2.append(hr2);
  tt.append(thead2);

  const tb2 = document.createElement('tbody');
  const order = [...Array(state.teamCount).keys()].sort((a, b) => pieceOf[a].rank - pieceOf[b].rank);
  for (const i of order) {
    const tr = document.createElement('tr');
    tr.append(td(`${pieceOf[i].rank}등`));
    tr.append(td(teamName(i), 'left'));
    const sc = td(String(state.totals[i] ?? 0));
    sc.style.fontWeight = '800';
    tr.append(sc);

    const adj = document.createElement('td');
    for (const [lbl, delta] of [['−1', -1], ['+1', 1]]) {
      const b = document.createElement('button');
      b.className = 'small';
      b.textContent = lbl;
      b.style.margin = '0 2px';
      b.addEventListener('click', () => {
        state.totals[i] = (state.totals[i] ?? 0) + delta;
        save(); renderResult();
      });
      adj.append(b);
    }
    tr.append(adj);

    const pc = td(String(pieceOf[i].pieces));
    pc.style.cssText = 'font-weight:800;color:var(--accent)';
    tr.append(pc);
    tb2.append(tr);
  }
  tt.append(tb2);
}

function th(t, cls = '') { const e = document.createElement('th'); e.textContent = t; if (cls) e.className = cls; return e; }
function td(t, cls = '') { const e = document.createElement('td'); e.textContent = t; if (cls) e.className = cls; return e; }

/* ── 처음 그리기 ──────────────────────────────────────────────── */

function renderAll() {
  resizeTeams(state.teamCount);
  renderDeal();
  renderTeamPicker();
  renderBuilder();
  renderResult();
}

syncInputs();
resetTimer();
renderAll();

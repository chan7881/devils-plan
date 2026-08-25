/**
 * 동물원 — DOM을 만지는 유일한 파일.
 * 판정·추첨은 board.js가 한다.
 */
import {
  ANIMALS, ANIMAL_LABELS, ANIMAL_SHORT,
  boardSizeForRounds, emptyBoard, makeBagForRounds, drawFromBag,
  dropTile, removeTile, countFilled, scoreTeam,
  makeComboDeckForTeams, drawCombo,
  TILES_DRAWN_PER_ROUND, COMBO_SIZE,
} from './board.js';

const STORE_KEY = 'devils-plan.zoo.v1';
const $ = (id) => document.getElementById(id);
const teamName = (i) => `${i + 1}팀`;

/* ── 상태 ─────────────────────────────────────────────────────── */

const defaultState = () => ({
  teamCount: 6,
  rounds: 5,
  credits: 30,
  size: 5,
  round: 1,
  started: false,
  board: emptyBoard(5),
  bagA: makeBagForRounds(5),
  bagB: makeBagForRounds(5),
  drawnA: [],   // [{animal, revealed, used}]
  drawnB: [],
  teams: [],    // [{combo:[], publicIdx, credits, bonus}]
  eraseMode: false,
  hitTeam: null,
});

let state = load() || defaultState();
let selected = null;   // {bag:'A'|'B', idx}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return (s && typeof s === 'object' && Array.isArray(s.board)) ? { ...defaultState(), ...s } : null;
  } catch (_) { return null; }
}
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) {} }

function notice(id, kind, text) {
  const el = $(id);
  el.className = `notice ${kind}`;
  el.textContent = text;
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
  $('rounds').value = state.rounds;
  $('credits').value = state.credits;
  updateSetupSummary();
}

function updateSetupSummary() {
  const rounds = Number($('rounds').value) || 5;
  const n = Number($('teamCount').value) || 6;
  const credits = Number($('credits').value) || 0;
  const size = boardSizeForRounds(rounds);
  const perBag = makeBagForRounds(rounds).length;
  const deckSize = makeComboDeckForTeams(n).length;
  const placed = TILES_DRAWN_PER_ROUND * rounds; // 매 라운드 낙찰된 조 4개만 판에 놓인다
  $('setupSummary').textContent =
    `${size} × ${size} 게임판 (총 ${size * size}칸) · ` +
    `타일 ${perBag * 2}개 (A ${perBag} / B ${perBag}) — ${rounds}라운드 동안 ${placed}개가 판에 놓입니다 · ` +
    `조합 덱 ${deckSize}장 · 총 필요 크레딧 ${n} × ${credits} = ${n * credits}개`;
}
for (const id of ['teamCount', 'rounds', 'credits']) {
  $(id).addEventListener('input', updateSetupSummary);
}

$('btnStart').addEventListener('click', () => {
  const n = Math.max(2, Math.min(12, Number($('teamCount').value) || 6));
  const rounds = Math.max(5, Math.min(10, Number($('rounds').value) || 5));
  const credits = Math.max(0, Number($('credits').value) || 0);
  const size = boardSizeForRounds(rounds);

  if (state.started && !confirm('진행 중인 게임이 초기화됩니다. 계속할까요?')) return;

  state = {
    ...defaultState(),
    teamCount: n, rounds, credits, size,
    board: emptyBoard(size),
    // 주머니는 라운드 수에 맞춰 만든다 — 5라운드면 원본과 같은 20개다.
    bagA: makeBagForRounds(rounds),
    bagB: makeBagForRounds(rounds),
    started: true,
    teams: Array.from({ length: n }, () => ({ combo: [], publicIdx: null, credits, bonus: 0 })),
  };
  save();
  syncInputs();
  renderAll();
  notice('setupMsg', 'ok', `${size}×${size} 판으로 시작했습니다. ② 팀 · 조합에서 동물 조합을 배부하세요.`);
});

$('btnReset').addEventListener('click', () => {
  if (!confirm('게임판·조합·크레딧을 모두 지울까요?')) return;
  state = defaultState();
  save(); syncInputs(); renderAll();
});

/* ── ② 팀 · 조합 ──────────────────────────────────────────────── */

$('btnDrawAll').addEventListener('click', () => {
  if (!state.started) { notice('teamMsg', 'warn', '① 설정에서 게임을 먼저 시작하세요.'); return; }
  let deck = makeComboDeckForTeams(state.teamCount);
  try {
    state.teams = state.teams.map((t) => {
      const { combo, rest } = drawCombo(deck);
      deck = rest;
      return { ...t, combo, publicIdx: 0 };
    });
  } catch (e) {
    notice('teamMsg', 'bad', `조합 카드가 모자랍니다: ${e.message}`);
    return;
  }
  save();
  renderTeams();
  notice('teamMsg', 'ok', `${state.teamCount}팀에게 조합 3장씩 배부했습니다.`);
});

function animalChip(a, { isPublic = false } = {}) {
  const s = document.createElement('span');
  s.className = 'chip a-' + a + (isPublic ? ' public' : '');
  // 색만으로 구분되지 않도록 이름을 적는다. 짧은 글자(사·원·코·뱀·독)는
  // 게임판 칸처럼 좁은 자리에서만 쓰고, 여기서는 이름이 더 읽기 쉽다.
  s.textContent = ANIMAL_LABELS[a] + (isPublic ? ' (공개)' : '');
  return s;
}

function renderTeams() {
  const wrap = $('teamList');
  wrap.innerHTML = '';
  if (!state.started) {
    wrap.innerHTML = '<div class="box"><p class="hint" style="margin:0">아직 게임을 시작하지 않았습니다.</p></div>';
    return;
  }
  state.teams.forEach((t, i) => {
    const card = document.createElement('div');
    card.className = 'team-card';

    const head = document.createElement('div');
    head.className = 'head';
    const name = document.createElement('strong');
    name.textContent = teamName(i);
    head.append(name);

    const credLabel = document.createElement('span');
    credLabel.style.cssText = 'font-size:12px;color:var(--text-dim);font-weight:700';
    credLabel.textContent = '크레딧';
    const cred = document.createElement('input');
    cred.type = 'number'; cred.min = '0'; cred.value = String(t.credits);
    cred.style.cssText = 'width:84px;min-height:36px';
    cred.addEventListener('change', () => {
      t.credits = Math.max(0, Number(cred.value) || 0);
      cred.value = String(t.credits);
      save();
    });
    head.append(credLabel, cred);
    card.append(head);

    if (!t.combo.length) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.style.margin = '0';
      p.textContent = '아직 조합을 뽑지 않았습니다.';
      card.append(p);
    } else {
      const chips = document.createElement('div');
      chips.className = 'combo-chips';
      t.combo.forEach((a, k) => {
        const holder = document.createElement('div');
        holder.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px';
        holder.append(animalChip(a, { isPublic: t.publicIdx === k }));

        const btns = document.createElement('div');
        btns.style.cssText = 'display:flex;gap:2px';
        const mk = (label, fn, title) => {
          const b = document.createElement('button');
          b.className = 'small'; b.textContent = label; b.title = title;
          b.style.cssText = 'min-height:32px;padding:0 8px';
          b.addEventListener('click', () => { fn(); save(); renderTeams(); });
          return b;
        };
        btns.append(mk('◀', () => {
          if (k === 0) return;
          [t.combo[k - 1], t.combo[k]] = [t.combo[k], t.combo[k - 1]];
          if (t.publicIdx === k) t.publicIdx = k - 1; else if (t.publicIdx === k - 1) t.publicIdx = k;
        }, '왼쪽으로'));
        btns.append(mk('▶', () => {
          if (k === t.combo.length - 1) return;
          [t.combo[k + 1], t.combo[k]] = [t.combo[k], t.combo[k + 1]];
          if (t.publicIdx === k) t.publicIdx = k + 1; else if (t.publicIdx === k + 1) t.publicIdx = k;
        }, '오른쪽으로'));
        btns.append(mk('공개', () => { t.publicIdx = k; }, '전체에 공개할 동물로 지정'));
        holder.append(btns);
        chips.append(holder);
      });
      card.append(chips);

      const pub = document.createElement('p');
      pub.className = 'hint';
      pub.textContent = t.publicIdx !== null
        ? `공개 동물: ${ANIMAL_LABELS[t.combo[t.publicIdx]]} (나머지 2마리와 조건·크레딧은 비공개)`
        : '공개 동물을 지정하세요.';
      card.append(pub);
    }
    wrap.append(card);
  });
}

/* ── ③ 진행 ───────────────────────────────────────────────────── */

$('btnDrawTiles').addEventListener('click', () => {
  if (!state.started) { notice('playMsg', 'warn', '① 설정에서 게임을 먼저 시작하세요.'); return; }
  if (state.bagA.length < TILES_DRAWN_PER_ROUND || state.bagB.length < TILES_DRAWN_PER_ROUND) {
    notice('playMsg', 'bad',
      `주머니에 남은 타일이 ${TILES_DRAWN_PER_ROUND}개보다 적습니다 ` +
      `(A ${state.bagA.length} / B ${state.bagB.length}). ① 설정에서 라운드 수를 늘려 새로 시작하세요.`);
    return;
  }
  if (state.drawnA.length || state.drawnB.length) {
    notice('playMsg', 'warn', '이번 라운드 타일이 이미 나와 있습니다. 「다음 라운드」를 먼저 누르세요.');
    return;
  }
  const a = drawFromBag(state.bagA, TILES_DRAWN_PER_ROUND);
  const b = drawFromBag(state.bagB, TILES_DRAWN_PER_ROUND);
  state.bagA = a.rest; state.bagB = b.rest;
  state.drawnA = a.drawn.map((x) => ({ animal: x, revealed: false, used: false }));
  state.drawnB = b.drawn.map((x) => ({ animal: x, revealed: false, used: false }));
  selected = null;
  save(); renderPlay();
  notice('playMsg', 'ok', 'A·B 주머니에서 4개씩 나왔습니다. 눌러서 뒤집으세요.');
});

$('btnRevealAll').addEventListener('click', () => {
  for (const t of [...state.drawnA, ...state.drawnB]) t.revealed = true;
  save(); renderPlay();
});

$('btnNextRound').addEventListener('click', () => {
  if (state.round >= state.rounds) { notice('playMsg', 'warn', '마지막 라운드입니다. ④ 점수로 넘어가세요.'); return; }
  state.round += 1;
  state.drawnA = []; state.drawnB = [];
  selected = null;
  save(); renderPlay();
  notice('playMsg', 'ok', `${state.round}라운드입니다.`);
});

$('btnEraseMode').addEventListener('click', () => {
  state.eraseMode = !state.eraseMode;
  selected = null;
  save(); renderPlay();
});

function renderTileStrip(el, list, bagKey) {
  el.innerHTML = '';
  if (!list.length) {
    const p = document.createElement('span');
    p.className = 'hint';
    p.textContent = '아직 뽑지 않았습니다.';
    el.append(p);
    return;
  }
  list.forEach((t, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tile' + (t.revealed ? ' a-' + t.animal : ' face-down');
    if (selected && selected.bag === bagKey && selected.idx === i) b.classList.add('selected');
    b.disabled = t.used;

    const g = document.createElement('span');
    g.className = 'glyph';
    g.style.fontSize = t.revealed ? '15px' : '22px';
    g.textContent = t.revealed ? ANIMAL_LABELS[t.animal] : '?';
    const n = document.createElement('span');
    n.className = 'nm';
    n.textContent = t.used ? '사용함' : (t.revealed ? '' : '뒤집기');
    b.append(g, n);

    b.addEventListener('click', () => {
      if (!t.revealed) { t.revealed = true; save(); renderPlay(); return; }
      selected = (selected && selected.bag === bagKey && selected.idx === i) ? null : { bag: bagKey, idx: i };
      renderPlay();
    });
    el.append(b);
  });
}

function selectedTile() {
  if (!selected) return null;
  const list = selected.bag === 'A' ? state.drawnA : state.drawnB;
  return list[selected.idx] ?? null;
}

function renderBoard(el, hits = null) {
  const size = state.size;
  el.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  el.innerHTML = '';
  const hitSet = new Set((hits ?? []).flat().map(([r, c]) => `${r},${c}`));

  // 화면은 위 줄부터 그린다. board[0]이 맨 아래이므로 뒤집어 순회한다.
  for (let r = size - 1; r >= 0; r--) {
    for (let c = 0; c < size; c++) {
      const v = state.board[r][c];
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell' + (v ? ' a-' + v : ' empty');
      if (hitSet.has(`${r},${c}`)) cell.classList.add('hit');
      cell.setAttribute('aria-label', `${r + 1}행 ${c + 1}열 ${v ? ANIMAL_LABELS[v] : '빈 칸'}`);

      const g = document.createElement('span');
      g.className = 'glyph';
      g.textContent = v ? ANIMAL_SHORT[v] : '·';
      cell.append(g);
      if (v) {
        const n = document.createElement('span');
        n.className = 'nm';
        n.textContent = ANIMAL_LABELS[v];
        cell.append(n);
      }

      if (el.id === 'board') {
        cell.addEventListener('click', () => onCellClick(r, c));
      } else {
        cell.disabled = true;
      }
      el.append(cell);
    }
  }
}

function onCellClick(row, col) {
  if (state.eraseMode) {
    if (removeTile(state.board, row, col)) { save(); renderPlay(); }
    return;
  }
  const t = selectedTile();
  if (!t) { notice('playMsg', 'warn', '먼저 뒤집힌 타일을 하나 고르세요.'); return; }
  const r = dropTile(state.board, col, t.animal);
  if (!r.ok) { notice('playMsg', 'bad', r.reason); return; }
  t.used = true;
  selected = null;
  save(); renderPlay();
}

function renderPlay() {
  $('roundNum').textContent = String(state.round);
  $('roundTotal').textContent = String(state.rounds);
  $('bagACount').textContent = `(남은 ${state.bagA.length}개)`;
  $('bagBCount').textContent = `(남은 ${state.bagB.length}개)`;
  renderTileStrip($('bagATiles'), state.drawnA, 'A');
  renderTileStrip($('bagBTiles'), state.drawnB, 'B');

  $('btnEraseMode').textContent = `지우기 도구: ${state.eraseMode ? '켜짐' : '꺼짐'}`;
  $('btnEraseMode').classList.toggle('danger', state.eraseMode);

  const t = selectedTile();
  $('selectedTileMsg').textContent = state.eraseMode
    ? '칸을 누르면 그 타일을 뺍니다. 위에 있던 타일이 내려옵니다.'
    : (t ? `고른 타일: ${ANIMAL_LABELS[t.animal]} — 놓을 열을 누르세요.` : '뒤집힌 타일을 고르세요.');

  const filled = countFilled(state.board);
  const total = state.size * state.size;
  $('boardState').textContent = `채워진 타일 ${filled} / ${total} (빈 칸 ${total - filled})`;

  renderBoard($('board'));
}

/* ── ④ 점수 ───────────────────────────────────────────────────── */

$('btnScore').addEventListener('click', () => {
  if (!state.started) { notice('scoreMsg', 'warn', '① 설정에서 게임을 먼저 시작하세요.'); return; }
  renderScore();
  notice('scoreMsg', 'ok', '조합이 완성된 자리를 세어 점수를 냈습니다.');
});

function renderScore() {
  const table = $('scoreTable');
  table.innerHTML = '';
  if (!state.started) return;

  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  ['팀', '동물 조합', '완성', '추가', '최종', '자리 보기'].forEach((h, i) => hr.append(th(h, i === 1 ? 'left' : '')));
  thead.append(hr);
  table.append(thead);

  const tbody = document.createElement('tbody');
  state.teams.forEach((t, i) => {
    const s = scoreTeam(state.board, t.combo, t.bonus ?? 0);
    const tr = document.createElement('tr');
    tr.append(td(teamName(i)));

    const comboCell = document.createElement('td');
    comboCell.className = 'left';
    if (!t.combo.length) comboCell.textContent = '—';
    else {
      const wrap = document.createElement('div');
      wrap.className = 'combo-chips';
      t.combo.forEach((a, k) => wrap.append(animalChip(a, { isPublic: t.publicIdx === k })));
      comboCell.append(wrap);
    }
    tr.append(comboCell);

    const cc = td(`${s.comboCount}점`);
    cc.style.fontWeight = '700';
    tr.append(cc);

    const adj = document.createElement('td');
    for (const [lbl, d] of [['−1', -1], ['+1', 1]]) {
      const b = document.createElement('button');
      b.className = 'small'; b.textContent = lbl;
      b.style.cssText = 'margin:0 2px;min-height:32px;padding:0 8px';
      b.addEventListener('click', () => { t.bonus = (t.bonus ?? 0) + d; save(); renderScore(); });
      adj.append(b);
    }
    const cur = document.createElement('span');
    cur.style.cssText = 'margin-left:4px;font-weight:700';
    cur.textContent = String(t.bonus ?? 0);
    adj.append(cur);
    tr.append(adj);

    const tot = td(String(s.total));
    tot.style.cssText = 'font-weight:800;color:var(--accent)';
    tr.append(tot);

    const showCell = document.createElement('td');
    const sb = document.createElement('button');
    sb.className = 'small';
    sb.textContent = state.hitTeam === i ? '보는 중' : '보기';
    sb.style.minHeight = '32px';
    sb.addEventListener('click', () => { state.hitTeam = state.hitTeam === i ? null : i; save(); renderScore(); });
    showCell.append(sb);
    tr.append(showCell);

    tbody.append(tr);
  });
  table.append(tbody);

  const hitTeam = state.hitTeam;
  const hits = (hitTeam !== null && state.teams[hitTeam])
    ? scoreTeam(state.board, state.teams[hitTeam].combo).matches
    : [];
  renderBoard($('hitBoard'), hits);
  $('hitHint').textContent = hitTeam === null
    ? '표에서 팀의 「보기」를 누르면 그 팀의 조합이 완성된 자리를 표시합니다.'
    : `${teamName(hitTeam)}의 조합이 완성된 자리 ${hits.length}곳을 표시했습니다.`;
}

function th(t, cls = '') { const e = document.createElement('th'); e.textContent = t; if (cls) e.className = cls; return e; }
function td(t, cls = '') { const e = document.createElement('td'); e.textContent = t; if (cls) e.className = cls; return e; }

/* ── 처음 그리기 ──────────────────────────────────────────────── */

function renderAll() {
  renderTeams();
  renderPlay();
  renderScore();
}

syncInputs();
renderAll();

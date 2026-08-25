/**
 * 동물원 검증.
 *
 * 조합 판정은 8방향(가로·세로·대각선 × 정/역)을 훑는다 — 방향이 뒤집히거나 대각선이
 * 어긋나기 딱 좋은 자리다. 공통 규칙 2번대로 **방향(손잡이)까지 못박아** 테스트한다.
 * 결과 객체의 필드는 `label`이다.
 */
import {
  ANIMALS, boardSizeForRounds, emptyBoard, makeBag, shuffle, drawFromBag,
  dropTile, removeTile, countFilled, findCombo, scoreTeam,
  makeComboDeck, drawCombo,
} from './board.js';

const results = [];
function check(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  results.push({ ok: a === e, label: a === e ? label : `${label}\n    기대: ${e}\n    실제: ${a}` });
}
function checkThrows(label, fn) {
  let threw = false;
  try { fn(); } catch (_) { threw = true; }
  results.push({ ok: threw, label: threw ? label : `${label}\n    기대: 예외 / 실제: 통과` });
}

function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const L = 'lion', M = 'monkey', E = 'elephant', S = 'snake', G = 'eagle';

/**
 * 보기 쉬운 글자판으로 board를 만든다.
 * **위 줄부터** 적는다 (화면에 보이는 대로). board[0]은 맨 아래 줄이므로 뒤집어 넣는다.
 */
function boardFrom(rowsTopFirst) {
  const map = { L, M, E, S, G, '.': null };
  return [...rowsTopFirst].reverse().map((row) => [...row].map((ch) => map[ch]));
}

export function runAll() {
  results.length = 0;

  /* ── 판 크기 ────────────────────────────────────────────────── */

  check('5라운드는 5×5', boardSizeForRounds(5), 5);
  check('6·7라운드는 6×6', [boardSizeForRounds(6), boardSizeForRounds(7)], [6, 6]);
  check('8라운드 이상은 7×7', boardSizeForRounds(8), 7);
  check('빈 판은 전부 null', emptyBoard(5).flat().every((c) => c === null), true);

  /* ── 주머니 ─────────────────────────────────────────────────── */

  {
    const bag = makeBag();
    check('주머니는 20개', bag.length, 20);
    check('5종이 각 4개씩', ANIMALS.map((a) => bag.filter((x) => x === a).length), [4, 4, 4, 4, 4]);
    const { drawn, rest } = drawFromBag(bag, 4, seeded(1));
    check('4개 뽑으면 4개', drawn.length, 4);
    check('주머니에 16개 남는다', rest.length, 16);
    check('원본 주머니는 그대로', bag.length, 20);
  }

  /* ── 중력 배치 ──────────────────────────────────────────────── */

  {
    const b = emptyBoard(5);
    check('첫 타일은 맨 아래(0행)', dropTile(b, 2, L).row, 0);
    check('그 위에 쌓인다(1행)', dropTile(b, 2, M).row, 1);
    check('다른 열은 다시 0행부터', dropTile(b, 0, E).row, 0);
    check('놓인 개수', countFilled(b), 3);
    check('판 밖은 거부', dropTile(b, 9, L).ok, false);
  }

  {
    // 한 열을 가득 채우면 더는 안 들어간다
    const b = emptyBoard(3);
    for (let i = 0; i < 3; i++) dropTile(b, 1, L);
    const r = dropTile(b, 1, M);
    check('가득 찬 열은 거부', r.ok, false);
    check('거부 사유', r.reason, '그 줄은 가득 찼습니다.');
  }

  {
    // 중간을 빼면 위가 내려온다
    const b = emptyBoard(4);
    dropTile(b, 0, L); dropTile(b, 0, M); dropTile(b, 0, E);
    check('빼기 전: 아래부터 L,M,E', [b[0][0], b[1][0], b[2][0]], [L, M, E]);
    removeTile(b, 1, 0); // 가운데 M을 뺀다
    check('M을 빼면 E가 내려온다', [b[0][0], b[1][0], b[2][0]], [L, E, null]);
    check('빈 칸을 빼려 하면 false', removeTile(b, 3, 0), false);
  }

  /* ── 조합 판정: 방향까지 못박는다 ────────────────────────────────
     board는 아래부터 쌓이지만, 아래 글자판은 **보이는 대로 위 줄부터** 적는다. */

  {
    //  . . . . .
    //  . . . . .
    //  . . . . .
    //  . . . . .
    //  L M E . .     ← 맨 아래 줄에 가로로 사자-원숭이-코끼리
    const b = boardFrom(['.....', '.....', '.....', '.....', 'LME..']);
    check('가로 정방향 1개', findCombo(b, [L, M, E]).length, 1);
    check('그 자리는 (0,0)(0,1)(0,2)', findCombo(b, [L, M, E])[0], [[0, 0], [0, 1], [0, 2]]);
    check('역순도 같은 자리로 인정 — 두 번 세지 않는다', findCombo(b, [E, M, L]).length, 1);
    check('순서가 다른 조합은 안 맞는다', findCombo(b, [L, E, M]).length, 0);
    check('없는 조합은 0', findCombo(b, [S, S, S]).length, 0);
  }

  {
    //  . . . . .
    //  . . . . .
    //  E . . . .
    //  M . . . .
    //  L . . . .    ← 세로로 아래에서 위로 사자-원숭이-코끼리
    const b = boardFrom(['.....', '.....', 'E....', 'M....', 'L....']);
    check('세로 1개', findCombo(b, [L, M, E]).length, 1);
    check('세로 자리는 (0,0)(1,0)(2,0) — 아래에서 위로', findCombo(b, [L, M, E])[0], [[0, 0], [1, 0], [2, 0]]);
  }

  {
    //  . . E . .
    //  . M . . .
    //  L . . . .   ← 오른쪽 위로 올라가는 대각선
    const b = boardFrom(['..E..', '.M...', 'L....']);
    check('↗ 대각선 1개', findCombo(b, [L, M, E]).length, 1);
    check('↗ 자리', findCombo(b, [L, M, E])[0], [[0, 0], [1, 1], [2, 2]]);
  }

  {
    //  E . . . .
    //  . M . . .
    //  . . L . .   ← 왼쪽 위로 올라가는 대각선
    const b = boardFrom(['E....', '.M...', '..L..']);
    check('↖ 대각선 1개', findCombo(b, [L, M, E]).length, 1);
    check('↖ 자리', findCombo(b, [L, M, E])[0], [[0, 2], [1, 1], [2, 0]]);
  }

  {
    // 대각선이 어긋나 있으면 안 맞아야 한다 (부호가 뒤집혔을 때 잡히는 자리)
    const b = boardFrom(['..L..', '.M...', 'E....']);
    check('↘ 방향으로 놓인 L,M,E는 [E,M,L]로만 읽힌다', findCombo(b, [L, M, E]).length, 1);
    check('그 자리는 (0,0)(1,1)(2,2)', findCombo(b, [L, M, E])[0], [[0, 0], [1, 1], [2, 2]]);
  }

  {
    // 두 군데에 있으면 2점
    //  . . . . .
    //  . . . . .
    //  . . . . .
    //  L M E . .
    //  L M E . .
    const b = boardFrom(['.....', '.....', '.....', 'LME..', 'LME..']);
    check('가로 두 줄 → 2개', findCombo(b, [L, M, E]).length, 2);
  }

  {
    // 같은 동물이 이어진 조합 (정/역이 같은 경우) — 두 번 세지 않아야 한다
    const b = boardFrom(['.....', '.....', '.....', '.....', 'LLL..']);
    check('LLL은 한 번만 센다', findCombo(b, [L, L, L]).length, 1);
  }

  {
    // 겹쳐 있으면 각각 센다
    const b = boardFrom(['.....', '.....', '.....', '.....', 'LLLL.']);
    check('LLLL 안의 LLL은 두 자리', findCombo(b, [L, L, L]).length, 2);
  }

  check('빈 판에서는 0', findCombo(emptyBoard(5), [L, M, E]).length, 0);
  check('빈 조합은 0', findCombo(boardFrom(['LME..']), []).length, 0);

  {
    // 판 가장자리를 넘어가는 자리를 잘못 세지 않는지
    const b = boardFrom(['.....', '.....', '.....', '.....', '...LM']);
    check('판 밖으로 이어지는 조합은 안 센다', findCombo(b, [L, M, E]).length, 0);
  }

  /* ── 점수 ───────────────────────────────────────────────────── */

  {
    const b = boardFrom(['.....', '.....', '.....', 'LME..', 'LME..']);
    const s = scoreTeam(b, [L, M, E], 0);
    check('조합 2개 = 2점', s.total, 2);
    check('진행자 추가 점수가 더해진다', scoreTeam(b, [L, M, E], 3).total, 5);
    check('추가 점수는 음수도 된다', scoreTeam(b, [L, M, E], -1).total, 1);
    check('맞은 자리를 돌려준다', s.matches.length, 2);
  }

  /* ── 조합 카드 덱 ───────────────────────────────────────────── */

  {
    const deck = makeComboDeck();
    check('덱은 30장', deck.length, 30);
    check('5종이 각 6장', ANIMALS.map((a) => deck.filter((x) => x === a).length), [6, 6, 6, 6, 6]);
    const { combo, rest } = drawCombo(deck, seeded(9));
    check('3장을 뽑는다', combo.length, 3);
    check('27장이 남는다', rest.length, 27);
    check('뽑은 것은 덱에서 빠진다 — 다른 팀은 남은 것만 본다', rest.length + combo.length, 30);
    check('원본 덱은 그대로', deck.length, 30);
    checkThrows('남은 카드가 모자라면 예외', () => drawCombo([L, M], seeded(1)));
  }

  check('섞어도 원본은 그대로', (() => { const d = makeComboDeck(); shuffle(d, seeded(2)); return d[0]; })(), ANIMALS[0]);

  return results;
}

/**
 * 동물원 — 게임판과 조합 판정. DOM을 모른다.
 *
 * 규칙의 정본은 원본 연수 자료의 「1. 동물원 규칙 설명 ppt.pptx」와
 * 진행자 웹앱(AI Studio 배포본)에서 확인한 동작이다.
 *   - 5×5 격자(라운드 수에 따라 6×6, 7×7). 타일은 **중력**으로 아래부터 쌓인다.
 *   - A·B 두 주머니에 5종 동물이 4개씩(각 20개). 매 라운드 각 4개씩 무작위로 나온다.
 *   - 각 팀은 30장 덱(5종 × 6장)에서 동물 3장을 골라 **순서까지** 정한다.
 *   - 게임이 끝나면 그 조합이 가로·세로·대각선으로, 정방향이든 역방향이든
 *     연속으로 놓여 있으면 **하나당 1점**.
 */

export const ANIMALS = ['lion', 'monkey', 'elephant', 'snake', 'eagle'];

export const ANIMAL_LABELS = {
  lion: '사자', monkey: '원숭이', elephant: '코끼리', snake: '뱀', eagle: '독수리',
};

/** 화면에서 색만으로 구분되지 않도록 글자도 함께 쓴다 (공통 규칙 3번). */
export const ANIMAL_SHORT = {
  lion: '사', monkey: '원', elephant: '코', snake: '뱀', eagle: '독',
};

/** 라운드 수 → 판 크기. 원본 앱: 5라운드 5×5, 그 이상은 6×6 / 7×7 */
export function boardSizeForRounds(rounds) {
  if (rounds <= 5) return 5;
  if (rounds <= 7) return 6;
  return 7;
}

/** 빈 게임판. board[r][c], r = 0 이 **맨 아래 줄**이다 (중력으로 아래부터 쌓이므로). */
export function emptyBoard(size) {
  return Array.from({ length: size }, () => new Array(size).fill(null));
}

/**
 * 주머니 하나를 만든다. 5종 × 4개 = 20개.
 * 「주머니 A와 B에 각각 5종류 동물이 4개씩(총 20개) 들어있습니다」
 */
export function makeBag() {
  const bag = [];
  for (const a of ANIMALS) for (let i = 0; i < 4; i++) bag.push(a);
  return bag;
}

/** 피셔-예이츠. rng를 받아 테스트에서 고정한다. */
export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 주머니에서 n개를 뽑는다. 뽑은 것은 주머니에서 사라진다.
 * @returns {{drawn:string[], rest:string[]}}
 */
export function drawFromBag(bag, n, rng = Math.random) {
  const shuffled = shuffle(bag, rng);
  return { drawn: shuffled.slice(0, n), rest: shuffled.slice(n) };
}

/**
 * 한 칸에 타일을 떨어뜨린다 (중력). 그 열에서 가장 낮은 빈 자리에 놓인다.
 * @returns {{ok:boolean, row?:number, reason?:string}} 새 판은 board를 직접 고친다.
 */
export function dropTile(board, col, animal) {
  if (col < 0 || col >= board[0].length) return { ok: false, reason: '판 밖입니다.' };
  for (let r = 0; r < board.length; r++) {
    if (board[r][col] === null) {
      board[r][col] = animal;
      return { ok: true, row: r };
    }
  }
  return { ok: false, reason: '그 줄은 가득 찼습니다.' };
}

/** 특정 칸을 비운다. 위에 쌓인 타일은 한 칸씩 내려온다 (중력 유지). */
export function removeTile(board, row, col) {
  const size = board.length;
  if (row < 0 || row >= size || col < 0 || col >= board[0].length) return false;
  if (board[row][col] === null) return false;
  for (let r = row; r < size - 1; r++) board[r][col] = board[r + 1][col];
  board[size - 1][col] = null;
  return true;
}

export function countFilled(board) {
  let n = 0;
  for (const row of board) for (const c of row) if (c !== null) n++;
  return n;
}

/* ── 조합 판정 ─────────────────────────────────────────────────── */

/**
 * 네 방향. 각각의 역방향은 combo를 뒤집어 확인하므로 따로 두지 않는다.
 * [dRow, dCol] — row가 커지면 위로 간다.
 */
const DIRECTIONS = [
  [0, 1],   // →  가로
  [1, 0],   // ↑  세로
  [1, 1],   // ↗  대각선
  [1, -1],  // ↖  반대 대각선
];

/**
 * 조합이 판 위에 연속으로 놓인 자리를 모두 찾는다.
 *
 * 「가로, 세로, 대각선, 역순 모두 인정」 — 역순은 조합을 뒤집어 한 번 더 본다.
 * 같은 자리를 정방향과 역방향으로 두 번 세지 않는다.
 *
 * @param {Array<Array<string|null>>} board
 * @param {string[]} combo 동물 3개(순서 있음)
 * @returns {Array<Array<[number,number]>>} 맞은 자리들의 좌표 목록
 */
export function findCombo(board, combo) {
  if (!Array.isArray(combo) || combo.length === 0) return [];
  const size = board.length;
  const width = board[0].length;
  const found = [];
  const seen = new Set();

  const tryAt = (r0, c0, dr, dc, seq) => {
    const cells = [];
    for (let k = 0; k < seq.length; k++) {
      const r = r0 + dr * k, c = c0 + dc * k;
      if (r < 0 || r >= size || c < 0 || c >= width) return null;
      if (board[r][c] !== seq[k]) return null;
      cells.push([r, c]);
    }
    return cells;
  };

  // 정방향과 역방향을 모두 본다. 방향 배열이 네 개뿐이라 역방향을 같이 봐야
  // 여덟 방향이 채워진다. 조합이 대칭이면(예: 사자-원숭이-사자, 또는 사자 셋)
  // 같은 자리가 두 번 잡히는데, 아래 `seen`이 그것을 걸러 준다.
  const reversed = [...combo].reverse();

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < width; c++) {
      for (const [dr, dc] of DIRECTIONS) {
        for (const seq of [combo, reversed]) {
          const cells = tryAt(r, c, dr, dc, seq);
          if (!cells) continue;
          // 좌표 집합을 정규화해 같은 자리를 두 번 세지 않는다
          const key = [...cells].map(([a, b]) => `${a},${b}`).sort().join('|');
          if (seen.has(key)) continue;
          seen.add(key);
          found.push(cells);
        }
      }
    }
  }
  return found;
}

/**
 * 한 팀의 점수를 낸다.
 * 「내 동물 조합이 일직선으로 연결되면 1점」 + 진행자가 손으로 더하는 추가 점수.
 * 조건카드 ×2배는 앱이 판정하지 않는다 — 원본 앱과 같이 진행자가 추가 점수로 반영한다.
 */
export function scoreTeam(board, combo, bonus = 0) {
  const matches = findCombo(board, combo);
  return { comboCount: matches.length, matches, bonus, total: matches.length + bonus };
}

/* ── 동물 조합 카드 뽑기 ───────────────────────────────────────────
   「5종류 동물 각 6장씩(총 30장 덱) 중 뒤집어진 카드 3장을 고릅니다.
     다른 플레이어가 뽑은 카드는 제외됩니다」 */

export function makeComboDeck() {
  const deck = [];
  for (const a of ANIMALS) for (let i = 0; i < 6; i++) deck.push(a);
  return deck;
}

/**
 * 덱에서 3장을 뽑는다. 이미 다른 팀이 가져간 것은 빠진 상태의 덱을 넘겨받는다.
 * @returns {{combo:string[], rest:string[]}}
 */
export function drawCombo(deck, rng = Math.random, count = 3) {
  if (deck.length < count) throw new Error('덱에 남은 카드가 모자랍니다.');
  const shuffled = shuffle(deck, rng);
  return { combo: shuffled.slice(0, count), rest: shuffled.slice(count) };
}

/**
 * 수식 하이로우 — 카드 덱과 배부. DOM을 모른다.
 *
 * 규칙의 정본은 원본 연수 자료의 「수식 하이로우 (0815 수정) ppt.pptx」다.
 *   - 숫자 카드는 0~10, 빨·주·초·파·보 다섯 색이 한 세트씩 총 55장
 *   - 색은 빨 > 주 > 초 > 파 > 보 순으로 가치가 낮아진다 (동점일 때 가르는 데 쓴다)
 *   - 여기에 루트 카드 5장, 곱하기 카드 5장이 더해진다
 *   - 각 팀에는 더하기·빼기·나누기 카드가 1장씩 지급된다
 */

export const COLORS = ['red', 'orange', 'green', 'blue', 'purple'];

export const COLOR_LABELS = {
  red: '빨강', orange: '주황', green: '초록', blue: '파랑', purple: '보라',
};

/** 색의 가치 순위 (작을수록 높다). 「빨강, 주황, 초록, 파랑, 보라의 순으로 가치가 낮아집니다」 */
export const COLOR_RANK = Object.fromEntries(COLORS.map((c, i) => [c, i]));

/** 숫자 카드는 0~10 */
export const NUMBERS = Array.from({ length: 11 }, (_, i) => i);

export const OP_LABELS = {
  add: '+', sub: '−', mul: '×', div: '÷', sqrt: '√',
};

/** 팀에게 처음부터 주는 연산 카드. 「더하기, 빼기, 나누기 카드가 1장씩 동일하게 지급됩니다」 */
export const STARTING_OPS = ['add', 'sub', 'div'];

/**
 * 뽑기 주머니를 만든다.
 * 숫자 55장(0~10 × 5색) + 루트 5장 + 곱하기 5장.
 */
export function buildDeck() {
  const deck = [];
  for (const color of COLORS) {
    for (const n of NUMBERS) deck.push({ type: 'number', value: n, color });
  }
  for (let i = 0; i < 5; i++) deck.push({ type: 'op', op: 'sqrt' });
  for (let i = 0; i < 5; i++) deck.push({ type: 'op', op: 'mul' });
  return deck;
}

/** 피셔-예이츠. rng를 받아 테스트에서 고정할 수 있게 한다. */
export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 한 팀 몫을 배부한다. 원본 PPT의 배부 순서를 그대로 따른다.
 *
 *  1. 비공개 카드 1장. **루트나 곱하기가 나오면 즉시 반납하고 숫자가 나올 때까지 다시 뽑는다.**
 *  2. 공개 카드 2장.
 *     - 루트를 받으면 숫자 카드 1장을 더 받는다.
 *     - 곱하기를 받으면 더하기·빼기·곱하기 중 1장을 버리고 숫자 카드 1장을 더 받는다.
 *       (**나누기 카드는 버릴 수 없다**)
 *     - 이미 기호 카드를 받은 뒤 또 기호 카드가 나오면 그건 버리고 숫자가 나올 때까지 다시 뽑는다.
 *
 * @param {Array} bag 남은 카드 (이 함수가 소비한다 — 호출한 쪽의 배열을 줄여 준다)
 * @param {object} [opt]
 * @param {(choices:string[]) => string} [opt.chooseDiscard] 곱하기를 받았을 때 버릴 카드를 고르는 함수.
 *        기본값은 첫 번째(더하기)를 버린다. 실제 수업에서는 팀이 고르므로 UI가 넘겨준다.
 * @returns {{hidden:object, open:object[], ops:string[], discarded:string[]}}
 */
export function dealToTeam(bag, opt = {}) {
  const { chooseDiscard = (choices) => choices[0] } = opt;
  const ops = [...STARTING_OPS];
  const discarded = [];

  const drawNumberOnly = () => {
    // 숫자가 나올 때까지 뽑는다. 되돌린 기호 카드는 주머니 맨 아래로 보낸다.
    const returned = [];
    let card = null;
    while (bag.length) {
      const c = bag.shift();
      if (c.type === 'number') { card = c; break; }
      returned.push(c);
    }
    bag.push(...returned);
    if (!card) throw new Error('주머니에 숫자 카드가 남아 있지 않습니다.');
    return card;
  };

  // 1. 비공개 1장 — 반드시 숫자
  const hidden = drawNumberOnly();

  // 2. 공개 2장
  const open = [];
  let gotSymbol = false;
  for (let i = 0; i < 2; i++) {
    if (!bag.length) throw new Error('주머니가 비었습니다.');
    const c = bag.shift();

    if (c.type === 'number') { open.push(c); continue; }

    // 기호 카드
    if (gotSymbol) {
      // 「또 기호 카드를 받으면 그 기호 카드는 버리고 숫자 카드가 나올 때까지 다시 받습니다」
      discarded.push(c.op);
      open.push(drawNumberOnly());
      continue;
    }
    gotSymbol = true;

    if (c.op === 'sqrt') {
      ops.push('sqrt');
      open.push(drawNumberOnly()); // 「추가로 숫자 카드 1장을 더 받습니다」
      continue;
    }
    if (c.op === 'mul') {
      // 「더하기, 빼기, 곱하기 카드 중 1장을 버리고」 — 나누기는 버릴 수 없다
      ops.push('mul');
      const choices = ops.filter((o) => o !== 'div');
      const drop = chooseDiscard(choices);
      const idx = ops.indexOf(choices.includes(drop) ? drop : choices[0]);
      discarded.push(ops[idx]);
      ops.splice(idx, 1);
      open.push(drawNumberOnly());
    }
  }

  return { hidden, open, ops, discarded };
}

/** 팀이 가진 카드 전체를 「무엇이 몇 장」 형태로 센다. 제출 수식 검증에 쓴다. */
export function countHand(hand) {
  const counts = { numbers: {}, ops: {} };
  for (const c of hand.numbers ?? []) {
    const key = `${c.value}-${c.color}`;
    counts.numbers[key] = (counts.numbers[key] ?? 0) + 1;
  }
  for (const o of hand.ops ?? []) counts.ops[o] = (counts.ops[o] ?? 0) + 1;
  return counts;
}

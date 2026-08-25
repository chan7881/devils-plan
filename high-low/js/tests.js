/**
 * 수식 하이로우 검증.
 *
 * 수식 계산은 학생이 배우는 수학 그 자체다 — 연산 순서·제곱근·0 나누기가 틀리면
 * 게임이 아니라 오개념을 가르치게 된다. 공통 규칙 2번대로 손으로 구한 값과 대조한다.
 * 결과 객체의 필드는 `label`이다.
 */
import { evaluate, validate, formulaText, formatValue, checkAgainstHand, ERRORS } from './formula.js';
import { buildDeck, shuffle, dealToTeam, COLORS, NUMBERS, STARTING_OPS } from './deck.js';
import { judgeRound } from './judge.js';

const results = [];
function check(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  results.push({ ok: a === e, label: a === e ? label : `${label}\n    기대: ${e}\n    실제: ${a}` });
}
function close(label, actual, expected, eps = 1e-9) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) < eps;
  results.push({ ok, label: ok ? label : `${label}\n    기대: ${expected}\n    실제: ${actual}` });
}

/** 토큰을 짧게 쓰기 위한 도우미 */
const n = (v, color = 'red') => ({ type: 'number', value: v, color });
const o = (op) => ({ type: 'op', op });
const val = (tokens) => evaluate(tokens);

function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function runAll() {
  results.length = 0;

  /* ── 덱 구성 ────────────────────────────────────────────────── */

  {
    const deck = buildDeck();
    check('덱 전체 65장 (숫자 55 + 루트 5 + 곱하기 5)', deck.length, 65);
    check('숫자 카드 55장', deck.filter((c) => c.type === 'number').length, 55);
    check('색은 다섯 가지', new Set(deck.filter((c) => c.type === 'number').map((c) => c.color)).size, 5);
    check('색마다 0~10 열한 장', deck.filter((c) => c.type === 'number' && c.color === 'red').length, 11);
    check('루트 5장', deck.filter((c) => c.op === 'sqrt').length, 5);
    check('곱하기 5장', deck.filter((c) => c.op === 'mul').length, 5);
    check('팀 기본 연산 카드는 +, −, ÷', STARTING_OPS, ['add', 'sub', 'div']);
  }

  check('섞어도 장수는 같다', shuffle(buildDeck(), seeded(3)).length, 65);
  check('섞어도 원본은 그대로', (() => { const d = buildDeck(); shuffle(d, seeded(3)); return d[0].value; })(), 0);

  /* ── 배부 규칙 ──────────────────────────────────────────────── */

  {
    // 비공개 자리에 루트가 오도록 일부러 배치 → 반납하고 숫자를 받아야 한다
    const bag = [{ type: 'op', op: 'sqrt' }, n(7), n(3), n(4)];
    const hand = dealToTeam(bag);
    check('비공개 카드는 반드시 숫자 (루트는 반납)', hand.hidden.type, 'number');
    check('반납한 루트가 비공개로 들어가지 않았다', hand.hidden.value, 7);
    check('기본 연산 카드는 그대로', hand.ops, ['add', 'sub', 'div']);
  }

  {
    // 공개 자리에 루트 → 숫자 1장을 더 받는다
    const bag = [n(5), { type: 'op', op: 'sqrt' }, n(9), n(2)];
    const hand = dealToTeam(bag);
    check('루트를 받으면 공개 카드가 여전히 2장 (숫자를 더 받아 채운다)', hand.open.length, 2);
    check('루트가 손에 들어온다', hand.ops.includes('sqrt'), true);
    check('공개 카드는 전부 숫자', hand.open.every((c) => c.type === 'number'), true);
  }

  {
    // 공개 자리에 곱하기 → 더하기/빼기/곱하기 중 1장 버리고 숫자 1장 더
    const bag = [n(5), { type: 'op', op: 'mul' }, n(9), n(2)];
    const hand = dealToTeam(bag, { chooseDiscard: () => 'sub' });
    check('곱하기가 손에 들어온다', hand.ops.includes('mul'), true);
    check('고른 카드(빼기)를 버렸다', hand.ops.includes('sub'), false);
    check('버린 기록이 남는다', hand.discarded, ['sub']);
    check('나누기는 그대로 남는다', hand.ops.includes('div'), true);
  }

  {
    // 나누기는 버릴 수 없다 — 나누기를 고르면 다른 것으로 대체된다
    const bag = [n(5), { type: 'op', op: 'mul' }, n(9), n(2)];
    const hand = dealToTeam(bag, { chooseDiscard: () => 'div' });
    check('나누기를 고르라 해도 버려지지 않는다', hand.ops.includes('div'), true);
  }

  /* ── 계산: 연산 순서 ────────────────────────────────────────────
     「괄호가 없는 경우 1순위 곱셈 나눗셈, 2순위 덧셈 뺄셈」 */

  close('2 + 3 × 4 = 14 (5×4=20이 아니다)', val([n(2), o('add'), n(3), o('mul'), n(4)]).value, 14);
  close('10 − 2 × 3 = 4', val([n(10), o('sub'), n(2), o('mul'), n(3)]).value, 4);
  close('8 ÷ 2 + 3 = 7', val([n(8), o('div'), n(2), o('add'), n(3)]).value, 7);
  close('3 + 8 ÷ 2 = 7 (11÷2가 아니다)', val([n(3), o('add'), n(8), o('div'), n(2)]).value, 7);
  close('왼쪽부터: 10 − 3 − 2 = 5', val([n(10), o('sub'), n(3), o('sub'), n(2)]).value, 5);
  close('왼쪽부터: 8 ÷ 4 ÷ 2 = 1', val([n(8), o('div'), n(4), o('div'), n(2)]).value, 1);
  close('2 × 3 × 4 = 24', val([n(2), o('mul'), n(3), o('mul'), n(4)]).value, 24);
  close('숫자 하나만: 7', val([n(7)]).value, 7);

  /* ── 계산: 제곱근 ───────────────────────────────────────────── */

  close('√4 = 2', val([o('sqrt'), n(4)]).value, 2);
  close('√9 = 3', val([o('sqrt'), n(9)]).value, 3);
  close('√1 = 1', val([o('sqrt'), n(1)]).value, 1);
  close('√0 = 0', val([o('sqrt'), n(0)]).value, 0);
  close('√2 ≈ 1.41421356', val([o('sqrt'), n(2)]).value, Math.SQRT2, 1e-12);
  check('√1 < √2 < √3 < √4 (PPT의 지도 내용)', (() => {
    const v = [1, 2, 3, 4].map((x) => val([o('sqrt'), n(x)]).value);
    return v[0] < v[1] && v[1] < v[2] && v[2] < v[3];
  })(), true);
  close('√9 + 1 = 4 (루트는 뒤 숫자 하나에만)', val([o('sqrt'), n(9), o('add'), n(1)]).value, 4);
  close('2 × √9 = 6', val([n(2), o('mul'), o('sqrt'), n(9)]).value, 6);
  close('√4 × √9 = 6', val([o('sqrt'), n(4), o('mul'), o('sqrt'), n(9)]).value, 6);
  check('루트에 루트를 씌우면 오류', val([o('sqrt'), o('sqrt'), n(4)]).error, ERRORS.SQRT_NOT_ON_NUMBER);
  check('루트 뒤에 아무것도 없으면 오류', val([n(2), o('add'), o('sqrt')]).error, ERRORS.TRAILING_OP);

  /* ── 계산: 0 관련 (PPT가 따로 지도하는 부분) ────────────────────── */

  close('0 ÷ 5 = 0', val([n(0), o('div'), n(5)]).value, 0);
  check('5 ÷ 0 은 값이 없다', val([n(5), o('div'), n(0)]).error, ERRORS.DIVIDE_BY_ZERO);
  check('0 ÷ 0 도 값이 없다', val([n(0), o('div'), n(0)]).error, ERRORS.DIVIDE_BY_ZERO);
  check('중간에 0으로 나눠도 잡는다', val([n(1), o('add'), n(4), o('div'), n(0)]).error, ERRORS.DIVIDE_BY_ZERO);
  close('0 × 7 = 0', val([n(0), o('mul'), n(7)]).value, 0);
  close('0 − 5 = −5 (음수도 나온다)', val([n(0), o('sub'), n(5)]).value, -5);

  /* ── 문법 오류 ──────────────────────────────────────────────── */

  check('빈 수식', val([]).error, ERRORS.EMPTY);
  check('연산자로 시작', val([o('add'), n(3)]).error, ERRORS.LEADING_OP);
  check('연산자로 끝', val([n(3), o('add')]).error, ERRORS.TRAILING_OP);
  check('연산자 연속', val([n(3), o('add'), o('mul'), n(2)]).error, ERRORS.CONSECUTIVE_OPS);
  check('숫자 연속', val([n(3), n(2)]).error, ERRORS.CONSECUTIVE_NUMBERS);
  check('숫자 뒤에 바로 루트', val([n(3), o('sqrt'), n(2)]).error, ERRORS.CONSECUTIVE_NUMBERS);
  check('루트로 시작하는 것은 정상', validate([o('sqrt'), n(4)]), null);
  check('정상 수식은 오류 없음', validate([n(3), o('add'), n(4)]), null);

  /* ── 표시 ────────────────────────────────────────────────────── */

  check('수식 문자열', formulaText([n(2), o('add'), o('sqrt'), n(9)]), '2 + √9');
  check('정수는 그대로', formatValue(14), '14');
  check('소수는 셋째 자리까지', formatValue(Math.SQRT2), '1.414');

  /* ── 배부 카드 대조 ─────────────────────────────────────────── */

  {
    const hand = { numbers: [n(3, 'red'), n(4, 'blue'), n(7, 'green')], ops: ['add', 'sub', 'div'] };

    check('배부된 카드만 쓰면 통과',
      checkAgainstHand([n(3, 'red'), o('add'), n(4, 'blue')], hand).ok, true);

    check('안 받은 숫자를 쓰면 걸린다',
      checkAgainstHand([n(9, 'red')], hand).problems.length, 1);

    check('색이 다르면 다른 카드다',
      checkAgainstHand([n(3, 'blue')], hand).ok, false);

    check('색 검사를 끄면 통과 (오프라인 실물 카드용)',
      checkAgainstHand([n(3, 'blue')], hand, { checkColor: false }).ok, true);

    check('같은 카드를 두 번 쓰면 수량 초과',
      checkAgainstHand([n(3, 'red'), o('add'), n(3, 'red')], hand).problems[0].startsWith('수량 초과'), true);

    check('안 받은 연산자(곱하기)를 쓰면 걸린다',
      checkAgainstHand([n(3, 'red'), o('mul'), n(4, 'blue')], hand).ok, false);

    check('받은 연산자는 통과',
      checkAgainstHand([n(3, 'red'), o('div'), n(4, 'blue')], hand).ok, true);
  }

  /* ── 판정 ────────────────────────────────────────────────────── */

  {
    // 하이: 20에 가까운 순서대로 3, 2, 1
    const rows = judgeRound([
      { id: 'A', declaration: 'high', highValue: 20, lowValue: null },  // 거리 0
      { id: 'B', declaration: 'high', highValue: 18, lowValue: null },  // 거리 2
      { id: 'C', declaration: 'high', highValue: 25, lowValue: null },  // 거리 5
      { id: 'D', declaration: 'high', highValue: 3, lowValue: null },   // 거리 17 → 4위, 0점
    ]);
    check('하이 3·2·1 그리고 4위는 0점', rows.map((r) => r.points), [3, 2, 1, 0]);
    check('하이 1위는 20에 딱 맞은 팀', rows[0].rank, 1);
  }

  {
    // 20을 넘어가도 거리로만 잰다 (19와 21은 같은 거리)
    const rows = judgeRound([
      { id: 'A', declaration: 'high', highValue: 21, lowValue: null },
      { id: 'B', declaration: 'high', highValue: 19, lowValue: null },
    ]);
    check('19와 21은 공동 1위 → (3+2)/2 = 2점씩', rows.map((r) => r.points), [2, 2]);
  }

  {
    // 로우: 1에 가까운 순서
    const rows = judgeRound([
      { id: 'A', declaration: 'low', highValue: null, lowValue: 1 },
      { id: 'B', declaration: 'low', highValue: null, lowValue: 0 },   // 거리 1
      { id: 'C', declaration: 'low', highValue: null, lowValue: 2 },   // 거리 1
    ]);
    check('로우 1위 3점, 공동 2위는 (2+1)/2 = 1점씩', rows.map((r) => r.points), [3, 1, 1]);
  }

  {
    // 스윙: 두 수식이 다 있어야 하고, 성공하면 10점
    const rows = judgeRound([
      { id: 'A', declaration: 'swing', highValue: 20, lowValue: 1 },   // 거리 0
      { id: 'B', declaration: 'swing', highValue: 18, lowValue: 3 },   // 거리 4
      { id: 'C', declaration: 'swing', highValue: 20, lowValue: null },// 수식 하나뿐
    ]);
    check('스윙 성공 10점, 다음 2점, 수식이 하나면 0점', rows.map((r) => r.points), [10, 2, 0]);
    check('스윙 수식이 하나뿐이면 안내가 붙는다', rows[2].note, '스윙은 수식 두 개가 모두 있어야 합니다');
  }

  {
    // 하이·로우·스윙은 서로 다른 무리로 따로 겨룬다
    const rows = judgeRound([
      { id: 'H', declaration: 'high', highValue: 20, lowValue: null },
      { id: 'L', declaration: 'low', highValue: null, lowValue: 1 },
      { id: 'S', declaration: 'swing', highValue: 20, lowValue: 1 },
    ]);
    check('각 무리에서 1위라 3 / 3 / 10', rows.map((r) => r.points), [3, 3, 10]);
  }

  check('미제출은 0점', judgeRound([{ id: 'X', declaration: null, highValue: null, lowValue: null }])[0].points, 0);
  check('계산 오류(값 null)는 0점', judgeRound([{ id: 'X', declaration: 'high', highValue: null, lowValue: null }])[0].points, 0);

  {
    // 목표값을 바꿀 수 있다 (원본 앱의 「하이/로우 순위 판정 기준 설정」)
    const rows = judgeRound(
      [{ id: 'A', declaration: 'high', highValue: 30, lowValue: null },
       { id: 'B', declaration: 'high', highValue: 20, lowValue: null }],
      { targetHigh: 30 });
    check('목표를 30으로 바꾸면 30이 1위', rows[0].points, 3);
  }

  return results;
}

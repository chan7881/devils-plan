/**
 * 수식 하이로우 — 수식 파싱과 계산. DOM을 모른다.
 *
 * 원본 PPT가 못박은 것:
 *   - 「괄호가 없는 경우 1순위 곱셈 나눗셈 계산, 2순위 덧셈 뺄셈 계산」
 *   - 「루트 카드는 하나의 숫자에만 씌울 수 있습니다」
 *   - 0 관련: 0 ÷ 5 = 0 / 어떤수 ÷ 0 은 **값이 없음** (0 ÷ 0 도 마찬가지)
 *   - √ 는 제곱근(양수). √1 = 1 < √2 < √3 < √4 = 2
 *
 * 문법 (괄호 없음):
 *   expr   := term (('+' | '−') term)*
 *   term   := factor (('×' | '÷') factor)*
 *   factor := ['√'] number
 *
 * 토큰은 { type: 'number', value, color } 또는 { type: 'op', op } 이다.
 */

export const OPS = ['add', 'sub', 'mul', 'div', 'sqrt'];

const OP_SYMBOL = { add: '+', sub: '−', mul: '×', div: '÷', sqrt: '√' };

/** 오류 종류 — UI가 사람 말로 바꿔 보여 준다. */
export const ERRORS = {
  EMPTY: '수식이 비어 있습니다.',
  LEADING_OP: '수식이 연산자로 시작합니다.',
  TRAILING_OP: '수식이 연산자로 끝납니다.',
  CONSECUTIVE_OPS: '연산자가 연달아 있습니다.',
  CONSECUTIVE_NUMBERS: '숫자가 연달아 있습니다. 사이에 연산자가 필요합니다.',
  SQRT_NOT_ON_NUMBER: '루트는 숫자 하나에만 씌울 수 있습니다.',
  DIVIDE_BY_ZERO: '0으로 나눌 수 없습니다 — 값이 없습니다.',
};

/**
 * 토큰 목록을 계산한다.
 * @param {Array} tokens
 * @returns {{ok:true, value:number, text:string} | {ok:false, error:string, text:string}}
 */
export function evaluate(tokens) {
  const text = formulaText(tokens);
  const err = validate(tokens);
  if (err) return { ok: false, error: err, text };

  let i = 0;
  const peek = () => tokens[i];
  const isOp = (t, ...ops) => t && t.type === 'op' && ops.includes(t.op);

  function factor() {
    let useSqrt = false;
    if (isOp(peek(), 'sqrt')) { useSqrt = true; i++; }
    const t = tokens[i++];
    // validate()가 이미 걸러 주지만, 방어적으로 한 번 더
    if (!t || t.type !== 'number') throw new EvalError(ERRORS.SQRT_NOT_ON_NUMBER);
    return useSqrt ? Math.sqrt(t.value) : t.value;
  }

  function term() {
    let acc = factor();
    while (isOp(peek(), 'mul', 'div')) {
      const op = tokens[i++].op;
      const rhs = factor();
      if (op === 'div') {
        // 「어떤수 ÷ 0 은 값이 없음」 — 0 ÷ 0 도 포함.
        //
        // 참고: 지금 문법에는 괄호가 없어서, 이 자리에서 막지 않아도 결과가
        // Infinity/NaN으로 흘러 마지막 isFinite 검사에 걸린다(변이 검사로 확인함 —
        // 두 경로가 현재는 구별되지 않는다). 그래도 여기서 막는 이유는 두 가지다:
        //   ① 오류가 난 지점이 분명해진다
        //   ② 나중에 괄호를 넣으면 `1 ÷ (5 ÷ 0)` 이 0으로 계산돼 조용히 통과한다
        if (rhs === 0) throw new EvalError(ERRORS.DIVIDE_BY_ZERO);
        acc = acc / rhs;
      } else {
        acc = acc * rhs;
      }
    }
    return acc;
  }

  function expr() {
    let acc = term();
    while (isOp(peek(), 'add', 'sub')) {
      const op = tokens[i++].op;
      const rhs = term();
      acc = op === 'add' ? acc + rhs : acc - rhs;
    }
    return acc;
  }

  try {
    const value = expr();
    if (i !== tokens.length) return { ok: false, error: ERRORS.CONSECUTIVE_NUMBERS, text };
    if (!Number.isFinite(value)) return { ok: false, error: ERRORS.DIVIDE_BY_ZERO, text };
    return { ok: true, value, text };
  } catch (e) {
    if (e instanceof EvalError) return { ok: false, error: e.message, text };
    throw e;
  }
}

class EvalError extends Error {}

/** 계산 전에 문법을 본다. 오류가 없으면 null. */
export function validate(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return ERRORS.EMPTY;

  const first = tokens[0];
  if (first.type === 'op' && first.op !== 'sqrt') return ERRORS.LEADING_OP;

  const last = tokens[tokens.length - 1];
  if (last.type === 'op') return ERRORS.TRAILING_OP;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = tokens[i + 1];

    if (t.type === 'op' && t.op === 'sqrt') {
      // 루트 뒤에는 반드시 숫자가 온다 (루트에 루트를 씌울 수 없다)
      if (!next || next.type !== 'number') return ERRORS.SQRT_NOT_ON_NUMBER;
      continue;
    }
    if (t.type === 'op') {
      // 사칙연산 뒤에는 숫자나 루트만 온다
      if (!next) return ERRORS.TRAILING_OP;
      if (next.type === 'op' && next.op !== 'sqrt') return ERRORS.CONSECUTIVE_OPS;
      continue;
    }
    // 숫자 뒤에 숫자가 바로 오면 안 된다
    if (next && next.type === 'number') return ERRORS.CONSECUTIVE_NUMBERS;
    if (next && next.type === 'op' && next.op === 'sqrt') return ERRORS.CONSECUTIVE_NUMBERS;
  }
  return null;
}

/** 사람이 읽는 수식 문자열. */
export function formulaText(tokens) {
  if (!Array.isArray(tokens) || !tokens.length) return '';
  return tokens.map((t) => (t.type === 'number' ? String(t.value) : OP_SYMBOL[t.op] ?? '?'))
    .join(' ')
    .replace(/√ /g, '√');
}

/** 화면에 보여 줄 값. 정수면 그대로, 아니면 소수 셋째 자리까지. */
export function formatValue(v) {
  if (!Number.isFinite(v)) return '값 없음';
  if (Number.isInteger(v)) return String(v);
  return String(Math.round(v * 1000) / 1000);
}

/* ── 배부된 카드와 대조 ────────────────────────────────────────────
   원본 앱의 「미지급 카드」 「수량 초과」 검사를 그대로 옮긴 것이다. */

/**
 * 제출 수식이 그 팀에게 배부된 카드만 썼는지 본다.
 * @param {Array} tokens 제출 수식
 * @param {{numbers:Array, ops:string[]}} hand 배부된 카드
 * @param {object} [opt]
 * @param {boolean} [opt.checkColor=true] 색까지 맞춰 본다. 오프라인 실물 카드로
 *        진행할 때는 색을 제출지에 안 적어도 되므로 끌 수 있다.
 * @returns {{ok:boolean, problems:string[]}}
 */
export function checkAgainstHand(tokens, hand, opt = {}) {
  const { checkColor = true } = opt;
  const problems = [];

  const key = (c) => (checkColor ? `${c.value}-${c.color}` : String(c.value));
  const label = (c) => (checkColor ? `${c.value}(${c.color})` : String(c.value));

  const avail = new Map();
  for (const c of hand.numbers ?? []) avail.set(key(c), (avail.get(key(c)) ?? 0) + 1);
  const availOps = new Map();
  for (const o of hand.ops ?? []) availOps.set(o, (availOps.get(o) ?? 0) + 1);

  const usedNum = new Map();
  const usedOps = new Map();
  for (const t of tokens) {
    if (t.type === 'number') usedNum.set(key(t), (usedNum.get(key(t)) ?? 0) + 1);
    else usedOps.set(t.op, (usedOps.get(t.op) ?? 0) + 1);
  }

  for (const [k, n] of usedNum) {
    const have = avail.get(k) ?? 0;
    if (have === 0) problems.push(`미지급 카드: 숫자 ${k.replace('-', ' ')}`);
    else if (n > have) problems.push(`수량 초과: 숫자 ${k.replace('-', ' ')} — 보유 ${have}장 / 사용 ${n}장`);
  }
  for (const [o, n] of usedOps) {
    const have = availOps.get(o) ?? 0;
    if (have === 0) problems.push(`미지급 카드: ${OP_SYMBOL[o]}`);
    else if (n > have) problems.push(`수량 초과: ${OP_SYMBOL[o]} — 보유 ${have}장 / 사용 ${n}장`);
  }

  return { ok: problems.length === 0, problems };
}

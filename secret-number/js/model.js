/**
 * 시크릿 넘버 — 순수 로직. DOM을 모른다.
 *
 * 규칙의 정본은 원본 연수 자료의 「시크릿넘버 ppt.pptx」다.
 *   - 각 팀은 1~100 중 고유번호 1개를 받는다. 자신을 포함해 누구에게도 공개하지 않는다.
 *   - 콘택트룸에서 두 팀이 같은 종류의 티켓을 1장씩 내면 단서를 얻는다.
 *     단서는 두 팀에게 같은 결과로 동시에 공개된다.
 *   - 카드 4종: 더하기 · 곱하기 · 나누기 · 0
 *   - 게임이 끝나면 모든 팀의 고유번호를 추측해 제출한다.
 */

/* ── 카드(티켓) 종류 ───────────────────────────────────────────── */

export const CARD_KINDS = ['add', 'mul', 'div', 'zero'];

export const CARD_LABELS = {
  add:  '더하기',
  mul:  '곱하기',
  div:  '나누기',
  zero: '0',
};

export const CARD_DESCRIPTIONS = {
  add:  '두 고유번호의 합을 공개',
  mul:  '두 고유번호의 곱의 일의 자리 수를 공개',
  div:  '큰 수를 작은 수로 나눈 몫을 공개',
  zero: '두 번호 사이에 든 0의 개수를 공개 (고유번호 자신은 제외)',
};

/* ── 고유번호 배정 ─────────────────────────────────────────────── */

/**
 * 팀마다 겹치지 않는 고유번호를 뽑는다.
 * @param {number} teamCount
 * @param {object} [opt]
 * @param {number} [opt.min=1] @param {number} [opt.max=100]
 * @param {() => number} [opt.rng=Math.random] 0 이상 1 미만 (테스트에서 고정한다)
 * @returns {number[]}
 */
export function assignNumbers(teamCount, opt = {}) {
  const { min = 1, max = 100, rng = Math.random } = opt;
  const size = max - min + 1;
  if (teamCount > size) {
    throw new Error(`번호 범위(${min}~${max}, ${size}개)보다 팀이 많습니다: ${teamCount}팀`);
  }
  // 부분 피셔-예이츠: 앞에서 teamCount개만 섞는다
  const pool = Array.from({ length: size }, (_, i) => min + i);
  for (let i = 0; i < teamCount; i++) {
    const j = i + Math.floor(rng() * (size - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, teamCount);
}

/* ── 단서 계산 ─────────────────────────────────────────────────── */

/**
 * min < n < max 인 정수들에 들어 있는 숫자 0의 개수.
 * 「두 번호 사이에 포함된 0의 개수, 단 고유번호는 제외」 → 양 끝을 뺀다.
 */
export function countZerosBetween(a, b) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  let total = 0;
  for (let n = lo + 1; n < hi; n++) {
    let m = n;
    if (m === 0) { total += 1; continue; }
    while (m > 0) { if (m % 10 === 0) total += 1; m = Math.floor(m / 10); }
  }
  return total;
}

/**
 * 콘택트룸 단서 하나를 계산한다.
 *
 * @param {'add'|'mul'|'div'|'zero'} kind
 * @param {number} a @param {number} b 두 팀의 고유번호
 * @param {object} [opt]
 * @param {boolean} [opt.bucketSum=true] 합이 20 이하 / 180 이상이면 정확한 수 대신
 *        「20 이하」 「180 이상」으로 뭉뚱그려 공개한다. 원본 PPT의 카드 설명
 *        (`20 이하 = 3~20`, `180 이상 = 180~199`)을 그대로 옮긴 것이다.
 * @returns {{kind:string, display:string, exact:number, detail:string}}
 */
export function computeClue(kind, a, b, opt = {}) {
  const { bucketSum = true } = opt;
  const lo = Math.min(a, b), hi = Math.max(a, b);

  switch (kind) {
    case 'add': {
      const sum = a + b;
      if (bucketSum && sum <= 20) return { kind, display: '20 이하', exact: sum, detail: `${a} + ${b} = ${sum}` };
      if (bucketSum && sum >= 180) return { kind, display: '180 이상', exact: sum, detail: `${a} + ${b} = ${sum}` };
      return { kind, display: String(sum), exact: sum, detail: `${a} + ${b} = ${sum}` };
    }
    case 'mul': {
      const prod = a * b;
      const ones = prod % 10;
      return { kind, display: String(ones), exact: ones, detail: `${a} × ${b} = ${prod} → 일의 자리 ${ones}` };
    }
    case 'div': {
      const q = Math.floor(hi / lo);
      return { kind, display: String(q), exact: q, detail: `${hi} ÷ ${lo} = 몫 ${q}` };
    }
    case 'zero': {
      const z = countZerosBetween(a, b);
      const span = hi - lo - 1;
      return {
        kind, display: String(z), exact: z,
        detail: span <= 0
          ? `${lo}과 ${hi} 사이에 수가 없습니다 → 0개`
          : `${lo + 1} ~ ${hi - 1}의 ${span}개 수에 든 0의 개수 = ${z}`,
      };
    }
    default:
      throw new Error(`모르는 카드 종류: ${kind}`);
  }
}

/* ── 채점 ─────────────────────────────────────────────────────── */

/**
 * 제출된 추측을 채점한다.
 *
 *  - 자신의 고유번호: 맞히면 +5, 틀리면 −5
 *  - 다른 팀의 고유번호: 맞히면 +1, 틀리면 −1
 *  - 보너스: 모든 팀의 고유번호를 다 맞히면 +5
 *  - 패널티: 내 고유번호를 맞힌 다른 팀 1팀당 −1
 *  - **답을 적지 않으면 감점되지 않는다** (빈칸은 0점, 정답도 오답도 아니다)
 *
 * @param {number[]} secrets 팀 순서대로의 실제 고유번호
 * @param {Array<Array<number|null>>} guesses guesses[i][j] = i팀이 적은 j팀의 번호 (null = 미기입)
 * @returns {Array<{team:number, self:number, others:number, bonus:number, penalty:number,
 *                  score:number, correctCount:number, blankCount:number}>}
 */
export function scoreGuesses(secrets, guesses) {
  const n = secrets.length;

  // 각 팀의 번호를 몇 팀이 맞혔는지 (자기 자신은 빼고 센다)
  const guessedBy = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const g = guesses[i]?.[j];
      if (g !== null && g !== undefined && g === secrets[j]) guessedBy[j] += 1;
    }
  }

  return secrets.map((_, i) => {
    let self = 0, others = 0, correctCount = 0, blankCount = 0;
    for (let j = 0; j < n; j++) {
      const g = guesses[i]?.[j];
      const blank = (g === null || g === undefined || g === '');
      if (blank) { blankCount += 1; continue; }
      const hit = Number(g) === secrets[j];
      if (hit) correctCount += 1;
      if (i === j) self += hit ? 5 : -5;
      else others += hit ? 1 : -1;
    }
    const bonus = correctCount === n ? 5 : 0;
    const penalty = -guessedBy[i];
    return {
      team: i,
      self, others, bonus, penalty,
      score: self + others + bonus + penalty,
      correctCount, blankCount,
    };
  });
}

/* ── 티켓 ─────────────────────────────────────────────────────── */

/** 팀마다 4종 1장씩. 「각 플레이어는 카드 4종류, 1세트씩 받습니다」 */
export function initialTickets(teamCount) {
  return Array.from({ length: teamCount }, () =>
    Object.fromEntries(CARD_KINDS.map((k) => [k, 1])));
}

/**
 * 콘택트룸 성립 여부를 본다. 두 팀이 **같은 종류**의 티켓을 1장씩 내야 한다.
 * @returns {{ok:boolean, reason?:string}}
 */
export function canContact(tickets, a, b, kind) {
  if (a === b) return { ok: false, reason: '같은 팀끼리는 콘택트할 수 없습니다.' };
  if (!CARD_KINDS.includes(kind)) return { ok: false, reason: '모르는 카드 종류입니다.' };
  if (!(tickets[a]?.[kind] > 0)) return { ok: false, reason: `${a + 1}팀에 ${CARD_LABELS[kind]} 티켓이 없습니다.` };
  if (!(tickets[b]?.[kind] > 0)) return { ok: false, reason: `${b + 1}팀에 ${CARD_LABELS[kind]} 티켓이 없습니다.` };
  return { ok: true };
}

/** 티켓을 1장씩 차감한 새 배열을 돌려준다 (원본은 건드리지 않는다). */
export function spendTickets(tickets, a, b, kind) {
  return tickets.map((t, i) =>
    (i === a || i === b) ? { ...t, [kind]: t[kind] - 1 } : { ...t });
}

/**
 * 티켓 세트 추가 지급은 **팀당 한 번**뿐이다.
 * 원본에서는 보유 피스 2개를 내고 샀지만, 이 모음은 게임끼리 점수를 이어 붙이지 않아
 * 피스가 없다. 그래서 비용 없이 진행자가 판단해 한 번 더 주는 것으로 바꿨다.
 */
export const TICKET_SET_LIMIT_PER_TEAM = 1;

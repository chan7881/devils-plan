/**
 * 시크릿 넘버 검증.
 *
 * 단서 계산은 학생이 이걸 믿고 추리한다 — 틀리면 게임 자체가 성립하지 않는다.
 * 공통 규칙 2번의 검증 절차를 적용해, 손으로 구한 값과 대조한다.
 * 결과 객체의 필드는 `label`이다.
 */
import {
  assignNumbers, countZerosBetween, computeClue, scoreGuesses,
  initialTickets, canContact, spendTickets, CARD_KINDS,
} from './model.js';
import { PIECE_TABLES, distributePieces } from '../../common/js/pieces.js';

const results = [];
function check(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  results.push({ ok: a === e, label: a === e ? label : `${label}\n    기대: ${e}\n    실제: ${a}` });
}
function checkThrows(label, fn) {
  let threw = false;
  try { fn(); } catch (_) { threw = true; }
  results.push({ ok: threw, label: threw ? label : `${label}\n    기대: 예외 발생 / 실제: 조용히 통과` });
}

/** 고정 난수 — 테스트를 재현 가능하게 */
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function runAll() {
  results.length = 0;

  /* ── 고유번호 배정 ─────────────────────────────────────────── */

  {
    const nums = assignNumbers(10, { rng: seeded(42) });
    check('10팀 배정 → 10개', nums.length, 10);
    check('겹치는 번호 없음', new Set(nums).size, 10);
    check('전부 1~100 안', nums.every((n) => n >= 1 && n <= 100), true);
  }
  check('범위를 좁히면 그 안에서만', assignNumbers(5, { min: 1, max: 5, rng: seeded(7) }).sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  checkThrows('범위보다 팀이 많으면 예외', () => assignNumbers(6, { min: 1, max: 5 }));

  /* ── 단서: 더하기 ───────────────────────────────────────────
     「두 고유번호의 합을 공개. 20 이하 = 3~20, 180 이상 = 180~199」 */

  check('합 47 (7+40)', computeClue('add', 7, 40).display, '47');
  check('합은 순서를 안 탄다', computeClue('add', 40, 7).display, computeClue('add', 7, 40).display);
  check('합 20은 「20 이하」로 뭉뚱그린다', computeClue('add', 8, 12).display, '20 이하');
  check('합 21은 그대로 공개', computeClue('add', 9, 12).display, '21');
  check('합 180은 「180 이상」', computeClue('add', 80, 100).display, '180 이상');
  check('합 179는 그대로 공개', computeClue('add', 79, 100).display, '179');
  check('뭉뚱그리기를 끄면 정확한 수', computeClue('add', 8, 12, { bucketSum: false }).display, '20');
  check('뭉뚱그려도 exact에는 진짜 값', computeClue('add', 8, 12).exact, 20);

  /* ── 단서: 곱하기 ─── 「곱의 일의 자리 수」 ───────────────────── */

  check('7 × 40 = 280 → 0', computeClue('mul', 7, 40).display, '0');
  check('13 × 27 = 351 → 1', computeClue('mul', 13, 27).display, '1');
  check('9 × 9 = 81 → 1', computeClue('mul', 9, 9).display, '1');
  check('100 × 33 = 3300 → 0', computeClue('mul', 100, 33).display, '0');
  check('곱은 순서를 안 탄다', computeClue('mul', 27, 13).display, computeClue('mul', 13, 27).display);

  /* ── 단서: 나누기 ─── 「큰 수를 작은 수로 나눈 몫」 ─────────────── */

  check('97 ÷ 7 = 몫 13', computeClue('div', 7, 97).display, '13');
  check('작은 수를 먼저 줘도 같다 (항상 큰 수 ÷ 작은 수)', computeClue('div', 97, 7).display, '13');
  check('100 ÷ 1 = 100', computeClue('div', 1, 100).display, '100');
  check('50 ÷ 100 이 아니라 100 ÷ 50 = 2', computeClue('div', 100, 50).display, '2');
  check('나머지는 버린다: 99 ÷ 10 = 9', computeClue('div', 10, 99).display, '9');

  /* ── 단서: 0의 개수 ───────────────────────────────────────────
     「두 번호 사이에 포함된 0의 개수, 단 고유번호는 제외」
     양 끝을 뺀 사이의 수들에 들어 있는 숫자 0을 센다. */

  check('7과 97 사이 → 10,20,…,90의 0 아홉 개', countZerosBetween(7, 97), 9);
  check('순서를 바꿔도 같다', countZerosBetween(97, 7), 9);
  check('붙어 있는 두 수 사이엔 아무것도 없다', countZerosBetween(40, 41), 0);
  check('9와 11 사이 = 10 하나 → 0 한 개', countZerosBetween(9, 11), 1);
  check('10과 20 사이엔 0이 없다 (양 끝 제외)', countZerosBetween(10, 20), 0);
  check('99와 101 사이 = 100 → 0 두 개', countZerosBetween(99, 101), 2);
  check('1과 100 사이 = 10~90의 아홉 개', countZerosBetween(1, 100), 9);
  check('같은 수끼리는 0', countZerosBetween(50, 50), 0);
  check('단서 표시도 같은 값', computeClue('zero', 7, 97).display, '9');

  checkThrows('모르는 카드 종류는 예외', () => computeClue('unknown', 1, 2));

  /* ── 티켓 ─────────────────────────────────────────────────── */

  {
    const t = initialTickets(3);
    check('팀마다 4종 1장씩', t.map((x) => CARD_KINDS.map((k) => x[k])), [[1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1]]);
    check('콘택트 성립', canContact(t, 0, 1, 'add').ok, true);
    check('같은 팀끼리는 불가', canContact(t, 0, 0, 'add').ok, false);
    const t2 = spendTickets(t, 0, 1, 'add');
    check('양쪽에서 1장씩 빠진다', [t2[0].add, t2[1].add, t2[2].add], [0, 0, 1]);
    check('원본 배열은 그대로', t[0].add, 1);
    check('티켓이 떨어지면 불가', canContact(t2, 0, 1, 'add').ok, false);
    check('다른 종류는 아직 가능', canContact(t2, 0, 1, 'div').ok, true);
  }

  /* ── 채점 ─────────────────────────────────────────────────────
     자기 번호 ±5 · 남의 번호 ±1 · 전부 맞히면 +5 · 내 번호를 맞힌 팀 1팀당 −1
     미기입은 감점 없음 */

  {
    const secrets = [10, 20, 30];
    // 0팀: 전부 정답 / 1팀: 전부 오답 / 2팀: 전부 미기입
    const rows = scoreGuesses(secrets, [
      [10, 20, 30],
      [99, 99, 99],
      [null, null, null],
    ]);
    // 0팀: 자기 +5, 남 +1+1, 보너스 +5 = 12. 내 번호(10)를 맞힌 다른 팀 없음 → 0
    check('전부 맞힌 팀', rows[0].score, 12);
    // 1팀: 자기 −5, 남 −1−1 = −7. 내 번호(20)를 0팀이 맞혔으므로 −1 → −8
    check('전부 틀린 팀 (내 번호를 남이 맞힌 것도 반영)', rows[1].score, -8);
    // 2팀: 전부 미기입 = 0. 내 번호(30)를 0팀이 맞혔으므로 −1
    check('미기입은 감점 없음, 다만 남이 내 번호를 맞히면 −1', rows[2].score, -1);
    check('미기입 개수', rows[2].blankCount, 3);
  }

  check('자기 번호만 맞히고 나머지는 비움 → +5',
    scoreGuesses([10, 20], [[10, null], [null, null]])[0].score, 5);

  check('자기 번호를 틀리면 −5',
    scoreGuesses([10, 20], [[11, null], [null, null]])[0].score, -5);

  check('남의 번호 하나만 맞히면 +1',
    scoreGuesses([10, 20], [[null, 20], [null, null]])[0].score, 1);

  {
    // 한 팀 것만 남고 전부 맞힌 게 아니면 보너스 없음
    const rows = scoreGuesses([10, 20, 30], [[10, 20, null], [null, null, null], [null, null, null]]);
    check('일부만 맞히면 보너스 없음 (5+1=6)', rows[0].bonus, 0);
    check('그때 점수는 6', rows[0].score, 6);
  }

  {
    // 내 번호를 두 팀이 맞히면 −2
    const rows = scoreGuesses([10, 20, 30], [
      [null, null, null],
      [10, null, null],
      [10, null, null],
    ]);
    check('내 번호를 두 팀이 맞히면 −2', rows[0].penalty, -2);
    check('자기 번호를 자기가 안 적었으니 self는 0', rows[0].self, 0);
  }

  check('자기 자신을 맞힌 건 패널티에 안 들어간다',
    scoreGuesses([10, 20], [[10, null], [null, null]])[0].penalty, 0);

  /* ── 채점 → 피스 배분 (공용 로직과 이어 붙여 확인) ───────────── */

  {
    const secrets = [10, 20, 30, 40];
    const rows = scoreGuesses(secrets, [
      [10, 20, 30, 40],   // 12점
      [10, 20, null, null], // 자기 −5? 아니: 1팀의 자기 번호는 20 → 맞힘 +5, 남(10) 맞힘 +1 = 6
      [null, null, null, null], // 0
      [99, 99, 99, 99],   // 자기 −5, 남 −3 = −8
    ]);
    const pieces = distributePieces(
      rows.map((r) => ({ id: r.team, score: r.score })),
      PIECE_TABLES['secret-number']);
    check('점수 순으로 피스가 5·4·3·2',
      pieces.map((p) => [p.id, p.pieces]),
      [[0, 5], [1, 4], [2, 3], [3, 2]]);
  }

  return results;
}

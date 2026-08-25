/**
 * rank.js 검증.
 *
 * 결과 객체의 필드는 `label`이다 (circuit 리포와 같은 규격).
 */
import { rankByScore } from './rank.js';

const results = [];
function check(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  results.push({ ok: a === e, label: a === e ? label : `${label}\n    기대: ${e}\n    실제: ${a}` });
}

const ranks = (rows) => Object.fromEntries(rows.map((r) => [r.id, r.rank]));
const mk = (obj) => Object.entries(obj).map(([id, score]) => ({ id, score }));

export function runAll() {
  results.length = 0;

  check('점수 높은 순으로 1, 2, 3등',
    ranks(rankByScore(mk({ a: 10, b: 30, c: 20 }))),
    { b: 1, c: 2, a: 3 });

  check('등수 순으로 돌려준다',
    rankByScore(mk({ a: 10, b: 30, c: 20 })).map((r) => r.id),
    ['b', 'c', 'a']);

  check('공동 2등 두 팀 → 다음은 4등 (3등은 없다)',
    ranks(rankByScore(mk({ a: 30, b: 20, c: 20, d: 10 }))),
    { a: 1, b: 2, c: 2, d: 4 });

  check('공동 1등 세 팀 → 다음은 4등',
    ranks(rankByScore(mk({ a: 10, b: 10, c: 10, d: 5 }))),
    { a: 1, b: 1, c: 1, d: 4 });

  check('전원 동점이면 모두 1등',
    ranks(rankByScore(mk({ a: 7, b: 7, c: 7 }))),
    { a: 1, b: 1, c: 1 });

  check('음수 점수도 순서대로',
    ranks(rankByScore(mk({ a: -1, b: -5, c: 3 }))),
    { c: 1, a: 2, b: 3 });

  check('minScore 미만은 순위 밖 (rank null)',
    ranks(rankByScore(mk({ a: 8, b: 0, c: -2 }), { minScore: 0 })),
    { a: 1, b: 2, c: null });

  check('순위 밖은 맨 뒤로 간다',
    rankByScore(mk({ a: 8, b: -2, c: 3 }), { minScore: 0 }).map((r) => r.id),
    ['a', 'c', 'b']);

  check('빈 입력', rankByScore([]), []);
  check('한 팀뿐', ranks(rankByScore(mk({ a: 3 }))), { a: 1 });

  check('원본 배열을 건드리지 않는다', (() => {
    const input = mk({ a: 1, b: 9 });
    rankByScore(input);
    return input.map((e) => e.id);
  })(), ['a', 'b']);

  check('점수도 그대로 실어 준다',
    rankByScore(mk({ a: 5, b: 9 })).map((r) => r.score),
    [9, 5]);

  return results;
}

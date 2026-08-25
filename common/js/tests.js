/**
 * pieces.js 검증.
 *
 * 결과 객체의 필드는 `label`이다 (circuit 리포와 같은 규격).
 * node로 한 번에 돌리려면 README의 「테스트」 절 참고.
 */
import { PIECE_TABLES, groupByRank, distributePieces } from './pieces.js';

const results = [];
function check(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  results.push({ ok: a === e, label: a === e ? label : `${label}\n    기대: ${e}\n    실제: ${a}` });
}

/** 배분 결과를 {id: pieces} 로 납작하게 */
const flat = (rows) => Object.fromEntries(rows.map((r) => [r.id, r.pieces]));
const ranks = (rows) => Object.fromEntries(rows.map((r) => [r.id, r.rank]));

export function runAll() {
  results.length = 0;
  const T = PIECE_TABLES['secret-number']; // [5,4,3,2,1,1]

  // ── 등수 매기기 ──────────────────────────────────────────────
  check('동점 없음 → 1,2,3등',
    groupByRank([{ id: 'a', score: 10 }, { id: 'b', score: 30 }, { id: 'c', score: 20 }])
      .map((g) => [g.rank, g.members.map((m) => m.id)]),
    [[1, ['b']], [2, ['c']], [3, ['a']]]);

  check('2등 두 팀이면 다음은 4등 (동점 수만큼 차순위 제거)',
    groupByRank([{ id: 'a', score: 30 }, { id: 'b', score: 20 }, { id: 'c', score: 20 }, { id: 'd', score: 10 }])
      .map((g) => g.rank),
    [1, 2, 4]);

  // ── 기본 배분 ────────────────────────────────────────────────
  check('동점 없는 6팀은 표 그대로',
    flat(distributePieces(
      [60, 50, 40, 30, 20, 10].map((s, i) => ({ id: `t${i + 1}`, score: s })), T)),
    { t1: 5, t2: 4, t3: 3, t4: 2, t5: 1, t6: 1 });

  check('7등부터는 0피스 (표 밖)',
    flat(distributePieces(
      [70, 60, 50, 40, 30, 20, 10].map((s, i) => ({ id: `t${i + 1}`, score: s })), T)).t7,
    0);

  // ── 동점 처리: PPT 예시 (1등 / 2등 2팀 / 4등 / 5,6등) ─────────
  {
    const rows = distributePieces([
      { id: 'A', score: 16 }, { id: 'B', score: 12 }, { id: 'C', score: 12 },
      { id: 'D', score: 8 }, { id: 'E', score: 4 }, { id: 'F', score: 1 },
    ], T);
    // 2등 동점 2팀 → 4+3=7 을 둘이 나눠 3씩, 1 버림. 다음 팀은 4등.
    check('공동 2등: (4+3)/2 = 3씩, 나머지 1 버림', flat(rows),
      { A: 5, B: 3, C: 3, D: 2, E: 1, F: 1 });
    check('공동 2등 다음 팀은 4등', ranks(rows).D, 4);
  }

  check('공동 1등 3팀: (5+4+3)/3 = 4씩',
    flat(distributePieces([
      { id: 'A', score: 10 }, { id: 'B', score: 10 }, { id: 'C', score: 10 }, { id: 'D', score: 5 },
    ], T)),
    { A: 4, B: 4, C: 4, D: 2 });

  check('전원 동점 6팀: (5+4+3+2+1+1)/6 = 2씩, 나머지 4 버림',
    flat(distributePieces(
      [1, 1, 1, 1, 1, 1].map((s, i) => ({ id: `t${i + 1}`, score: s })), T)),
    { t1: 2, t2: 2, t3: 2, t4: 2, t5: 2, t6: 2 });

  check('4등 동점 3팀: (2+1+1)/3 = 1씩',
    flat(distributePieces([
      { id: 'A', score: 9 }, { id: 'B', score: 8 }, { id: 'C', score: 7 },
      { id: 'D', score: 1 }, { id: 'E', score: 1 }, { id: 'F', score: 1 },
    ], T)),
    { A: 5, B: 4, C: 3, D: 1, E: 1, F: 1 });

  check('표 끝을 넘는 동점(5등 3팀): (1+1+0)/3 = 0씩',
    flat(distributePieces([
      { id: 'A', score: 9 }, { id: 'B', score: 8 }, { id: 'C', score: 7 }, { id: 'D', score: 6 },
      { id: 'E', score: 1 }, { id: 'F', score: 1 }, { id: 'G', score: 1 },
    ], T)),
    { A: 5, B: 4, C: 3, D: 2, E: 0, F: 0, G: 0 });

  // ── 규칙 레이스 표는 다르다 ──────────────────────────────────
  check('규칙 레이스 표 [4,4,3,3,1,1]',
    flat(distributePieces(
      [60, 50, 40, 30, 20, 10].map((s, i) => ({ id: `t${i + 1}`, score: s })), PIECE_TABLES['race'])),
    { t1: 4, t2: 4, t3: 3, t4: 3, t5: 1, t6: 1 });

  check('규칙 레이스 공동 1등 2팀: (4+4)/2 = 4씩 (버릴 것 없음)',
    flat(distributePieces([
      { id: 'A', score: 10 }, { id: 'B', score: 10 }, { id: 'C', score: 5 },
    ], PIECE_TABLES['race'])),
    { A: 4, B: 4, C: 3 });

  // ── 몽타주 전용 옵션 ─────────────────────────────────────────
  {
    const rows = distributePieces([
      { id: 'A', score: 8 }, { id: 'B', score: 4 }, { id: 'C', score: 0 }, { id: 'D', score: -2 },
    ], PIECE_TABLES['montage'], { minScore: 0 });
    check('몽타주: 승점 0점 이상만 순위 (음수 팀은 rank null, 0피스)',
      rows.map((r) => [r.id, r.rank, r.pieces]),
      [['A', 1, 3], ['B', 2, 2], ['C', 3, 1], ['D', null, 0]]);
  }

  check('몽타주: 표 끝을 넘는 동점조는 1피스씩 (tailTieFloorOne)',
    flat(distributePieces([
      { id: 'A', score: 9 }, { id: 'B', score: 8 }, { id: 'C', score: 7 }, { id: 'D', score: 6 },
      { id: 'E', score: 1 }, { id: 'F', score: 1 }, { id: 'G', score: 1 },
    ], PIECE_TABLES['montage'], { minScore: 0, tailTieFloorOne: true })),
    { A: 3, B: 2, C: 1, D: 1, E: 1, F: 1, G: 1 });

  check('tailTieFloorOne을 꺼두면 같은 상황이 0피스',
    flat(distributePieces([
      { id: 'A', score: 9 }, { id: 'B', score: 8 }, { id: 'C', score: 7 }, { id: 'D', score: 6 },
      { id: 'E', score: 1 }, { id: 'F', score: 1 }, { id: 'G', score: 1 },
    ], PIECE_TABLES['montage'], { minScore: 0 })).E,
    0);

  // ── 경계 ─────────────────────────────────────────────────────
  check('빈 입력', distributePieces([], T), []);
  check('한 팀뿐', flat(distributePieces([{ id: 'A', score: 3 }], T)), { A: 5 });
  check('원본 배열을 건드리지 않는다', (() => {
    const input = [{ id: 'A', score: 1 }, { id: 'B', score: 9 }];
    distributePieces(input, T);
    return input.map((e) => e.id);
  })(), ['A', 'B']);

  return results;
}

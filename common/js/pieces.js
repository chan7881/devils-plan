/**
 * 피스(승점) 배분 — 여러 게임이 공유하는 순수 로직.
 *
 * 시크릿 넘버·기억의 조각·수식 하이로우·규칙 레이스가 같은 규칙을 쓴다.
 * 규칙이 미묘해서 게임마다 따로 구현하면 반드시 어긋나므로 여기 한 곳에 둔다.
 *
 * 근거 문서 (G드라이브 원본):
 *   「데블스 플랜 연수 피스 배분.hwp」
 *   각 게임 PPT의 "피스는 각 순위에 따라 분배됩니다" / "만약 공동 등수가 발생,
 *   다음 순위 피스 포함해서 균등 분배 … 나머지는 버립니다" 슬라이드
 *
 * DOM을 모른다 — tests.js에서 그대로 검증한다.
 */

/** 게임별 순위 → 피스 표 (1등부터). 표 길이를 넘는 순위는 0피스. */
export const PIECE_TABLES = {
  'secret-number': [5, 4, 3, 2, 1, 1], // 시크릿 넘버 (총 16)
  'memory':        [5, 4, 3, 2, 1, 1], // 기억의 조각 (총 16)
  'high-low':      [5, 4, 3, 2, 1, 1], // 수식 하이로우 (총 16)
  'race':          [4, 4, 3, 3, 1, 1], // 규칙 레이스 (총 16)
  'montage':       [3, 2, 1, 1, 1],    // 몽타주 (총 8)
};

/**
 * 점수 목록을 등수로 묶는다. 표준 경쟁 순위(1,2,2,4,…) —
 * 「동점팀 수만큼 차순위 제거」가 이것이다.
 *
 * @param {Array<{id:*, score:number}>} entries
 * @returns {Array<{rank:number, members:Array}>} 등수 오름차순
 */
export function groupByRank(entries) {
  const sorted = [...entries].sort((a, b) => b.score - a.score);
  const groups = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && sorted[j].score === sorted[i].score) j++;
    groups.push({ rank: i + 1, members: sorted.slice(i, j) });
    i = j;
  }
  return groups;
}

/** 표에서 rank번째(1-based) 피스. 표 밖이면 0. */
function pieceAt(table, rank) {
  return rank >= 1 && rank <= table.length ? table[rank - 1] : 0;
}

/**
 * 피스를 배분한다.
 *
 * 규칙:
 *  1. 점수 높은 순으로 등수를 매긴다. 동점이면 같은 등수.
 *  2. 동점 k팀이 r등이면 표의 r등부터 (r+k-1)등까지 피스를 모아 균등 분배하고
 *     **나머지는 버린다**(내림).
 *  3. 다음 팀은 (r+k)등이 된다 — 동점 수만큼 차순위가 사라진다.
 *
 * @param {Array<{id:*, score:number}>} entries 팀 id와 점수
 * @param {number[]} table 순위별 피스 표 (PIECE_TABLES 참고)
 * @param {object} [options]
 * @param {number} [options.minScore] 이 점수 미만인 팀은 순위에서 제외하고 0피스.
 *        몽타주: 「최종 승점 0점 이상인 팀만 순위를 결정한다」 → minScore: 0
 * @param {boolean} [options.tailTieFloorOne] 표 끝을 넘어가는 동점조에게 1피스씩 준다.
 *        몽타주: 「5등위를 넘어가는 동점조 발생 시 동일하게 1피스씩 지급」
 * @returns {Array<{id:*, score:number, rank:number|null, pieces:number}>}
 *          입력 순서가 아니라 등수 순으로 돌려준다.
 */
export function distributePieces(entries, table, options = {}) {
  const { minScore, tailTieFloorOne = false } = options;

  const ranked = [];
  const excluded = [];
  for (const e of entries) {
    if (minScore !== undefined && e.score < minScore) excluded.push(e);
    else ranked.push(e);
  }

  const result = [];
  for (const group of groupByRank(ranked)) {
    const k = group.members.length;
    let pool = 0;
    for (let r = group.rank; r < group.rank + k; r++) pool += pieceAt(table, r);

    let each = Math.floor(pool / k); // 나머지는 버린다
    // 표 끝을 넘어가 0이 된 동점조 구제 (몽타주 전용 옵션)
    if (tailTieFloorOne && each === 0 && k > 1 && group.rank <= table.length) each = 1;

    for (const m of group.members) {
      result.push({ id: m.id, score: m.score, rank: group.rank, pieces: each });
    }
  }

  for (const e of excluded) {
    result.push({ id: e.id, score: e.score, rank: null, pieces: 0 });
  }
  return result;
}

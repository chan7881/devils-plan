/**
 * 순위 판정 — 여러 게임이 공유하는 순수 로직. DOM을 모른다.
 *
 * 이 게임 모음은 **한 번에 끝나는 이벤트**로 운영한다. 게임을 이어 붙여 누적하는
 * 토큰(피스) 제도는 쓰지 않는다 — 각 게임 안에서 누가 잘했는지만 가리면 된다.
 *
 * 동점은 표준 경쟁 순위로 처리한다: 1, 2, 2, 4 …
 * 공동 2등이 두 팀이면 3등은 없고 다음이 4등이다.
 */

/**
 * 점수 높은 순으로 등수를 매긴다.
 *
 * @param {Array<{id:*, score:number}>} entries
 * @param {object} [opt]
 * @param {number} [opt.minScore] 이 점수 미만이면 순위에서 빼고 rank를 null로 둔다.
 * @returns {Array<{id:*, score:number, rank:number|null}>} 등수 순으로 돌려준다
 *          (순위 밖은 맨 뒤).
 */
export function rankByScore(entries, opt = {}) {
  const { minScore } = opt;

  const ranked = [], excluded = [];
  for (const e of entries) {
    if (minScore !== undefined && e.score < minScore) excluded.push(e);
    else ranked.push(e);
  }

  const sorted = [...ranked].sort((a, b) => b.score - a.score);
  const out = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && sorted[j].score === sorted[i].score) j++;
    for (let k = i; k < j; k++) out.push({ id: sorted[k].id, score: sorted[k].score, rank: i + 1 });
    i = j; // 동점 수만큼 차순위가 사라진다
  }
  for (const e of excluded) out.push({ id: e.id, score: e.score, rank: null });
  return out;
}

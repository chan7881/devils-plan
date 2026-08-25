/**
 * 수식 하이로우 — 하이·로우·스윙 판정. DOM을 모른다.
 *
 * 원본 PPT(슬라이드 27):
 *   하이(High)  수식값이 20에 가장 가까운 팀부터 3점, 2점, 1점
 *   로우(Low)   수식값이  1에 가장 가까운 팀부터 3점, 2점, 1점
 *   스윙(Swing) 가진 카드로 2개의 수식을 만들어 하이와 로우 모두를 충족하면 10점,
 *               나머지 팀은 순서대로 2점, 1점
 *
 * ⚠️ 「하이와 로우 모두를 충족」이 무엇인지 원본이 수치로 못박지 않았다.
 *    여기서는 **스윙을 선언한 팀끼리만 겨루어**, 두 수식이 각각 20과 1에서 떨어진
 *    거리의 합이 가장 작은 팀에게 10점, 그다음 2점, 1점을 준다.
 *    수업에서 다르게 운영하신다면 진행자 화면에서 수동으로 가감하시면 된다.
 */

export const TARGET_HIGH = 20;
export const TARGET_LOW = 1;

/** 순위별 기본 점수 */
const RANK_POINTS = [3, 2, 1];
const SWING_POINTS = [10, 2, 1];

/**
 * 목표값에서 떨어진 거리로 순위를 매기고 점수를 준다.
 * 거리가 같으면 공동 순위이고, 그 수만큼 다음 순위가 사라진다(피스 배분과 같은 방식).
 * 공동 순위는 해당 구간 점수를 **모아서 균등 분배하고 나머지는 버린다.**
 */
function rankByDistance(entries, points) {
  const sorted = [...entries].sort((a, b) => a.distance - b.distance);
  const out = new Map();
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && sorted[j].distance === sorted[i].distance) j++;
    const k = j - i;
    let pool = 0;
    for (let r = i; r < i + k; r++) pool += points[r] ?? 0;
    const each = Math.floor(pool / k);
    for (let r = i; r < j; r++) out.set(sorted[r].id, { points: each, rank: i + 1 });
    i = j;
  }
  return out;
}

/**
 * 한 라운드를 판정한다.
 *
 * @param {Array} submissions 팀별 제출물
 *   { id, declaration: 'high'|'low'|'swing'|null,
 *     highValue: number|null,   // 하이/스윙의 첫 수식 값 (계산 오류·미제출이면 null)
 *     lowValue: number|null }   // 로우/스윙의 (두 번째) 수식 값
 * @param {object} [opt]
 * @param {number} [opt.targetHigh=20] @param {number} [opt.targetLow=1]
 * @returns {Array<{id:*, declaration:string|null, points:number, rank:number|null,
 *                  distance:number|null, note:string}>}
 */
export function judgeRound(submissions, opt = {}) {
  const { targetHigh = TARGET_HIGH, targetLow = TARGET_LOW } = opt;

  const highs = [], lows = [], swings = [];
  const result = new Map();

  for (const s of submissions) {
    result.set(s.id, { id: s.id, declaration: s.declaration ?? null, points: 0, rank: null, distance: null, note: '' });

    if (s.declaration === 'high') {
      if (s.highValue === null || s.highValue === undefined) { result.get(s.id).note = '수식 없음 / 계산 오류'; continue; }
      highs.push({ id: s.id, distance: Math.abs(s.highValue - targetHigh) });
    } else if (s.declaration === 'low') {
      if (s.lowValue === null || s.lowValue === undefined) { result.get(s.id).note = '수식 없음 / 계산 오류'; continue; }
      lows.push({ id: s.id, distance: Math.abs(s.lowValue - targetLow) });
    } else if (s.declaration === 'swing') {
      if (s.highValue === null || s.highValue === undefined || s.lowValue === null || s.lowValue === undefined) {
        result.get(s.id).note = '스윙은 수식 두 개가 모두 있어야 합니다';
        continue;
      }
      swings.push({
        id: s.id,
        distance: Math.abs(s.highValue - targetHigh) + Math.abs(s.lowValue - targetLow),
      });
    } else {
      result.get(s.id).note = '미제출';
    }
  }

  for (const [group, points, tag] of [[highs, RANK_POINTS, '하이'], [lows, RANK_POINTS, '로우'], [swings, SWING_POINTS, '스윙']]) {
    const ranked = rankByDistance(group, points);
    for (const e of group) {
      const r = ranked.get(e.id);
      const row = result.get(e.id);
      row.points = r.points;
      row.rank = r.rank;
      row.distance = e.distance;
      row.note = `${tag} ${r.rank}위`;
    }
  }

  return submissions.map((s) => result.get(s.id));
}

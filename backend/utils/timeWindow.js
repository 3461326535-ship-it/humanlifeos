// time_entries 段落的时间轴合并。
// 同时给多个任务计时时，重叠的时间段在「今天投入了多久」这个口径上只能算一次，
// 否则会把 10:00-10:30 的两个任务算成 1 小时，属于虚假繁荣。
//
// DB 里的 started_at / ended_at 是 UTC 的 'YYYY-MM-DD HH:MM:SS'。

function toEpoch(sqliteTs) {
  if (!sqliteTs) return NaN;
  return Math.floor(new Date(String(sqliteTs).replace(' ', 'T') + 'Z').getTime() / 1000);
}

/**
 * 合并一组 [start, end] 区间（epoch 秒），重叠或首尾相接只算一次。
 * @param {Array<[number, number]>} intervals
 */
function unionOfIntervals(intervals) {
  const segs = (intervals || [])
    .filter((p) => Array.isArray(p) && p.length === 2 && p[0] != null && p[1] != null)
    .map(([s, e]) => [s, Math.max(s, e)])
    .sort((a, b) => a[0] - b[0]);

  let sumSeconds = 0;
  let merged = 0;
  let curS = null;
  let curE = null;

  for (const [s, e] of segs) {
    sumSeconds += e - s;
    if (curS === null) {
      curS = s;
      curE = e;
    } else if (s <= curE) {
      if (e > curE) curE = e;
    } else {
      merged += curE - curS;
      curS = s;
      curE = e;
    }
  }
  if (curS !== null) merged += curE - curS;

  return {
    seconds: merged,
    minutes: Math.round((merged / 60) * 10) / 10,
    sumSeconds,
    overlapSeconds: Math.max(0, sumSeconds - merged),
  };
}

/**
 * @param {Array<{started_at: string, ended_at: string|null}>} rows
 * @param {number} nowSec 进行中的段按此时刻截断
 * @returns {{ seconds:number, minutes:number, sumSeconds:number, overlapSeconds:number }}
 *   seconds      = 去重后的总秒数（时间轴长度）
 *   sumSeconds   = 各段简单相加（未去重，可用于展示「重叠了多少」）
 *   overlapSeconds = 两者之差
 */
function unionSeconds(rows, nowSec = Math.floor(Date.now() / 1000)) {
  const intervals = (rows || []).map((r) => {
    const s = toEpoch(r.started_at);
    const rawEnd = r.ended_at ? toEpoch(r.ended_at) : nowSec;
    return [s, Number.isFinite(rawEnd) ? Math.max(s, rawEnd) : s];
  });
  return unionOfIntervals(intervals.filter(([s]) => Number.isFinite(s)));
}

module.exports = { toEpoch, unionSeconds, unionOfIntervals };

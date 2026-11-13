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
 * @param {Array<{started_at: string, ended_at: string|null}>} rows
 * @param {number} nowSec 进行中的段按此时刻截断
 * @returns {{ seconds:number, minutes:number, sumSeconds:number, overlapSeconds:number }}
 *   seconds      = 去重后的总秒数（时间轴长度）
 *   sumSeconds   = 各段简单相加（未去重，可用于展示「重叠了多少」）
 *   overlapSeconds = 两者之差
 */
function unionSeconds(rows, nowSec = Math.floor(Date.now() / 1000)) {
  const segs = [];
  let sumSeconds = 0;

  (rows || []).forEach((r) => {
    const s = toEpoch(r.started_at);
    if (!Number.isFinite(s)) return;
    const rawEnd = r.ended_at ? toEpoch(r.ended_at) : nowSec;
    const e = Number.isFinite(rawEnd) ? Math.max(s, rawEnd) : s;
    segs.push([s, e]);
    sumSeconds += e - s;
  });

  segs.sort((a, b) => a[0] - b[0]);

  let merged = 0;
  let curS = null;
  let curE = null;
  for (const [s, e] of segs) {
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

module.exports = { toEpoch, unionSeconds };

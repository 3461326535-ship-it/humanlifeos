import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { TaskStatus } from '../lib/types';
import { STATUS_LABELS } from '../lib/types';
import { tzOffsetMin } from '../lib/actual';

const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: 'bg-ink-soft',
  in_progress: 'bg-clay',
  review: 'bg-lagoon',
  done: 'bg-moss',
};
const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'review', 'done'];
const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function weekdayCN(day: string) {
  return WEEK_CN[new Date(day + 'T00:00:00').getDay()];
}
function fmtDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h${m}m` : `${m}m`;
}
function md(day: string) {
  const p = day.split('-');
  return `${Number(p[1])}/${Number(p[2])}`;
}

/**
 * 本地时区的「近 N 天」窗口。
 * fromDay/toDay 用于和 events.date（本地日期串）比较；
 * fromTs/toTs 是同一窗口的 UTC 时间串，用于 completed_at / created_at / started_at 比较。
 * 窗口在前端算，避免服务器时区与用户不一致导致「今天」错位。
 */
function rangeWindow(days: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  const lastDay = new Date(end.getTime() - 86400000);
  const toSql = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');
  return { fromDay: fmt(start), toDay: fmt(lastDay), fromTs: toSql(start), toTs: toSql(end) };
}

export default function StatsPage() {
  const [range, setRange] = useState(7);
  const [reportDate, setReportDate] = useState(fmt(new Date()));

  const win = useMemo(() => rangeWindow(range), [range]);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats', range, win.fromDay],
    queryFn: () => api.statsOverview(range, win, tzOffsetMin()),
  });
  const { data: report } = useQuery({
    queryKey: ['report', reportDate],
    queryFn: () => api.dailyReport(reportDate, tzOffsetMin()),
  });
  const { data: allEvents } = useQuery({ queryKey: ['events'], queryFn: api.getEvents });

  // 补齐 N 天（后端只返回有完成记录的天，缺的天补 0，柱子才等宽）
  const trendDays = useMemo(() => {
    const map = new Map((stats?.trend ?? []).map((t) => [t.day, t.n]));
    const out: { day: string; n: number }[] = [];
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (range - 1));
    for (let i = 0; i < range; i += 1) {
      const key = fmt(d);
      out.push({ day: key, n: map.get(key) ?? 0 });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [stats, range]);

  const maxTrend = Math.max(1, ...trendDays.map((t) => t.n));
  const maxProj = stats ? Math.max(1, ...stats.projectHours.map((p) => p.minutes)) : 1;

  const weekDone = useMemo(() => (stats ? stats.trend.reduce((s, t) => s + t.n, 0) : 0), [stats]);
  const totalMinutes = useMemo(
    () => (stats ? stats.projectHours.reduce((s, p) => s + p.minutes, 0) : 0),
    [stats]
  );
  // 平均专注用「按时间轴去重」的时长（同时开多个计时不叠加），没有新字段时回落到项目工时之和
  const focusMinutes = stats?.focusMinutes ?? totalMinutes;
  const avgFocus = range > 0 ? Math.round(focusMinutes / range) : 0;

  // 连续完成天数：从今天（或昨天）往前数，每天至少完成过一条
  const streak = useMemo(() => {
    const days = new Set(
      (allEvents || []).filter((e) => e.completed_at).map((e) => e.completed_at!.slice(0, 10))
    );
    const cursor = new Date();
    if (!days.has(fmt(cursor))) cursor.setDate(cursor.getDate() - 1);
    let n = 0;
    while (days.has(fmt(cursor))) {
      n += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return n;
  }, [allEvents]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <div className="seg">
          {[7, 30, 90].map((r) => (
            <button key={r} onClick={() => setRange(r)} className={`seg-item ${range === r ? 'seg-item-on' : ''}`}>
              {r} 天
            </button>
          ))}
        </div>
      </div>

      {isLoading || !stats ? (
        <p className="py-24 text-center text-[13px] text-ink-soft">加载中…</p>
      ) : (
        <>
          {/* ── 四张指标卡 ── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="本周期完成" value={weekDone} sub={`${range} 天内`} />
            <MetricCard
              label="完成率"
              value={`${stats.totals.completionRate}%`}
              sub={`本周期 ${stats.totals.all} 项任务`}
              accent
            />
            <MetricCard
              label="平均专注"
              value={focusMinutes > 0 ? fmtDuration(avgFocus) : '—'}
              sub={focusMinutes > 0 ? '每天 · 含习惯，已去重' : '暂无计时'}
            />
            <MetricCard label="连续完成" value={`${streak} 天`} sub="含今天" />
          </div>

          <p className="-mt-1 text-[11px] leading-5 text-ink-faint">
            时长口径：实际投入 ＝ 任务计时 ∪ 已打卡习惯时段，按时间轴去重 ——
            并行（如渲染＋写周报）与习惯重叠的时间只算一次。
          </p>

          {/* ── 近 N 天完成数：细柱 ── */}
          <section className="card px-5 pb-4 pt-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-ink">近 {range} 天完成数</h2>
              <span className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
                <span className="h-1 w-4 rounded-full bg-moss" />
                完成
              </span>
            </div>
            <div className="flex h-[168px] items-end gap-1">
              {trendDays.every((t) => t.n === 0) ? (
                <div className="flex h-full w-full items-center justify-center text-[12px] text-ink-soft">
                  近 {range} 天还没有完成记录
                </div>
              ) : (
                trendDays.map((t) => {
                  const isToday = t.day === fmt(new Date());
                  const h = t.n === 0 ? 0 : Math.max(4, Math.round((t.n / maxTrend) * 132));
                  return (
                    <div key={t.day} className="group/bar flex flex-1 flex-col items-center justify-end gap-2" title={`${t.day}：${t.n} 项`}>
                      <span className="text-[10px] tabular-nums text-ink-soft opacity-0 transition-opacity group-hover/bar:opacity-100">
                        {t.n}
                      </span>
                      <div
                        className={`w-[6px] rounded-full transition-colors ${t.n === 0 ? 'bg-line-soft' : isToday ? 'bg-moss-deep' : 'bg-moss/60 group-hover/bar:bg-moss'}`}
                        style={{ height: Math.max(2, h) }}
                      />
                      <span className={`text-[10.5px] ${isToday ? 'font-medium text-ink' : 'text-ink-soft'}`}>
                        {range <= 7 ? weekdayCN(t.day) : md(t.day)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* ── 项目分布 ── */}
            <section className="card p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="text-[14px] font-semibold text-ink">本周期项目工时</h2>
                <div className="ml-auto flex flex-wrap items-center gap-2.5">
                  {stats.projectHours.slice(0, 3).map((p, i) => (
                    <span key={p.id} className="flex items-center gap-1 text-[11px] text-ink-soft">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color || PROJECT_COLORS[i] }} />
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
              {stats.projectHours.length === 0 ? (
                <p className="py-6 text-[12px] text-ink-soft">本周期还没有计时记录</p>
              ) : (
                <ul className="space-y-3">
                  {stats.projectHours.map((p, i) => (
                    <li key={p.id} className="flex items-center gap-3">
                      <span className="w-[64px] flex-none truncate text-[12px] text-ink-mid">{p.name}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-soft">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(4, (p.minutes / maxProj) * 100)}%`,
                            backgroundColor: p.color || PROJECT_COLORS[i % PROJECT_COLORS.length],
                          }}
                        />
                      </div>
                      <span className="w-[46px] flex-none text-right text-[11.5px] tabular-nums text-ink-soft">
                        {fmtDuration(p.minutes)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ── 状态分布（热力图需要后端按小时聚合，先用状态分布占位）── */}
            <section className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[14px] font-semibold text-ink">状态分布</h2>
                <span className="text-[11px] text-ink-soft">本周期 {stats.totals.all} 项 · 不含习惯</span>
              </div>
              <ul className="space-y-3">
                {STATUS_ORDER.map((s) => {
                  const n = stats.statusDistribution[s];
                  const pct = stats.totals.all > 0 ? Math.round((n / stats.totals.all) * 100) : 0;
                  return (
                    <li key={s} className="flex items-center gap-3">
                      <span className="flex w-[56px] flex-none items-center gap-1.5 text-[12px] text-ink-mid">
                        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_COLOR[s]}`} />
                        {STATUS_LABELS[s]}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-soft">
                        <div className={`h-full rounded-full ${STATUS_COLOR[s]}`} style={{ width: `${Math.max(n > 0 ? 3 : 0, pct)}%` }} />
                      </div>
                      <span className="w-[42px] flex-none text-right text-[11.5px] tabular-nums text-ink-soft">{n}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-4 text-[11px] leading-5 text-ink-faint">
                口径：只统计任务本身（计划日期落在本周期内，或在本周期完成的），已归档的重复实例不计。
                习惯打卡在「习惯」里单独计算，不进入这里的完成率与状态分布。
              </p>
            </section>
          </div>

          {/* ── 每日战报 ── */}
          <section className="card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[14px] font-semibold text-ink">每日战报</h2>
              <input
                type="date"
                className="input w-[150px] text-xs"
                value={reportDate}
                onChange={(e) => e.target.value && setReportDate(e.target.value)}
              />
            </div>
            {!report ? (
              <p className="py-8 text-center text-[13px] text-ink-soft">加载中…</p>
            ) : (
              <>
                <p className="mb-3 rounded-lg bg-moss-soft px-3 py-2 text-[13px] font-medium text-moss-deep">{report.summary}</p>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <MiniStat label="完成" value={report.completedCount} />
                  <MiniStat label="新建" value={report.createdCount} />
                  <MiniStat label="实际投入" value={`${report.time.hours} 时`} />
                </div>
                <p className="mt-2 text-[11px] leading-5 text-ink-faint">
                  已按时间轴去重并行与习惯重叠时间
                  {report.time.taskMinutes != null && report.time.habitMinutes != null && (
                    <>
                      {' '}· 任务 {report.time.taskMinutes}m / 习惯 {report.time.habitMinutes}m
                    </>
                  )}
                  {report.time.overlapMinutes ? ` · 合并重叠 ${report.time.overlapMinutes}m` : ''}
                </p>
                {report.completed.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-1.5 text-[12px] font-medium text-ink-mid">当日完成</p>
                    <ul className="space-y-1">
                      {report.completed.map((e) => (
                        <li key={e.id} className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-[13px]">
                          <span className="h-1.5 w-1.5 flex-none rounded-full bg-moss" />
                          <span className="flex-1 truncate text-ink-mid">{e.title}</span>
                          <span className="text-[11px] tabular-nums text-ink-faint">{e.completed_at?.slice(11, 16)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {report.notes.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-1.5 text-[12px] font-medium text-ink-mid">随手记</p>
                    <ul className="space-y-1">
                      {report.notes.map((n) => (
                        <li key={n.id} className="rounded-lg bg-paper-deep px-2.5 py-1.5 text-[13px] text-ink-mid">
                          {n.content}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

const PROJECT_COLORS = ['#2F6B4F', '#4A7CB8', '#C98B2E', '#C9503A'];

function MetricCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-[12px] text-ink-soft">{label}</p>
      <p className={`mt-1.5 text-[26px] font-semibold leading-none tabular-nums ${accent ? 'text-moss' : 'text-ink'}`}>
        {value}
      </p>
      {sub && <p className="mt-2 text-[11px] text-ink-faint">{sub}</p>}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-paper-deep py-2">
      <p className="text-lg font-semibold tabular-nums text-ink">{value}</p>
      <p className="text-[11px] text-ink-soft">{label}</p>
    </div>
  );
}

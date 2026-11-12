import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { TaskStatus } from '../lib/types';
import { STATUS_LABELS } from '../lib/types';

const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: 'bg-ink-soft',
  in_progress: 'bg-lagoon',
  review: 'bg-clay',
  done: 'bg-moss',
};
const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'review', 'done'];

function md(day: string) {
  const p = day.split('-');
  return `${Number(p[1])}/${Number(p[2])}`;
}

export default function StatsPage() {
  const [range, setRange] = useState(7);
  const [reportDate, setReportDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats', range],
    queryFn: () => api.statsOverview(range),
  });
  const { data: report } = useQuery({
    queryKey: ['report', reportDate],
    queryFn: () => api.dailyReport(reportDate),
  });

  const maxTrend = stats ? Math.max(1, ...stats.trend.map((t) => t.n)) : 1;
  const maxProj = stats ? Math.max(1, ...stats.projectHours.map((p) => p.minutes)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <div className="seg">
          {[7, 30, 90].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`seg-item ${range === r ? 'seg-item-on' : ''}`}
            >
              {r} 天
            </button>
          ))}
        </div>
      </div>

      {isLoading || !stats ? (
        <p className="py-24 text-center text-sm text-ink-soft">加载中…</p>
      ) : (
        <>
          {/* 概览卡 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="总任务" value={stats.totals.all} />
            <StatCard label="完成率" value={`${stats.totals.completionRate}%`} accent="text-moss" />
            <StatCard label={`${range} 天新建`} value={stats.totals.createdInRange} />
            <StatCard label="已完成" value={stats.totals.done} accent="text-moss" />
          </div>

          {/* 状态分布 */}
          <section className="card p-4">
            <h2 className="mb-3 text-[13px] font-semibold text-ink-mid">状态分布</h2>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-line-soft">
              {STATUS_ORDER.map((s) =>
                stats.statusDistribution[s] > 0 ? (
                  <div
                    key={s}
                    className={STATUS_COLOR[s]}
                    style={{ width: `${(stats.statusDistribution[s] / stats.totals.all) * 100}%` }}
                  />
                ) : null
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STATUS_ORDER.map((s) => (
                <div key={s} className="flex items-center gap-2 text-[12px]">
                  <span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLOR[s]}`} />
                  <span className="text-ink-soft">{STATUS_LABELS[s]}</span>
                  <span className="ml-auto font-medium text-ink-mid">{stats.statusDistribution[s]}</span>
                </div>
              ))}
            </div>
          </section>

          {/* 完成趋势 */}
          <section className="card p-4">
            <h2 className="mb-1 text-[13px] font-semibold text-ink-mid">完成趋势</h2>
            <p className="mb-3 text-[11px] text-ink-soft">近 {range} 天每日完成数</p>
            <div className="flex h-32 items-end gap-[2px]">
              {stats.trend.length === 0 && (
                <p className="self-center text-[12px] text-ink-soft">这段时间还没有完成的任务</p>
              )}
              {stats.trend.map((t) => (
                <div key={t.day} className="group/bar flex flex-1 flex-col items-center justify-end" title={`${t.day}：${t.n} 项`}>
                  <span className="text-[9px] text-ink-soft opacity-0 group-hover/bar:opacity-100">{t.n}</span>
                  <div
                    className="w-full rounded-t bg-moss group-hover/bar:bg-moss"
                    style={{ height: `${Math.max(4, (t.n / maxTrend) * 100)}%` }}
                  />
                  <span className="mt-1 text-[8px] text-ink-soft">{md(t.day)}</span>
                </div>
              ))}
            </div>
          </section>

          {/* 项目工时 */}
          <section className="card p-4">
            <h2 className="mb-3 text-[13px] font-semibold text-ink-mid">项目工时</h2>
            {stats.projectHours.length === 0 ? (
              <p className="text-[12px] text-ink-soft">还没有项目或计时记录</p>
            ) : (
              <ul className="space-y-2.5">
                {stats.projectHours.map((p) => (
                  <li key={p.id}>
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="flex items-center gap-2 font-medium text-ink-mid">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: p.color || '#6366f1' }}
                        />
                        {p.name}
                      </span>
                      <span className="text-ink-soft">
                        {(p.minutes / 60).toFixed(1)} 小时 · {p.entries} 次
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-line-soft">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(p.minutes / maxProj) * 100}%`,
                          backgroundColor: p.color || '#6366f1',
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* 每日战报 */}
      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-ink-mid">每日战报</h2>
          <input
            type="date"
            className="input w-[150px] text-xs"
            value={reportDate}
            onChange={(e) => e.target.value && setReportDate(e.target.value)}
          />
        </div>
        {!report ? (
          <p className="py-8 text-center text-sm text-ink-soft">加载中…</p>
        ) : (
          <>
            <p className="mb-3 rounded-lg bg-moss-soft px-3 py-2 text-[13px] font-medium text-moss-deep">
              {report.summary}
            </p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <MiniStat label="完成" value={report.completedCount} />
              <MiniStat label="新建" value={report.createdCount} />
              <MiniStat label="计时" value={`${report.time.hours} 时`} />
            </div>
            {report.completed.length > 0 && (
              <div className="mt-4">
                <p className="mb-1.5 text-[12px] font-medium text-ink-soft">当日完成</p>
                <ul className="space-y-1">
                  {report.completed.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-paper-deep">
                      <span className="h-2 w-2 flex-none rounded-full bg-moss" />
                      <span className="flex-1 truncate text-ink-mid">{e.title}</span>
                      <span className="font-mono text-[11px] text-ink-soft">{e.completed_at?.slice(11, 16)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.notes.length > 0 && (
              <div className="mt-4">
                <p className="mb-1.5 text-[12px] font-medium text-ink-soft">随手记</p>
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
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="card p-3">
      <p className="text-[12px] text-ink-soft">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${accent || 'text-ink'}`}>{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-paper-deep py-2">
      <p className="text-lg font-bold tabular-nums text-ink">{value}</p>
      <p className="text-[11px] text-ink-soft">{label}</p>
    </div>
  );
}

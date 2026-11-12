import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { HabitStatus } from '../lib/types';

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 本周（周一起） */
function thisWeek() {
  const now = new Date();
  const monday = new Date(now);
  const day = now.getDay();
  monday.setDate(now.getDate() + (day === 0 ? -6 : 1 - day));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  return { days, from: fmt(days[0]), to: fmt(days[6]) };
}

const CELL: Record<HabitStatus, string> = {
  done: 'bg-moss-deep',
  skipped: 'bg-line',
  excused: 'bg-clay-soft',
  pending: 'border border-line bg-transparent',
};

const STATUS_CN: Record<HabitStatus, string> = {
  done: '已打卡',
  skipped: '断签',
  excused: '请假',
  pending: '待打卡',
};

/**
 * 今日习惯卡：一周 7 格 × 每条习惯。
 * 数据走 /api/habits/occurrences（后端零物化，不会往 events 写行）。
 */
export default function HabitCard() {
  const { days, from, to } = useMemo(thisWeek, []);
  const today = fmt(new Date());

  const { data, isLoading } = useQuery({
    queryKey: ['habitOccurrences', from],
    queryFn: () => api.getHabitOccurrences(from, to),
  });

  const rows = useMemo(() => {
    const map = new Map<number, { title: string; byDate: Record<string, HabitStatus> }>();
    (data?.items || []).forEach((it) => {
      if (!map.has(it.habit_id)) map.set(it.habit_id, { title: it.title, byDate: {} });
      map.get(it.habit_id)!.byDate[it.date] = it.status;
    });
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v }));
  }, [data]);

  const doneToday = rows.filter((r) => r.byDate[today] === 'done').length;

  return (
    <div className="card p-4">
      <div className="s-head">
        <span className="s-title">习惯打卡</span>
        <span className="s-link">
          {rows.length > 0 ? `今天 ${doneToday}/${rows.length}` : ''}
        </span>
      </div>

      {isLoading ? (
        <p className="py-2 text-[12px] text-ink-soft">加载中…</p>
      ) : rows.length === 0 ? (
        <p className="text-[12px] leading-6 text-ink-soft">还没有习惯规则，先到「实验排期 · 习惯」里建一条。</p>
      ) : (
        <>
          {/* 星期表头 */}
          <div className="mb-1 flex items-center gap-2">
            <span className="w-[70px] flex-none" />
            <div className="flex flex-1 justify-between">
              {days.map((d, i) => (
                <span
                  key={i}
                  className={`w-3.5 text-center text-[10px] ${
                    fmt(d) === today ? 'font-semibold text-moss' : 'text-ink-faint'
                  }`}
                >
                  {WEEK_LABELS[i]}
                </span>
              ))}
            </div>
          </div>

          <ul className="space-y-1.5">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <span className="w-[70px] flex-none truncate text-[12px] text-ink-mid" title={r.title}>
                  {r.title}
                </span>
                <div className="flex flex-1 justify-between">
                  {days.map((d, i) => {
                    const ds = fmt(d);
                    const st = r.byDate[ds];
                    return (
                      <span
                        key={i}
                        title={`${ds} ${st ? STATUS_CN[st] : '无安排'}`}
                        className={`h-3.5 w-3.5 rounded-[3px] ${st ? CELL[st] : 'border border-line-soft bg-transparent'} ${
                          ds === today ? 'ring-1 ring-ink-faint/30 ring-offset-1 ring-offset-white' : ''
                        }`}
                      />
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-center gap-3 text-[10.5px] text-ink-faint">
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[2px] bg-moss-deep" />已打卡</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[2px] bg-line" />断签</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[2px] bg-clay-soft" />请假</span>
          </div>
        </>
      )}
    </div>
  );
}

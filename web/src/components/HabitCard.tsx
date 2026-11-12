import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Habit, HabitOccurrence, HabitStatus } from '../lib/types';

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
 * 规则来自 /api/habits，格子状态来自 /api/habits/occurrences（后端零物化，不写 events）。
 * 点格子 = 打卡 / 再点一次撤销；点习惯名 = 编辑规则；右上 ＋ = 新建。
 */
export default function HabitCard({
  onNew,
  onEdit,
}: {
  onNew?: () => void;
  onEdit?: (habit: Habit) => void;
}) {
  const { days, from, to } = useMemo(thisWeek, []);
  const today = fmt(new Date());
  const queryClient = useQueryClient();

  const { data: habits, isLoading: loadingHabits } = useQuery({
    queryKey: ['habits', from],
    queryFn: () => api.getHabits(from, to),
  });

  const { data: occ } = useQuery({
    queryKey: ['habitOccurrences', from],
    queryFn: () => api.getHabitOccurrences(from, to),
  });

  const rows = useMemo(() => {
    const statusMap = new Map<string, HabitStatus>();
    (occ?.items || []).forEach((it) => statusMap.set(`${it.habit_id}|${it.date}`, it.status));
    return (habits || []).map((h) => ({
      habit: h,
      statusOf: (date: string) => statusMap.get(`${h.id}|${date}`),
    }));
  }, [habits, occ]);

  const doneToday = rows.filter((r) => r.statusOf(today) === 'done').length;

  const toggleMutation = useMutation({
    mutationFn: ({ habitId, date, clear }: { habitId: number; date: string; clear: boolean }) =>
      clear ? api.clearHabitOverride(habitId, date) : api.setHabitOverride(habitId, date, 'done'),
    onMutate: async ({ habitId, date, clear }) => {
      await queryClient.cancelQueries({ queryKey: ['habitOccurrences', from] });
      const prev = queryClient.getQueryData<{ items: HabitOccurrence[] }>(['habitOccurrences', from]);
      if (prev) {
        const fallback: HabitStatus = date < today ? 'skipped' : 'pending';
        const items = prev.items.map((it) =>
          it.habit_id === habitId && it.date === date
            ? { ...it, status: clear ? fallback : ('done' as HabitStatus) }
            : it
        );
        queryClient.setQueryData(['habitOccurrences', from], { ...prev, items });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['habitOccurrences', from], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['habitOccurrences'] });
      queryClient.invalidateQueries({ queryKey: ['habits'] });
    },
  });

  const handleCell = (habit: Habit, date: string, status?: HabitStatus) => {
    if (date > today) return; // 未来日期先不打卡
    toggleMutation.mutate({ habitId: habit.id, date, clear: status === 'done' });
  };

  return (
    <div className="card p-4">
      <div className="s-head">
        <span className="s-title">习惯打卡</span>
        <span className="flex items-center gap-2">
          {rows.length > 0 && (
            <span className="s-link">
              今天 {doneToday}/{rows.length}
            </span>
          )}
          {onNew && (
            <button
              className="flex h-5 w-5 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-line/60 hover:text-ink-mid"
              onClick={onNew}
              title="新建习惯"
              aria-label="新建习惯"
            >
              ＋
            </button>
          )}
        </span>
      </div>

      {loadingHabits ? (
        <p className="py-2 text-[12px] text-ink-soft">加载中…</p>
      ) : rows.length === 0 ? (
        <div className="py-3 text-center">
          <p className="text-[12px] leading-6 text-ink-soft">还没有习惯</p>
          {onNew && (
            <button className="btn-ghost mt-0.5 text-[12px]" onClick={onNew}>
              ＋ 建一条（比如每天读书）
            </button>
          )}
        </div>
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
              <li key={r.habit.id} className="flex items-center gap-2">
                <button
                  className="w-[70px] flex-none truncate text-left text-[12px] text-ink-mid transition-colors hover:text-ink hover:underline hover:underline-offset-2"
                  title={`${r.habit.title} · 点击编辑规则`}
                  onClick={() => onEdit?.(r.habit)}
                >
                  {r.habit.title}
                </button>
                <div className="flex flex-1 justify-between">
                  {days.map((d, i) => {
                    const ds = fmt(d);
                    const st = r.statusOf(ds);
                    const future = ds > today;
                    return (
                      <button
                        key={i}
                        disabled={future}
                        onClick={() => handleCell(r.habit, ds, st)}
                        title={`${ds} ${st ? STATUS_CN[st] : '无安排'}${future ? '' : ' · 点一下打卡，再点撤销'}`}
                        aria-label={`${r.habit.title} ${ds} ${st ? STATUS_CN[st] : '无安排'}`}
                        className={`h-3.5 w-3.5 rounded-[3px] transition-transform ${st ? CELL[st] : 'border border-line-soft bg-transparent'} ${
                          ds === today ? 'ring-1 ring-ink-faint/30 ring-offset-1 ring-offset-white' : ''
                        } ${future ? 'cursor-default opacity-60' : 'hover:scale-110'}`}
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

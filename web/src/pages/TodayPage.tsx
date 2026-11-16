import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { TodoEvent, Recurrence } from '../lib/types';
import { doneDate, doneStamp, endOf } from '../lib/spans';
import EventDialog from '../components/EventDialog';
import EventRow from '../components/EventRow';
import ActiveTimer from '../components/ActiveTimer';
import HabitCard from '../components/HabitCard';
import HabitDialog from '../components/HabitDialog';
import type { Habit } from '../lib/types';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function dateParts(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((d.getTime() - new Date(todayStr() + 'T00:00:00').getTime()) / 86400000);
  return {
    md: `${d.getMonth() + 1}月${d.getDate()}日`,
    weekday: WEEKDAYS[d.getDay()],
    relative: diff === 0 ? '今天' : diff === 1 ? '明天' : diff === -1 ? '昨天' : diff > 0 ? `${diff} 天后` : `${-diff} 天前`,
  };
}

const SLOTS = [
  { key: 'morning', label: '上午' },
  { key: 'afternoon', label: '下午' },
  { key: 'evening', label: '晚上' },
  { key: 'none', label: '未排时间' },
] as const;

function slotOf(time: string): (typeof SLOTS)[number]['key'] {
  if (!time) return 'none';
  if (time < '12:00') return 'morning';
  if (time < '18:00') return 'afternoon';
  return 'evening';
}

export default function TodayPage() {
  const [date, setDate] = useState(todayStr());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TodoEvent | null>(null);
  // 习惯弹窗：null = 关闭；{ habit: null } = 新建；{ habit } = 编辑
  const [habitDialog, setHabitDialog] = useState<{ habit: Habit | null } | null>(null);
  const [doneOpen, setDoneOpen] = useState(true);
  // 逾期清单默认收起：它是一直欠着的账，不该天天铺满屏幕
  const [overdueOpen, setOverdueOpen] = useState(false);
  const overdueRef = useRef<HTMLElement | null>(null);
  const queryClient = useQueryClient();

  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const focus = params.get('focus') === '1';
  const newFlag = params.get('new');
  const repeatFlag = params.get('repeat');
  const habitFlag = params.get('habit');
  const dateFlag = params.get('date');
  // 「新建 → 周期任务」带过来的默认重复
  const [newRecurrence, setNewRecurrence] = useState<Recurrence | ''>('');

  // 顶部「新建」传 ?new=1 过来（?repeat=daily|weekly|... 表示周期任务）
  useEffect(() => {
    if (!newFlag) return;
    setEditing(null);
    setNewRecurrence((repeatFlag as Recurrence) || '');
    setDialogOpen(true);
    const next = new URLSearchParams(params);
    next.delete('new');
    next.delete('repeat');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newFlag, repeatFlag]);

  // 顶部「新建 → 习惯」传 ?habit=new 过来
  useEffect(() => {
    if (habitFlag !== 'new') return;
    setHabitDialog({ habit: null });
    const next = new URLSearchParams(params);
    next.delete('habit');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habitFlag]);

  // AI 执行完写操作后跳到任务所在日期（旧版也是「自动跳到那一天」），用完即清
  useEffect(() => {
    if (!dateFlag || !/^\d{4}-\d{2}-\d{2}$/.test(dateFlag)) return;
    setDate(dateFlag);
    const next = new URLSearchParams(params);
    next.delete('date');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFlag]);

  const { data: allEvents, isLoading, error } = useQuery({
    queryKey: ['events'],
    queryFn: api.getEvents,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['events'] });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => api.toggleEvent(id),
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: ['events'] });
      const prev = queryClient.getQueryData<TodoEvent[]>(['events']);
      if (prev) {
        queryClient.setQueryData<TodoEvent[]>(
          ['events'],
          prev.map((e) => (e.id === id ? { ...e, completed: !e.completed } : e))
        );
      }
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['events'], ctx.prev);
    },
    onSettled: invalidate,
  });

  /**
   * 补记完成日期。勾选圈单击 = 现在完成（走 toggleMutation，零摩擦）；
   * 长按 / 右键 / 点「完成于 …」= 明确指定哪天做完的，走这里。
   * 补记到过去某天时，完成数要落在那天 —— 否则「131 天前的事今天补勾」会把今天的
   * 完成统计撑得虚高，回头查也看不出来。
   */
  const completeOn = (id: number, date: string) => {
    queryClient.setQueryData<TodoEvent[]>(['events'], (prev) =>
      prev?.map((e) => (e.id === id ? { ...e, completed: true, status: 'done' as const } : e))
    );
    api.completeOn(id, doneStamp(date)).then(invalidate).catch(invalidate);
  };

  // 行内勾选单条子任务：后端是「整体替换 subtasks」，所以回传全量；先做乐观更新，点下去立刻有反馈
  const toggleSubtask = (event: TodoEvent, subtaskId: number) => {
    const next = (event.subtasks || []).map((s) =>
      s.id === subtaskId ? { ...s, completed: !s.completed } : s
    );
    queryClient.setQueryData<TodoEvent[]>(['events'], (prev) =>
      prev?.map((e) => (e.id === event.id ? { ...e, subtasks: next } : e))
    );
    api
      .updateEvent(event.id, { subtasks: next.map((s) => ({ title: s.title, completed: s.completed })) })
      .then(invalidate)
      .catch(invalidate);
  };

  // 「这一天该出现的任务」
  //   · 单日任务：只有自己那天出现
  //   · 跨天任务：起点那天进当天列表；之后每天进顶部「进行中」直到完成；
  //              完成的那天在「已完成」里再留一条（知道是哪天收的尾）
  const dayEvents = useMemo(() => {
    if (!allEvents) return [];
    return allEvents
      .filter((e) => !e.canceled_at)
      .filter((e) => !q || e.title.includes(q) || (e.category || '').includes(q))
      .filter((e) => {
        const end = endOf(e);
        if (!end) return e.date === date;
        if (e.completed) return e.date === date || doneDate(e) === date;
        return e.date === date;
      })
      .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  }, [allEvents, date, q]);

  // 跨天且还没做完的活：从上手那天起，每天都挂在这里（已超期的排最前）
  const carriedOver = useMemo(() => {
    if (!allEvents) return [];
    return allEvents
      .filter((e) => !e.completed && !e.canceled_at && endOf(e) && e.date < date)
      .filter((e) => !q || e.title.includes(q) || (e.category || '').includes(q))
      .sort((a, b) => {
        const ea = endOf(a);
        const eb = endOf(b);
        const oa = ea < date ? 0 : 1;
        const ob = eb < date ? 0 : 1;
        if (oa !== ob) return oa - ob; // 已超期的先露头
        return ea.localeCompare(eb) || (a.time || '99:99').localeCompare(b.time || '99:99');
      });
  }, [allEvents, date, q]);

  const openEvents = dayEvents.filter((e) => !e.completed);
  const doneEvents = dayEvents.filter((e) => e.completed);
  const shown = focus ? openEvents : dayEvents;
  // 待办 = 今天排的 + 还挂在手上的跨天活
  const todoCount = openEvents.length + carriedOver.length;
  const pct = dayEvents.length > 0 ? Math.round((doneEvents.length / dayEvents.length) * 100) : 0;

  // 逾期 = 「某一天要做的事，那天过了还没做」。
  //   · 单日任务 → 进这里（计划日已过）
  //   · 跨天任务 → **不进这里**，它过了 end_date 仍然留在上面的「进行中」（标红超期），
  //     因为它还是手上正在做的活，塞进收起的面板里等于藏起来
  //   · 周期任务的往日实例 → 不算（下周还会有同一件事，不该攒成债）
  // 这里直接出清单，右栏那个红数字和清单是同一份数据，不会各算各的。
  const overdueAll = useMemo(() => {
    const t = todayStr();
    return (allEvents || [])
      .filter((e) => !e.completed && !e.canceled_at && !e.rule_id && !endOf(e) && e.date < t)
      .sort((a, b) => b.date.localeCompare(a.date) || a.id - b.id); // 最近错过的排前面
  }, [allEvents]);

  const overdueList = useMemo(
    () =>
      q
        ? overdueAll.filter((e) => e.title.includes(q) || (e.category || '').includes(q))
        : overdueAll,
    [overdueAll, q]
  );

  const overdue = overdueAll.length;

  const groups = useMemo(
    () =>
      SLOTS.map((s) => ({
        ...s,
        items: openEvents.filter((e) => slotOf(e.time) === s.key),
      })).filter((g) => g.items.length > 0),
    [openEvents]
  );

  const { md, weekday, relative } = dateParts(date);
  const isToday = date === todayStr();

  const hasAnything =
    shown.length > 0 || doneEvents.length > 0 || carriedOver.length > 0 || overdue > 0;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      {/* ── 主列：任务直接铺在纸面上，不套卡片 ── */}
      <div className="min-w-0">
        {/* 日期条 */}
        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-2 text-[12.5px]">
          <button className="text-ink-soft transition-colors hover:text-ink" onClick={() => setDate(addDays(date, -1))} aria-label="前一天">
            ‹
          </button>
          <span className="font-medium text-ink">
            {md}
            <span className="ml-1.5 font-normal text-ink-soft">{weekday}</span>
          </span>
          <button className="text-ink-soft transition-colors hover:text-ink" onClick={() => setDate(addDays(date, 1))} aria-label="后一天">
            ›
          </button>
          {!isToday && (
            <button className="ml-0.5 text-ink-soft underline-offset-4 hover:text-moss hover:underline" onClick={() => setDate(todayStr())}>
              回到今天（{relative}）
            </button>
          )}
          <input
            type="date"
            className="ml-1 rounded-md border border-line bg-white/70 px-1.5 py-0.5 text-[11.5px] text-ink-mid outline-none focus:border-moss/40"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
          {(q || focus) && (
            <span className="text-[11.5px] text-ink-soft">
              {q && <>搜索「{q}」</>}
              {q && focus && ' · '}
              {focus && <>只看未完成</>}
            </span>
          )}
        </div>

        {isLoading ? (
          <p className="py-20 text-center text-[13px] text-ink-soft">加载中…</p>
        ) : error ? (
          <p className="py-20 text-center text-[13px] text-coral">加载失败：{(error as Error).message}</p>
        ) : !hasAnything ? (
          <div className="mt-4 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line py-16 text-center">
            <span className="text-xl">☀️</span>
            <p className="text-[13px] text-ink-mid">这一天还没有任务</p>
            <p className="text-[12px] text-ink-soft">点右上角「新建」开始安排</p>
          </div>
        ) : (
          <>
            {/* 进行中：跨天的活从上手那天起每天都在这，不用回头翻开始那天 */}
            {carriedOver.length > 0 && (
              <section>
                <div className="flex items-center gap-3 pb-0.5 pt-4">
                  <span className="flex-none text-[12px] text-ink-soft">进行中 {carriedOver.length}</span>
                  <span className="h-px flex-1 bg-line/70" />
                </div>
                <ul>
                  {carriedOver.map((event) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      viewDate={date}
                      onToggle={() => toggleMutation.mutate(event.id)}
                      onEdit={() => {
                        setEditing(event);
                        setDialogOpen(true);
                      }}
                      onToggleSubtask={(sid) => toggleSubtask(event, sid)}
                        onCompleteAt={(d) => completeOn(event.id, d)}
                    />
                  ))}
                </ul>
              </section>
            )}

            {/* 逾期：默认收起，右栏那个红数字就是它的入口 */}
            {overdue > 0 && (
              <section ref={overdueRef}>
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 pb-0.5 pt-4 text-left text-[12px] text-ink-mid transition-colors hover:text-ink"
                  onClick={() => setOverdueOpen((v) => !v)}
                  aria-expanded={overdueOpen}
                >
                  逾期 <span className="tabular-nums text-coral">{overdue}</span>
                  <span className={`text-[9px] transition-transform ${overdueOpen ? 'inline-block -rotate-90' : 'inline-block rotate-90'}`}>›</span>
                  {!overdueOpen && <span className="text-[11px] text-ink-faint">点开处理／改期</span>}
                </button>
                {overdueOpen && (
                  <ul className="border-t border-line/40">
                    {overdueList.map((event) => (
                      <EventRow
                        key={event.id}
                        event={event}
                        viewDate={todayStr()}
                        onToggle={() => toggleMutation.mutate(event.id)}
                        onEdit={() => {
                          setEditing(event);
                          setDialogOpen(true);
                        }}
                        onToggleSubtask={(sid) => toggleSubtask(event, sid)}
                        onCompleteAt={(d) => completeOn(event.id, d)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            )}

            {groups.map((g) => (
              <section key={g.key}>
                <div className="flex items-center gap-3 pb-0.5 pt-4">
                  <span className="flex-none text-[12px] text-ink-soft">{g.label}</span>
                  <span className="h-px flex-1 bg-line/70" />
                </div>
                <ul>
                  {g.items.map((event) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      viewDate={date}
                      onToggle={() => toggleMutation.mutate(event.id)}
                      onEdit={() => {
                        setEditing(event);
                        setDialogOpen(true);
                      }}
                      onToggleSubtask={(sid) => toggleSubtask(event, sid)}
                        onCompleteAt={(d) => completeOn(event.id, d)}
                    />
                  ))}
                </ul>
              </section>
            ))}

            {!focus && doneEvents.length > 0 && (
              <section className="mb-2 mt-1">
                <button
                  className="flex w-full items-center gap-1.5 py-3 text-left text-[12.5px] text-ink-mid transition-colors hover:text-ink"
                  onClick={() => setDoneOpen((v) => !v)}
                >
                  已完成 {doneEvents.length}
                  <span className={`text-[9px] transition-transform ${doneOpen ? 'inline-block -rotate-90' : 'inline-block rotate-90'}`}>›</span>
                </button>
                {doneOpen && (
                  <ul className="border-t border-line/40">
                    {doneEvents.map((event) => (
                      <EventRow
                        key={event.id}
                        event={event}
                        viewDate={date}
                        onToggle={() => toggleMutation.mutate(event.id)}
                        onEdit={() => {
                          setEditing(event);
                          setDialogOpen(true);
                        }}
                        onToggleSubtask={(sid) => toggleSubtask(event, sid)}
                        onCompleteAt={(d) => completeOn(event.id, d)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {/* ── 右栏：三张辅助卡（不是导航）── */}
      <aside className="space-y-4">
        <ActiveTimer />

        {/* 今日概览：2×2 网格 */}
        <div className="card overflow-hidden">
          <div className="s-title px-4 pb-1 pt-3.5">今日概览</div>
          <div className="grid grid-cols-2">
            <div className="border-b border-r border-line-soft px-4 py-3">
              <p className="text-[11.5px] text-ink-soft">待办</p>
              <p className="mt-1 text-[22px] font-semibold leading-none tabular-nums text-ink">{todoCount}</p>
            </div>
            <div className="border-b border-line-soft px-4 py-3">
              <p className="text-[11.5px] text-ink-soft">完成</p>
              <p className="mt-1 text-[22px] font-semibold leading-none tabular-nums text-ink">{doneEvents.length}</p>
            </div>
            <div className="border-r border-line-soft px-4 py-3">
              <p className="text-[11.5px] text-ink-soft">逾期</p>
              {overdue > 0 ? (
                <button
                  type="button"
                  title="查看逾期任务"
                  className={`mt-1 text-[22px] font-semibold leading-none tabular-nums text-coral underline-offset-4 transition-opacity hover:opacity-70`}
                  onClick={() => {
                    setOverdueOpen(true);
                    // 清单在左栏，等它渲染出来再滚过去
                    // 顶部导航是 sticky 的，scrollIntoView 会把标题顶到它背后，
                    // 所以手动留出 88px（导航高度 + 一点呼吸）
                    requestAnimationFrame(() => {
                      const el = overdueRef.current;
                      if (!el) return;
                      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 88, behavior: 'smooth' });
                    });
                  }}
                >
                  {overdue}
                </button>
              ) : (
                <p className="mt-1 text-[22px] font-semibold leading-none tabular-nums text-ink">0</p>
              )}
            </div>
            <div className="px-4 py-3">
              <p className="text-[11.5px] text-ink-soft">完成率</p>
              <p className="mt-1 text-[22px] font-semibold leading-none tabular-nums text-moss">{pct}%</p>
            </div>
          </div>
        </div>

        {/* 习惯打卡：一周 7 格，数据来自 /api/habits/occurrences */}
        <HabitCard
          onNew={() => setHabitDialog({ habit: null })}
          onEdit={(habit) => setHabitDialog({ habit })}
        />
      </aside>

      {habitDialog && (
        <HabitDialog
          habit={habitDialog.habit}
          defaultDate={todayStr()}
          onClose={() => setHabitDialog(null)}
          onSaved={() => {
            setHabitDialog(null);
            queryClient.invalidateQueries({ queryKey: ['habits'] });
            queryClient.invalidateQueries({ queryKey: ['habitOccurrences'] });
          }}
        />
      )}

      {dialogOpen && (
        <EventDialog
          event={editing}
          defaultDate={date}
          defaultRecurrence={newRecurrence}
          onClose={() => setDialogOpen(false)}
          onSaved={() => {
            setDialogOpen(false);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

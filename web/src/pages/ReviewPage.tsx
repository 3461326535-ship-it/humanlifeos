import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { TodoEvent } from '../lib/types';
import { deadlineOf, diffDays, doneStamp, endOf, md } from '../lib/spans';
import DoneDateBar from '../components/DoneDateBar';

// ── 阈值（想调就改这里）──
const STALE_DAYS = 14; // 一次性任务：计划终点过去两周还没做 → 该处置了
const DRIFT_DAYS = 30; // 在办任务：一个月没动过 → 其实已经不在办了

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftDate(base: string, n: number) {
  const d = new Date(base + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** updated_at 是 SQLite 的 UTC 'YYYY-MM-DD HH:MM:SS'，按自然日粗算就够 */
function ageDays(ts: string | null, today: string) {
  const d = (ts || '').slice(0, 10);
  if (!d) return 0;
  return diffDays(d, today);
}

type Item = { event: TodoEvent; reason: string; rank: number };

type Act = 'done' | 'drop' | 'today' | 'later';

export default function ReviewPage() {
  const queryClient = useQueryClient();
  const { data: events, isLoading } = useQuery({ queryKey: ['events'], queryFn: api.getEvents });
  const [handled, setHandled] = useState<Set<number>>(new Set());
  const [busyId, setBusyId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showDropped, setShowDropped] = useState(false);
  // 正在选「哪天做完的」的那一行：这个页面上全是旧账，默认记成今天是最容易撒谎的一步
  const [picking, setPicking] = useState<number | null>(null);

  const { stale, missed, drifting, dropped } = useMemo(() => {
    const today = todayStr();
    const all = (events || []).filter((e) => !e.completed && !e.canceled_at);

    // ① 陈年旧账：一次性任务，过了计划终点两周以上。
    //    这些不是「今天忘了做」，是「一直没决定」——所以需要人来做决定。
    const stale: Item[] = all
      .filter((e) => !e.rule_id && diffDays(deadlineOf(e), today) > STALE_DAYS)
      .map((e) => ({
        event: e,
        reason: `原定 ${md(e.date)} · 已过 ${diffDays(deadlineOf(e), today)} 天`,
        rank: diffDays(deadlineOf(e), today),
      }))
      .sort((a, b) => b.rank - a.rank); // 欠最久的先处理，先清干净的角落

    // ② 错过的周期：同一条规则可能攒了十几期没做，只报一条 + 次数
    const byRule = new Map<number, TodoEvent[]>();
    all
      .filter((e) => e.rule_id && deadlineOf(e) < today)
      .forEach((e) => {
        const list = byRule.get(e.rule_id as number);
        if (list) list.push(e);
        else byRule.set(e.rule_id as number, [e]);
      });
    const missed: Item[] = [...byRule.values()]
      .map((list) => {
        const latest = [...list].sort((a, b) => deadlineOf(b).localeCompare(deadlineOf(a)))[0];
        return {
          event: latest,
          reason: `连着 ${list.length} 期没做 · 最近一次 ${md(deadlineOf(latest))}`,
          rank: list.length,
        };
      })
      .sort((a, b) => b.rank - a.rank);

    // ③ 搁置的在办：状态还挂在「进行中/待审核」，但一个月没碰过。
    //    留着它只会让「进行中」这个数字失真。
    const drifting: Item[] = all
      .filter((e) => (e.status === 'in_progress' || e.status === 'review') && ageDays(e.updated_at, today) > DRIFT_DAYS)
      .map((e) => ({
        event: e,
        reason: `${e.status === 'review' ? '待审核' : '进行中'} · 已 ${ageDays(e.updated_at, today)} 天没动`,
        rank: ageDays(e.updated_at, today),
      }))
      .sort((a, b) => b.rank - a.rank);

    const dropped = (events || []).filter((e) => e.canceled_at);

    return { stale, missed, drifting, dropped };
  }, [events]);

  const left = [stale, missed, drifting].reduce(
    (n, list) => n + list.filter((i) => !handled.has(i.event.id)).length,
    0
  );

  async function act(e: TodoEvent, kind: Act, doneOn?: string) {
    setBusyId(e.id);
    setErr(null);
    try {
      if (kind === 'done') {
        // 补记：默认今天，但允许记在真正做完的那天 —— 这正是这个页面最需要说清的事
        await api.completeOn(e.id, doneStamp(doneOn || todayStr()));
      } else if (kind === 'drop') {
        await api.cancelEvent(e.id);
      } else {
        // 「今天」和「+7 天」都以**今天**为基准算，而不是在原来那个过期日上加减 ——
        // 一个 7 月的活往后推一周还是 7 月，等于没推
        const target = kind === 'today' ? todayStr() : shiftDate(todayStr(), 7);
        const delta = diffDays(e.date, target);
        const end = endOf(e);
        await api.updateEvent(e.id, {
          title: e.title,
          date: target,
          time: e.time || '',
          // 跨天任务整体平移，别把工期留在一周前
          end_date: end ? shiftDate(end, delta) : null,
        });
      }
      setHandled((prev) => new Set(prev).add(e.id));
      setPicking(null);
      queryClient.invalidateQueries({ queryKey: ['events'] });
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  /**
   * 停掉整条周期。和「跳过这一期」是两件事：
   *  - 跳过：只有这一期不做了，下周照旧
   *  - 停掉：明天起不再生成，未来没做的实例一起收走（已完成的保留）
   * 连着几十期没做的规则，答案通常是「停掉」，不是「再跳过一次」。
   */
  async function stopRule(e: TodoEvent) {
    if (!e.rule_id) return;
    const ok = window.confirm(
      `停掉「${e.title}」这条周期？\n\n明天起不再生成新的，已经铺到日历上的未来几期会一起收走；` +
        `已经做完的保留。今天及以前的不受影响。`
    );
    if (!ok) return;
    setBusyId(e.id);
    try {
      await api.stopRecurringRule(e.rule_id);
      setHandled((prev) => new Set(prev).add(e.id));
      queryClient.invalidateQueries({ queryKey: ['events'] });
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function restore(e: TodoEvent) {
    setBusyId(e.id);
    try {
      await api.cancelEvent(e.id, false);
      // 之前标记「已处置」的痕迹要抹掉，不然它会重新进列表却立刻被过滤隐藏
      setHandled((prev) => {
        const next = new Set(prev);
        next.delete(e.id);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  function Row({ item }: { item: Item }) {
    const e = item.event;
    const busy = busyId === e.id;
    const isRecurring = !!e.rule_id;
    return (
      <li className={busy ? 'opacity-50' : ''}>
        <div className="flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] leading-[1.4] text-ink">
              {isRecurring && <span className="mr-1 text-[12px] text-ink-faint">↻</span>}
              {e.title}
            </p>
            <p className="mt-0.5 truncate text-[11.5px] text-ink-soft">
              {e.category && e.category !== '其他' ? `${e.category} · ` : ''}
              <span className="text-coral/90">{item.reason}</span>
            </p>
          </div>
          <div className="flex flex-none items-center gap-1">
            <button
              className="rounded-md px-2 py-1 text-[11.5px] text-moss-deep ring-1 ring-moss/25 transition-colors hover:bg-moss-soft disabled:opacity-40"
              onClick={() => setPicking(picking === e.id ? null : e.id)}
              disabled={busy}
              title={isRecurring ? '补记这一期：选哪天做完的' : '这件事做完了：选哪天做完的'}
            >
              {isRecurring ? '补记这期' : '完成'}
            </button>
            <button
              className="rounded-md px-2 py-1 text-[11.5px] text-ink-mid ring-1 ring-line transition-colors hover:bg-paper-deep disabled:opacity-40"
              onClick={() => act(e, 'today')}
              disabled={busy}
              title="挪到今天重新排"
            >
              今天
            </button>
            <button
              className="rounded-md px-2 py-1 text-[11.5px] text-ink-mid ring-1 ring-line transition-colors hover:bg-paper-deep disabled:opacity-40"
              onClick={() => act(e, 'later')}
              disabled={busy}
              title="往后推一周"
            >
              +7 天
            </button>
            <button
              className="rounded-md px-2 py-1 text-[11.5px] text-ink-soft transition-colors hover:bg-paper-deep hover:text-ink-mid disabled:opacity-40"
              onClick={() => act(e, 'drop')}
              disabled={busy}
              title={
                isRecurring
                  ? '这一期不做了，规则照旧（下次照常出现）'
                  : '决定不做了（不删除，统计里仍可见，可恢复）'
              }
            >
              {isRecurring ? '跳过这期' : '不做'}
            </button>
            {isRecurring && (
              <button
                className="rounded-md px-2 py-1 text-[11.5px] text-coral/85 transition-colors hover:bg-coral-soft disabled:opacity-40"
                onClick={() => stopRule(e)}
                disabled={busy}
                title="以后不再生成这条周期（不是只跳过这一次）"
              >
                停掉周期
              </button>
            )}
          </div>
        </div>

        {picking === e.id && (
          <DoneDateBar
            mode="complete"
            value={todayStr()}
            original={e.date}
            busy={busy}
            onSubmit={(d) => act(e, 'done', d)}
            onCancel={() => setPicking(null)}
          />
        )}
      </li>
    );
  }

  function Group({ title, hint, items }: { title: string; hint: string; items: Item[] }) {
    const rows = items.filter((i) => !handled.has(i.event.id));
    if (rows.length === 0) return null;
    return (
      <section className="mb-6">
        <div className="flex items-center gap-2.5 pb-1">
          <h3 className="text-[13px] font-semibold text-ink-mid">{title}</h3>
          <span className="text-[12px] tabular-nums text-ink-soft">{rows.length}</span>
          <span className="hidden text-[11.5px] text-ink-faint sm:inline">{hint}</span>
          <span className="h-px flex-1 bg-line/70" />
        </div>
        <ul className="divide-y divide-line/50">
          {rows.map((i) => (
            <Row key={i.event.id} item={i} />
          ))}
        </ul>
      </section>
    );
  }

  return (
    <div className="min-w-0 max-w-[880px]">
      <div className="mb-5 rounded-xl border border-line bg-white/55 px-5 py-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[15px] font-semibold text-ink">回顾</h2>
          <span className="text-[12px] tabular-nums text-ink-soft">
            {left > 0 ? `还剩 ${left} 条要处置` : '都处置完了'}
          </span>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
          这些是很久没动的事，不是「今天忘了做」——是「一直没决定」。逐条给个结论：做完了、挪到今天、还是决定不做。
          <span className="text-ink-mid">「不做」不等于删除</span>
          ，它只是离开待办，统计里仍算一次「取消」，随时能恢复。
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-faint">
          「补记」会先问哪天做完的：上个月做完的事就记在上个月，本周完成数不会因此虚高。
          周期任务上，「跳过这期」只跳过一期，「停掉周期」才是以后都不再生成。
        </p>
      </div>

      {err && (
        <div className="mb-3 rounded-lg bg-coral-soft px-3 py-2 text-xs text-coral ring-1 ring-coral/25">{err}</div>
      )}

      {isLoading ? (
        <p className="py-20 text-center text-sm text-ink-soft">加载中…</p>
      ) : left === 0 && dropped.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line py-16 text-center">
          <p className="text-[13.5px] text-ink-mid">没有需要回顾的东西</p>
          <p className="mt-1 text-[12px] text-ink-faint">陈年旧账都清完了，列表是干净的</p>
        </div>
      ) : (
        <>
          <Group title="陈年旧账" hint={`一次性任务，过了计划日 ${STALE_DAYS} 天以上还没做`} items={stale} />
          <Group title="错过的周期任务" hint="同一条规则攒了好几期没做，只列最近一次" items={missed} />
          <Group title="搁置的在办" hint={`挂在「进行中/待审核」但 ${DRIFT_DAYS} 天没动过`} items={drifting} />

          {left === 0 && (
            <div className="rounded-xl border border-dashed border-line py-12 text-center">
              <p className="text-[13.5px] text-ink-mid">这一轮处置完了</p>
              <p className="mt-1 text-[12px] text-ink-faint">下次有积压再来</p>
            </div>
          )}
        </>
      )}

      {/* 已取消：能看见、能恢复 —— 「不做」是个决定，不是一个黑洞 */}
      {dropped.length > 0 && (
        <section className="mt-8 border-t border-line/60 pt-4">
          <button
            type="button"
            onClick={() => setShowDropped((v) => !v)}
            aria-expanded={showDropped}
            className="flex items-center gap-1.5 text-[12px] text-ink-soft transition-colors hover:text-ink-mid"
          >
            <span className={`text-[9px] transition-transform ${showDropped ? '-rotate-90' : 'rotate-90'}`}>›</span>
            已决定不做 <span className="tabular-nums text-ink-faint">{dropped.length}</span>
          </button>
          {showDropped && (
            <ul className="mt-2 divide-y divide-line/40">
              {dropped.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2">
                  <p className="min-w-0 flex-1 truncate text-[12.5px] text-ink-soft line-through">{e.title}</p>
                  <span className="flex-none text-[11px] text-ink-faint">{md(e.date)}</span>
                  <button
                    className="flex-none rounded-md px-2 py-0.5 text-[11px] text-ink-soft ring-1 ring-line transition-colors hover:text-ink-mid"
                    onClick={() => restore(e)}
                    disabled={busyId === e.id}
                  >
                    恢复
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

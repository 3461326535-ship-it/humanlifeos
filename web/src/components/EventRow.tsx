import { useEffect, useRef, useState } from 'react';
import type { TodoEvent } from '../lib/types';
import { PRIORITY_TEXT, priorityChipClass } from '../lib/priority';
import { diffDays, doneDate, spanInfo, todayStr } from '../lib/spans';
import { cadenceLabel } from '../lib/recurring';
import TimerButton from './TimerButton';
import DoneDateBar from './DoneDateBar';

function timeRange(event: TodoEvent) {
  const start = event.time || (event.start_time ? event.start_time.slice(11, 16) : '');
  const end = event.end_time ? event.end_time.slice(11, 16) : '';
  if (start && end) return `${start}-${end}`;
  return start;
}

/** 完成日的人话：今天 / 昨天 / 11/6（37 天前） */
function doneLabel(day: string) {
  if (!day) return '';
  const gap = diffDays(day, todayStr()); // 正数 = 距今多少天前
  if (gap === 0) return '今天';
  if (gap === 1) return '昨天';
  const [, m, d] = day.split('-');
  return gap > 1 ? `${Number(m)}/${Number(d)}（${gap} 天前）` : `${Number(m)}/${Number(d)}`;
}

export default function EventRow({
  event,
  viewDate,
  onToggle,
  onEdit,
  onToggleSubtask,
  onCompleteAt,
}: {
  event: TodoEvent;
  /** 正在看的那一天：跨天任务靠它算「第 N/M 天」 */
  viewDate?: string;
  onToggle: () => void;
  onEdit: () => void;
  onToggleSubtask?: (subtaskId: number) => void;
  /** 补记完成日期（YYYY-MM-DD）；不传则不提供补录入口 */
  onCompleteAt?: (date: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // 补录面板：'complete' = 勾之前先选日子；'edit' = 已完成，回来改哪天数
  const [sheet, setSheet] = useState<'none' | 'complete' | 'edit'>('none');
  const holdRef = useRef<number | null>(null);
  const longPressed = useRef(false);

  useEffect(() => () => {
    if (holdRef.current) window.clearTimeout(holdRef.current);
  }, []);

  const subs = event.subtasks || [];
  const subTotal = subs.length;
  const subDone = subs.filter((s) => s.completed).length;
  const pct = subTotal > 0 ? Math.round((subDone / subTotal) * 100) : 0;
  const range = timeRange(event);

  const isRecurring = !!event.rule_id || !!event.recurrence;
  const cadence = cadenceLabel(event.recurrence, event.date);
  const done = event.completed ? doneDate(event) : '';

  // 行的主点击＝展开/收起子任务（有子任务时），只有没有子任务时才落回编辑。
  // 编辑的明确入口：右侧铅笔按钮（hover 出现）或双击行。
  const rowClick = () => {
    if (subTotal > 0) setExpanded((v) => !v);
    else onEdit();
  };

  // 跨天任务：在行内报出「第几天 / 到哪天为止 / 超期几天」。
  // 没有它就分不清这一行是今天新排的，还是从上周一直挂到现在的。
  const span = viewDate ? spanInfo(event, viewDate) : null;

  const metaBits: { text: string; cls?: string }[] = [
    ...(span ? [{ text: span.label, cls: span.kind === 'overdue' ? 'text-coral' : 'text-ink-mid' }] : []),
    // 节律是这一行的身份：不是「今天有事」，是「每周五都有事」。没有它，
    // 勾选的人不会知道自己动的是这一期还是整条规则。
    ...(isRecurring && cadence ? [{ text: `↻ ${cadence}` }] : []),
    ...(event.category && event.category !== '其他' ? [{ text: event.category }] : []),
    ...(range ? [{ text: range }] : []),
  ];

  // 长按勾选圈 = 「慢着，是哪天做完的？」；普通单击仍然是零摩擦的「现在完成」
  const startHold = () => {
    if (!onCompleteAt || event.completed) return;
    longPressed.current = false;
    holdRef.current = window.setTimeout(() => {
      longPressed.current = true;
      setSheet('complete');
    }, 450);
  };
  const endHold = () => {
    if (holdRef.current) window.clearTimeout(holdRef.current);
    holdRef.current = null;
  };

  return (
    <li className="border-b border-line/40 last:border-b-0">
      <div
        role="button"
        tabIndex={0}
        className="group flex cursor-pointer items-center gap-3 py-3 pl-0.5 pr-1 transition-colors hover:bg-paper-deep/40"
        onClick={rowClick}
        onDoubleClick={onEdit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') rowClick();
          if (e.key === ' ') {
            e.preventDefault();
            rowClick();
          }
        }}
      >
        {/* 左：勾选圈 —— 完成态就在原地填实并打勾（勾必须长在你要点的地方） */}
        <button
          className={`flex h-[17px] w-[17px] flex-none items-center justify-center rounded-full border transition-colors ${
            event.completed
              ? 'border-moss-deep bg-moss-deep'
              : 'border-[#CFC7BA] group-hover:border-moss/60'
          }`}
          onPointerDown={startHold}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onContextMenu={(e) => {
            // 右键也开补录面板：长按在桌面端不直观，右键是同一个意思
            if (!onCompleteAt || event.completed) return;
            e.preventDefault();
            e.stopPropagation();
            setSheet('complete');
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (longPressed.current) {
              longPressed.current = false;
              return;
            }
            onToggle();
          }}
          aria-label={
            event.completed
              ? '标记未完成'
              : isRecurring
                ? '补记这一期完成（长按可选完成日期）'
                : '标记完成（长按可选完成日期）'
          }
          title={
            event.completed
              ? '标记未完成'
              : isRecurring
                ? '完成这一期，周期继续；长按可选「哪天做完的」'
                : '标记完成；长按可选「哪天做完的」'
          }
        >
          {event.completed && (
            <svg
              viewBox="0 0 12 12"
              className="h-[9px] w-[9px] fill-none stroke-white"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2.4 6.2 4.7 8.6 9.6 3.4" />
            </svg>
          )}
        </button>

        {/* 中：标题 + 一行元信息 */}
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-[14px] leading-[1.5] ${
              event.completed ? 'text-ink-soft line-through' : 'text-ink'
            }`}
          >
            {event.is_milestone ? (
              <span
                className="mr-1.5 inline-block h-[7px] w-[7px] rotate-45 bg-moss-deep"
                style={{ verticalAlign: '1px' }}
                title="里程碑（只有一个达成日）"
              />
            ) : null}
            {isRecurring ? (
              <span className="sr-only">周期任务</span>
            ) : null}
            {event.title}
          </p>

          {(metaBits.length > 0 || subTotal > 0 || done) && (
            <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] text-ink-soft">
              {metaBits.map((b, i) => (
                <span key={b.text} className="flex min-w-0 items-center gap-1.5">
                  {i > 0 && <span className="flex-none text-ink-faint">·</span>}
                  <span className={`truncate ${b.cls || ''}`}>{b.text}</span>
                </span>
              ))}

              {subTotal > 0 && (
                <span className="flex flex-none items-center gap-1.5">
                  {metaBits.length > 0 && <span className="text-ink-faint">·</span>}
                  <span className="h-[3px] w-9 overflow-hidden rounded-full bg-line">
                    <span
                      className={`block h-full rounded-full ${subDone === subTotal ? 'bg-moss' : 'bg-moss/60'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="tabular-nums">
                    {subDone}/{subTotal}
                  </span>
                  <span
                    className={`text-[9px] leading-none text-ink-faint transition-transform ${
                      expanded ? 'inline-block -rotate-90' : 'inline-block rotate-90'
                    }`}
                  >
                    ›
                  </span>
                </span>
              )}

              {/* 完成日：默认显示，可点改 —— 「今天做的」和「上上周做的」不该长得一样 */}
              {done && (
                <span className="flex flex-none items-center gap-1.5">
                  {metaBits.length > 0 && <span className="text-ink-faint">·</span>}
                  <button
                    type="button"
                    disabled={!onCompleteAt}
                    className={`rounded px-1 -mx-1 transition-colors ${
                      onCompleteAt ? 'hover:bg-line/50 hover:text-ink-mid' : ''
                    }`}
                    title={onCompleteAt ? '改完成日期（补记到实际做完的那天）' : undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onCompleteAt) setSheet('edit');
                    }}
                  >
                    完成于 {doneLabel(done)}
                  </button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* 右：行内计时（完成态不给计时入口）+ 编辑按钮（hover / 触屏常显）+ 优先级牌 */}
        <div className="flex flex-none items-center gap-2">
          {!event.completed && <TimerButton eventId={event.id} />}
          <button
            className="flex h-6 w-6 items-center justify-center rounded-md text-ink-faint opacity-40 transition-opacity hover:bg-line/60 hover:text-ink-mid sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            aria-label="编辑任务"
            title="编辑任务（也可以双击这一行）"
          >
            <svg viewBox="0 0 14 14" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.4 2.2l2.4 2.4-7 7H2.4V9.2l7-7z" />
            </svg>
          </button>

          {/* 优先级牌：完成态仍然保留，只是压暗（见 lib/priority.ts） */}
          {event.priority && (
            <span className={`chip border ${priorityChipClass(event.priority, event.completed)}`}>
              {PRIORITY_TEXT[event.priority]}
            </span>
          )}
        </div>
      </div>

      {/* 补录完成日期：行内展开，不夺走上下文 */}
      {sheet !== 'none' && onCompleteAt && (
        <DoneDateBar
          mode={sheet}
          value={sheet === 'edit' ? done || todayStr() : todayStr()}
          original={event.date}
          onSubmit={(d) => {
            setSheet('none');
            onCompleteAt(d);
          }}
          onCancel={() => setSheet('none')}
        />
      )}

      {/* 子任务：行内展开，勾选即时生效，不跳页不开弹窗 */}
      {expanded && subTotal > 0 && (
        <ul className="ml-[30px] mr-2 mb-2 space-y-px border-l border-line/60 pl-3">
          {subs.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded py-1 text-left transition-colors hover:bg-paper-deep/50"
                onClick={() => onToggleSubtask?.(s.id)}
              >
                <span
                  className={`flex h-[13px] w-[13px] flex-none items-center justify-center rounded-full border transition-colors ${
                    s.completed ? 'border-moss bg-moss' : 'border-[#CFC7BA]'
                  }`}
                >
                  {s.completed && (
                    <svg viewBox="0 0 10 10" className="h-2 w-2 fill-none stroke-white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 5.2 4 7.2 8 2.9" />
                    </svg>
                  )}
                </span>
                <span
                  className={`text-[12.5px] leading-5 ${
                    s.completed ? 'text-ink-faint line-through' : 'text-ink-mid'
                  }`}
                >
                  {s.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

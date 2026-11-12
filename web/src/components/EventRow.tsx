import { useState } from 'react';
import type { TodoEvent } from '../lib/types';

// 优先级 chip：图纸上是「浅底 + 描边」的小方牌，不是实心块
const PRIORITY_CHIP: Record<string, string> = {
  high: 'border-coral/40 bg-coral-soft/70 text-coral',
  medium: 'border-clay/40 bg-clay-soft/70 text-clay',
  low: 'border-line bg-paper-deep text-ink-soft',
};

const PRIORITY_TEXT: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

function timeRange(event: TodoEvent) {
  const start = event.time || (event.start_time ? event.start_time.slice(11, 16) : '');
  const end = event.end_time ? event.end_time.slice(11, 16) : '';
  if (start && end) return `${start}-${end}`;
  return start;
}

export default function EventRow({
  event,
  onToggle,
  onEdit,
  onToggleSubtask,
}: {
  event: TodoEvent;
  onToggle: () => void;
  onEdit: () => void;
  onToggleSubtask?: (subtaskId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const subs = event.subtasks || [];
  const subTotal = subs.length;
  const subDone = subs.filter((s) => s.completed).length;
  const pct = subTotal > 0 ? Math.round((subDone / subTotal) * 100) : 0;
  const range = timeRange(event);

  // 行的主点击＝展开/收起子任务（有子任务时），只有没有子任务时才落回编辑。
  // 编辑的明确入口：右侧铅笔按钮（hover 出现）或双击行。
  const rowClick = () => {
    if (subTotal > 0) setExpanded((v) => !v);
    else onEdit();
  };

  const metaBits = [
    event.category && event.category !== '其他' ? event.category : '',
    range,
  ].filter(Boolean) as string[];

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
        {/* 左：空心勾选圈 */}
        <button
          className={`flex h-[17px] w-[17px] flex-none items-center justify-center rounded-full border transition-colors ${
            event.completed ? 'border-line' : 'border-[#CFC7BA] group-hover:border-moss/60'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          aria-label={event.completed ? '标记未完成' : '标记完成'}
        />

        {/* 中：标题 + 一行元信息 */}
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-[14px] leading-[1.5] ${
              event.completed ? 'text-ink-soft line-through' : 'text-ink'
            }`}
          >
            {event.title}
          </p>

          {(metaBits.length > 0 || subTotal > 0) && (
            <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] text-ink-soft">
              {metaBits.map((b, i) => (
                <span key={b} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-ink-faint">·</span>}
                  <span className="truncate">{b}</span>
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
            </div>
          )}
        </div>

        {/* 右：编辑按钮（hover / 触屏常显）+ 优先级牌 / 已完成绿勾 */}
        <div className="flex flex-none items-center gap-2">
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

          {event.completed ? (
            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-moss-deep">
              <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 fill-none stroke-white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 6.2 4.8 8.5 9.5 3.6" />
              </svg>
            </span>
          ) : (
            event.priority && (
              <span className={`chip border ${PRIORITY_CHIP[event.priority]}`}>
                {PRIORITY_TEXT[event.priority]}
              </span>
            )
          )}
        </div>
      </div>

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

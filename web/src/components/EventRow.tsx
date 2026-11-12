import type { TodoEvent } from '../lib/types';
import { RECURRENCE_LABELS, PRIORITY_LABELS } from '../lib/types';

const CAT_DOT: Record<string, string> = {
  工作: 'bg-lagoon',
  生活: 'bg-clay',
  学习: 'bg-moss',
  健康: 'bg-coral',
  其他: 'bg-ink-faint',
};

const STATUS_CHIP: Record<string, string> = {
  in_progress: 'bg-lagoon-soft text-lagoon',
  review: 'bg-clay-soft text-clay',
};

const STATUS_TEXT: Record<string, string> = {
  in_progress: '进行中',
  review: '待审核',
};

export default function EventRow({
  event,
  onToggle,
  onEdit,
}: {
  event: TodoEvent;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const subTotal = event.subtasks.length;
  const subDone = event.subtasks.filter((s) => s.completed).length;
  const subPct = subTotal > 0 ? Math.round((subDone / subTotal) * 100) : 0;

  return (
    <li
      className="group flex cursor-pointer items-start gap-3 border-t border-line-soft px-4 py-3 transition-colors hover:bg-paper-deep/40"
      onClick={onEdit}
    >
      {/* 圆形勾选 */}
      <button
        className={`mt-0.5 flex h-[17px] w-[17px] flex-none items-center justify-center rounded-full border
          transition-all ${
            event.completed
              ? 'border-moss bg-moss'
              : 'border-[#CFC7BA] group-hover:border-moss/60'
          }`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label={event.completed ? '标记未完成' : '标记完成'}
      >
        {event.completed && (
          <svg viewBox="0 0 12 12" className="h-2 w-2 fill-none stroke-white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 6.2 4.8 8.5 9.5 3.6" />
          </svg>
        )}
      </button>

      {/* 主体 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <span
            className={`min-w-0 flex-1 text-[13.5px] leading-[1.55] ${
              event.completed ? 'text-ink-soft line-through' : 'text-ink'
            }`}
          >
            {event.title}
          </span>

          <div className="flex flex-none items-center gap-1.5 pt-px">
            {!event.completed && event.priority === 'high' && (
              <span className="chip bg-coral-soft text-coral">{PRIORITY_LABELS.high}</span>
            )}
            {!event.completed && STATUS_CHIP[event.status] && (
              <span className={`chip ${STATUS_CHIP[event.status]}`}>{STATUS_TEXT[event.status]}</span>
            )}
            {event.recurrence && (
              <span className="chip bg-clay-soft text-clay">↻ {RECURRENCE_LABELS[event.recurrence]}</span>
            )}
          </div>
        </div>

        {event.description && (
          <p className="mt-0.5 line-clamp-1 text-[11.5px] leading-5 text-ink-soft">{event.description}</p>
        )}

        {(event.time || event.category || subTotal > 0) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-ink-soft">
            {event.time && <span className="tabular-nums">{event.time}</span>}
            {event.time && event.category && <span className="h-[3px] w-[3px] rounded-full bg-ink-faint" />}
            {event.category && (
              <span className="flex items-center gap-1.5">
                <i className={`h-[5px] w-[5px] rounded-full ${CAT_DOT[event.category] || 'bg-ink-faint'}`} />
                {event.category}
              </span>
            )}
            {subTotal > 0 && (
              <>
                <span className="h-[3px] w-[3px] rounded-full bg-ink-faint" />
                <span className="tabular-nums">
                  子任务 {subDone}/{subTotal}
                </span>
              </>
            )}
          </div>
        )}

        {subTotal > 0 && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 w-[150px] overflow-hidden rounded-full bg-line-soft">
              <div
                className={`h-full rounded-full transition-all ${subPct === 100 ? 'bg-moss/60' : 'bg-moss'}`}
                style={{ width: `${subPct}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

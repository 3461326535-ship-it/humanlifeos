import type { TodoEvent } from '../lib/types';
import { RECURRENCE_LABELS, PRIORITY_LABELS } from '../lib/types';

const PRIORITY_STYLE: Record<string, string> = {
  high: 'bg-rose-50 text-rose-600',
  medium: 'bg-amber-50 text-amber-600',
  low: 'bg-sky-50 text-sky-600',
};

const STATUS_STYLE: Record<string, string> = {
  in_progress: 'bg-blue-50 text-blue-600',
  review: 'bg-amber-50 text-amber-600',
};

const STATUS_LABEL: Record<string, string> = {
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
  const subDone = event.subtasks.filter((s) => s.completed).length;

  return (
    <li
      className="group flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3
        shadow-card transition-all hover:border-indigo-200/80 hover:shadow-card-hover"
      onClick={onEdit}
    >
      {/* 完成勾选（方形，效率工具风） */}
      <button
        className={`mt-0.5 flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border-2
          transition-all ${
            event.completed
              ? 'border-indigo-600 bg-indigo-600 text-white'
              : 'border-slate-300 group-hover:border-indigo-400'
          }`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label={event.completed ? '标记未完成' : '标记完成'}
      >
        {event.completed && (
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 fill-current">
            <path d="M4.5 8.6 1.4 5.5l1-1 2.1 2.1 4.1-4.1 1 1z" />
          </svg>
        )}
      </button>

      {/* 时间列（固定宽度对齐） */}
      {event.time && (
        <span className="mt-[1px] w-11 flex-none text-[13px] font-semibold tabular-nums text-slate-400">
          {event.time}
        </span>
      )}

      {/* 主体 */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={`text-[14px] leading-6 ${
              event.completed ? 'text-slate-300 line-through' : 'font-medium text-slate-800'
            }`}
          >
            {event.title}
          </span>
          {event.priority && (
            <span className={`chip ${PRIORITY_STYLE[event.priority]}`}>
              {PRIORITY_LABELS[event.priority]}
            </span>
          )}
          {event.recurrence && (
            <span className="chip bg-violet-50 text-violet-500">
              ↻ {RECURRENCE_LABELS[event.recurrence]}
            </span>
          )}
          {STATUS_STYLE[event.status] && (
            <span className={`chip ${STATUS_STYLE[event.status]}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
              {STATUS_LABEL[event.status]}
            </span>
          )}
        </div>

        {event.description && (
          <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-400">{event.description}</p>
        )}

        {(event.category || event.subtasks.length > 0) && (
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">
            {event.category && event.category !== '其他' && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-500">
                {event.category}
              </span>
            )}
            {event.subtasks.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-1 w-1 rounded-full bg-slate-300" />
                子任务 {subDone}/{event.subtasks.length}
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

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
}: {
  event: TodoEvent;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const subTotal = event.subtasks.length;
  const subDone = event.subtasks.filter((s) => s.completed).length;
  const range = timeRange(event);

  const meta = [event.category && event.category !== '其他' ? event.category : '', range, subTotal > 0 ? `子任务 ${subDone}/${subTotal}` : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <li
      className="group flex cursor-pointer items-center gap-3 border-b border-line/40 py-3 pl-0.5 pr-1 transition-colors last:border-b-0 hover:bg-paper-deep/40"
      onClick={onEdit}
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
        {meta && <p className="mt-0.5 truncate text-[11.5px] text-ink-soft">{meta}</p>}
      </div>

      {/* 右：优先级牌 / 已完成绿勾 */}
      <div className="flex flex-none items-center">
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
    </li>
  );
}

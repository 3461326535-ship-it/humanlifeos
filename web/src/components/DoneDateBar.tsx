import { useState } from 'react';
import { diffDays, md, todayStr } from '../lib/spans';

function shift(base: string, n: number) {
  const d = new Date(base + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 「哪天做完的？」
 *
 * 补录完成日期是本页最容易骗自己的地方：一件 131 天前就该做的事，
 * 今天补勾一下，如果记成「今天完成」，本周完成数好看得不像话，往后回看也查不出来。
 * 所以勾选只负责「现在完成」这条快路，真正补记要走这个面板。
 *
 * 做成行内展开而不是弹窗：和子任务用同一套语言 —— 就地动一下，不夺走上下文。
 */
export default function DoneDateBar({
  value,
  original,
  mode,
  busy,
  onSubmit,
  onCancel,
}: {
  /** 预填日期（YYYY-MM-DD），默认今天 */
  value?: string;
  /** 原定日：给「记在原定那天」一个一键的入口 */
  original?: string;
  /** complete = 还没完成，选完才落章；edit = 已完成，只改哪天算完成 */
  mode: 'complete' | 'edit';
  busy?: boolean;
  onSubmit: (date: string) => void;
  onCancel: () => void;
}) {
  const today = todayStr();
  const [date, setDate] = useState(value || today);

  const quick: { label: string; d: string }[] = [
    { label: '今天', d: today },
    { label: '昨天', d: shift(today, -1) },
  ];
  if (original && original !== today && original !== shift(today, -1)) {
    quick.push({ label: `原定 ${md(original)}`, d: original });
  }

  const back = diffDays(date, today); // 正数 = 补记到过去
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);

  return (
    <div className="my-1 ml-[29px] mr-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border border-line/60 bg-white/65 px-2.5 py-1.5">
      <span className="text-[11.5px] text-ink-soft">{mode === 'complete' ? '记为完成于' : '改完成日'}</span>

      {quick.map((q) => (
        <button
          key={q.label}
          type="button"
          className={`rounded-full px-2 py-0.5 text-[11.5px] ring-1 transition-colors ${
            date === q.d
              ? 'bg-moss text-white ring-moss'
              : 'text-ink-mid ring-line hover:bg-paper-deep/60'
          }`}
          onClick={() => setDate(q.d)}
        >
          {q.label}
        </button>
      ))}

      <input
        type="date"
        className="rounded-md border border-line bg-white px-1.5 py-0.5 text-[11.5px] text-ink-mid outline-none focus:border-moss/40"
        value={date}
        max={today}
        onChange={(e) => e.target.value && setDate(e.target.value)}
        aria-label="完成日期"
      />

      {back > 0 && (
        <span className="text-[11px] text-ink-faint">记在 {back} 天前，不算今天完成</span>
      )}

      <span className="ml-1 flex items-center gap-1.5 border-l border-line/70 pl-2">
        <button
          type="button"
          className="rounded-md px-1.5 py-0.5 text-[11.5px] text-ink-soft transition-colors hover:text-ink-mid"
          onClick={onCancel}
        >
          取消
        </button>
        <button
          type="button"
          className="rounded-md bg-moss-deep px-2 py-0.5 text-[11.5px] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          disabled={!valid || busy}
          onClick={() => onSubmit(date)}
        >
          {mode === 'complete' ? '完成' : '保存'}
        </button>
      </span>
    </div>
  );
}

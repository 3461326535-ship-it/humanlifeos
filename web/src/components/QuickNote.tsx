import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { saveNote } from '../lib/noteActions';

const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function md(day: string) {
  const p = day.split('-');
  return `${Number(p[1])}/${Number(p[2])}`;
}
function weekdayOf(day: string) {
  return WEEK_CN[new Date(`${day}T00:00:00`).getDay()];
}

/**
 * 全站随手记：页头常驻「记一句」，任何页面按 n 也能唤出。
 *
 * 为什么放在页头而不是统计页：这件事发生在「正在做别的事」的时候，
 * 要走到统计页才能记，等于要求人先把念头存进脑子、再换个页面倒出来 —— 那时候念头已经没了。
 * 统计页只负责「看」，写可以在任何地方。
 */
export default function QuickNote() {
  const today = dayKey(new Date());
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [date, setDate] = useState(today);
  const [showDate, setShowDate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  /** 刚记到哪一天 —— 存下来只为了弹一句回执，让人确认「真的存上了」 */
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  // 打开就聚焦，别让人再点一下输入框
  useEffect(() => {
    if (!open) return;
    setErr('');
    const t = window.setTimeout(() => boxRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  // 点面板外面收起
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // n 唤出 / Esc 收起。输入框里、弹窗开着时不抢键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        setOpen(false);
        return;
      }
      if (e.key !== 'n' && e.key !== 'N') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!savedAt) return;
    const t = window.setTimeout(() => setSavedAt(null), 5000);
    return () => window.clearTimeout(t);
  }, [savedAt]);

  async function submit() {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    setErr('');
    try {
      const on = date;
      await saveNote(queryClient, content, on);
      setText('');
      setDate(today);
      setShowDate(false);
      setOpen(false);
      setSavedAt(on);
    } catch (e) {
      setErr((e as Error).message || '没记上，再试一次');
    } finally {
      setBusy(false);
    }
  }

  const backdating = date !== today;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="随手记一句（按 n 也能唤出）"
        className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] transition-colors ${
          open
            ? 'border-clay/40 bg-clay-soft text-clay'
            : 'border-line bg-white/70 text-ink-soft hover:border-clay/30 hover:text-clay'
        }`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
          <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
        </svg>
        记一句
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="随手记一句"
          className="absolute right-0 top-full z-30 mt-2 w-[356px] rounded-xl border border-line bg-white p-3 shadow-pop"
        >
          <textarea
            ref={boxRef}
            rows={3}
            maxLength={500}
            value={text}
            aria-label="随手记一句"
            placeholder="记一句…回车保存"
            title="回车保存，Shift + 回车换行"
            onChange={(e) => {
              setText(e.target.value);
              if (err) setErr('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            className="w-full resize-none rounded-lg border border-line bg-paper/50 px-2.5 py-2 text-[13px] leading-relaxed text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-clay/40 focus:bg-white"
          />

          <div className="mt-2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowDate((v) => !v)}
              title="改记到哪天（默认今天）"
              className={`flex h-6 flex-none items-center gap-1 rounded-md px-1.5 text-[11.5px] transition-colors ${
                backdating ? 'bg-clay-soft text-clay' : 'text-ink-soft hover:bg-paper-deep hover:text-ink-mid'
              }`}
            >
              {backdating ? `${md(date)} ${weekdayOf(date)}` : '今天'}
              <span className="text-[8px] leading-none">▾</span>
            </button>

            <span className="ml-auto flex-none text-[10.5px] tabular-nums text-ink-faint">
              {text.length > 0 ? `${text.length}/500` : 'Esc 关闭'}
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={!text.trim() || busy}
              className="btn flex-none bg-clay px-2.5 py-1 text-[12px] text-white transition-colors hover:bg-clay/90 disabled:opacity-40"
            >
              {busy ? '记下…' : '记下'}
            </button>
          </div>

          {showDate && (
            <div className="mt-2 flex items-center gap-2 border-t border-line/70 pt-2">
              <input
                type="date"
                value={date}
                max={today}
                aria-label="记到哪一天"
                onChange={(e) => setDate(e.target.value || today)}
                className="h-7 flex-none rounded-md border border-line bg-white px-1.5 text-[12px] text-ink-mid outline-none focus:border-clay/40"
              />
              <span className="text-[11px] leading-snug text-ink-faint">
                {backdating ? `记到 ${md(date)}，不是今天` : '默认记到今天'}
              </span>
            </div>
          )}

          {err && <p className="mt-1.5 text-[11px] text-coral">{err}</p>}
          {!err && backdating && !showDate && (
            <p className="mt-1.5 text-[11px] text-ink-faint">会记在 {md(date)} 这一天，不是今天</p>
          )}
        </div>
      )}

      {savedAt &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[80] flex justify-center">
            <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-[12.5px] text-ink-mid shadow-pop">
              <span className="flex h-4 w-4 flex-none items-center justify-center rounded-full bg-moss-soft text-[10px] leading-none text-moss">
                ✓
              </span>
              已记到{savedAt === today ? '今天' : ` ${md(savedAt)}`}
              <button
                type="button"
                className="text-moss hover:underline"
                onClick={() => {
                  const d = savedAt;
                  setSavedAt(null);
                  // at= 只是让 URL 一定变化：已经在统计页时，相同的 ?d= 不会触发任何更新
                  navigate(`/stats?d=${d}&at=${Date.now()}`);
                }}
              >
                去战报看
              </button>
              <button
                type="button"
                aria-label="关闭提示"
                className="ml-0.5 text-ink-faint transition-colors hover:text-ink-mid"
                onClick={() => setSavedAt(null)}
              >
                ✕
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { AiActionPreview, AiMessage } from '../lib/types';

/**
 * AI 助手「小日志」
 *
 * 行为与旧页面（todo.html + js/script.js 的 AI 部分）一致：
 *   打开面板 → 拉 /api/ai/history → 发消息走 /api/ai/chat
 *   → needsConfirm 时弹确认框 → /api/ai/confirm 执行 → 刷新数据
 *   → 每轮对话 POST /api/ai/history 落库（PC/移动端共享）
 *
 * 只有 UI 是新的（纸感 + 公用侧栏那套色板），接口一律沿用后端现有实现。
 */

const QUICK_ACTIONS: { label: string; prompt: string }[] = [
  { label: '新建任务', prompt: '帮我创建一个新任务' },
  { label: '今天', prompt: '列出今天所有日程' },
  { label: '完成', prompt: '今天还有哪些任务没完成' },
  { label: '效率', prompt: '帮我统计各分类任务的完成率' },
  { label: '明天', prompt: '列出明天所有日程' },
  { label: '搜索', prompt: '帮我搜索任务' },
];

function todayStr() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fmtDate(d: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
  if (!m) return d;
  return `${Number(m[2])} 月 ${Number(m[3])} 日`;
}

/** 确认弹窗里的详情：按 actionPreview.type 渲染，字段与后端返回一一对应 */
function PreviewDetails({ preview }: { preview: AiActionPreview }) {
  const data = preview.data || {};
  const Row = ({ label, value }: { label: string; value?: string | null }) =>
    value ? (
      <div className="flex gap-2">
        <span className="w-14 flex-none text-ink-soft">{label}</span>
        <span className="min-w-0 flex-1 break-words text-ink">{value}</span>
      </div>
    ) : null;

  const titles = (preview.titles || []).slice(0, 6);

  switch (preview.type) {
    case 'create':
      return (
        <div className="space-y-1">
          <Row label="操作" value="创建任务" />
          <Row label="标题" value={data.title} />
          <Row label="日期" value={data.date ? fmtDate(data.date) : ''} />
          <Row label="时间" value={data.time} />
          <Row label="分类" value={data.category} />
          {data.subtasks && data.subtasks.length > 0 && (
            <Row label="子任务" value={data.subtasks.map((s) => s.title).join('、')} />
          )}
          {data.kind === 'habit' && <Row label="类型" value="习惯（每天/按周重复）" />}
          {data.kind === 'recurring_task' && <Row label="类型" value="周期任务" />}
        </div>
      );
    case 'update':
      return (
        <div className="space-y-1">
          <Row label="操作" value="修改任务" />
          <Row label="任务" value={data.title} />
          <Row label="新时间" value={data.time} />
          <Row label="新日期" value={data.date ? fmtDate(data.date) : ''} />
          <Row label="新分类" value={data.category} />
        </div>
      );
    case 'delete':
      return (
        <div className="space-y-1">
          <Row label="操作" value="删除任务" />
          <Row label="任务" value={data.title} />
          {data.onlyCompleted && <Row label="范围" value="仅删除已完成的" />}
        </div>
      );
    case 'addSubtask':
      return (
        <div className="space-y-1">
          <Row label="操作" value="添加子任务" />
          <Row label="父任务" value={data.parentTitle} />
          <Row label="子任务" value={data.subtaskTitle} />
        </div>
      );
    case 'batchDelete':
    case 'batchComplete':
    case 'batchUpdateDate':
      return (
        <div className="space-y-1">
          <Row
            label="操作"
            value={
              preview.type === 'batchDelete'
                ? '批量删除'
                : preview.type === 'batchComplete'
                  ? '批量完成'
                  : '批量改日期'
            }
          />
          <Row label="影响" value={`${preview.affectedCount ?? 0} 个任务`} />
          {preview.type === 'batchUpdateDate' && (
            <Row label="新日期" value={preview.newDate ? fmtDate(preview.newDate) : ''} />
          )}
          {titles.length > 0 && (
            <div className="pt-0.5 text-[11.5px] leading-5 text-ink-soft">
              匹配：{titles.join('、')}
              {(preview.affectedCount ?? 0) > titles.length && ` … 还有 ${(preview.affectedCount ?? 0) - titles.length} 个`}
            </div>
          )}
        </div>
      );
    case 'projectPlan':
      return (
        <div className="space-y-1.5">
          <Row label="操作" value="建项目计划" />
          <Row label="项目" value={preview.title} />
          <Row label="规模" value={`${preview.phases?.length ?? 0} 个阶段 / ${preview.taskCount ?? 0} 个任务`} />
          <div className="max-h-40 space-y-1.5 overflow-y-auto pt-0.5">
            {(preview.phases || []).map((ph, i) => (
              <div key={i}>
                <p className="text-[11.5px] font-medium text-ink-mid">{ph.name}</p>
                <ul className="mt-0.5 space-y-0.5 pl-3">
                  {ph.tasks.map((t, j) => (
                    <li key={j} className="text-[11.5px] leading-5 text-ink-soft">
                      · {t.title}
                      <span className="text-ink-faint"> {t.date} {t.time}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      );
    default:
      return <p className="text-[12px] text-ink-soft">AI 准备执行一个操作。</p>;
  }
}

export default function AiChat() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [clarify, setClarify] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState<{ confirmId: string; reply: string; preview: AiActionPreview } | null>(
    null
  );

  const loadedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 自动滚到底
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking, open, clarify]);

  // 打开时加载历史（只拉一次，和旧版一致）
  useEffect(() => {
    if (!open || loadedRef.current) return;
    loadedRef.current = true;
    api
      .getAiHistory()
      .then((r) => {
        if (r.history?.length) setMessages(r.history.map((h) => ({ role: h.role, message: h.message })));
      })
      .catch(() => {
        /* 历史加载失败不影响聊天 */
      });
    setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  // Esc：先关确认框，再关面板
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (pending) cancelAction();
      else if (open) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const push = (role: AiMessage['role'], message: string) =>
    setMessages((prev) => [...prev, { role, message }]);

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || thinking) return;

    setInput('');
    setClarify([]);
    push('user', message);
    setThinking(true);

    // 传给后端的历史 = 最近 40 条（旧版同口径）
    const history = [...messages, { role: 'user' as const, message }].slice(-40);

    try {
      const data = await api.aiChat(message, history);
      setThinking(false);
      push('assistant', data.reply);

      // 本地记忆（保留最近 40 条）
      setMessages((prev) => prev.slice(-40));

      // 落库，PC / 移动端共享
      api.saveAiHistory([{ role: 'user', message }, { role: 'assistant', message: data.reply }]).catch(() => {});

      if (data.needsConfirm && data.confirmId && data.actionPreview) {
        setPending({ confirmId: data.confirmId, reply: data.reply, preview: data.actionPreview });
      } else if (data.needsClarify && data.clarifyOptions?.length) {
        setClarify(data.clarifyOptions);
      }
    } catch {
      setThinking(false);
      push('assistant', '抱歉，网络似乎有问题，请重试 😅');
    }
  }

  async function confirmAction() {
    if (!pending || confirming) return;
    setConfirming(true);
    try {
      const data = await api.aiConfirm(pending.confirmId);
      setPending(null);
      push('assistant', data.reply);

      if (data.success && data.actionExecuted) {
        // 旧版是「改完重新加载全部视图」，这里等价地失效所有查询
        queryClient.invalidateQueries();

        // 把结果直接摆到眼前：有日期且不是今天，就跳过去
        const d = pending.preview.data?.date;
        if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d !== todayStr()) {
          navigate(`/?date=${d}`);
        }
      }
    } catch {
      setPending(null);
      push('assistant', '操作失败，请重试。');
    } finally {
      setConfirming(false);
    }
  }

  function cancelAction() {
    if (!pending) return;
    // 通知服务端释放 pending（后端防 30 分钟 TTL 内重放）
    api.aiCancel(pending.confirmId).catch(() => {});
    setPending(null);
    push('assistant', '已取消操作。');
  }

  async function clearHistory() {
    if (!window.confirm('清空全部对话记录？服务端最近 7 天的记录也会一起删除。')) return;
    try {
      await api.clearAiHistory();
    } catch {
      /* 忽略，本地照清 */
    }
    setMessages([]);
    setClarify([]);
  }

  return (
    <>
      {/* ── 浮动入口 ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? '收起助手' : 'AI 助手'}
        aria-label="AI 助手"
        className={`fixed bottom-6 right-6 z-30 flex h-12 w-12 items-center justify-center rounded-2xl shadow-pop transition-all ${
          open ? 'bg-white text-ink-mid ring-1 ring-line' : 'bg-moss-deep text-white hover:bg-moss'
        }`}
      >
        {open ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.5 9.5 0 0 1-2.8-.4L4 21l1.3-3.7A8.2 8.2 0 0 1 3.5 11.5a8.4 8.4 0 0 1 9-8.4 8.4 8.4 0 0 1 8.5 8.4z" />
            <circle cx="8.8" cy="11.6" r="0.9" fill="currentColor" stroke="none" />
            <circle cx="12" cy="11.6" r="0.9" fill="currentColor" stroke="none" />
            <circle cx="15.2" cy="11.6" r="0.9" fill="currentColor" stroke="none" />
          </svg>
        )}
      </button>

      {/* ── 聊天面板 ── */}
      {open && (
        <div className="fixed bottom-[76px] right-6 z-30 flex h-[min(560px,calc(100vh-140px))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-pop">
          {/* 头部 */}
          <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-2.5">
            <span className="relative flex h-7 w-7 flex-none items-center justify-center rounded-full bg-moss-soft text-[11px] font-semibold text-moss">
              志
              <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-card bg-moss" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold leading-tight text-ink">小日志</p>
              <p className="text-[10.5px] leading-tight text-ink-soft">日程助手 · 在线</p>
            </div>
            <button
              onClick={clearHistory}
              title="清空对话记录"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-paper-deep hover:text-ink-mid"
              aria-label="清空对话记录"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13" />
              </svg>
            </button>
            <button
              onClick={() => setOpen(false)}
              title="收起"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-paper-deep hover:text-ink-mid"
              aria-label="收起助手"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {/* 消息区 */}
          <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3">
            {messages.length === 0 && !thinking && (
              <div className="px-1 py-5 text-center">
                <p className="text-[12px] leading-6 text-ink-soft">
                  我是小日志，可以帮你建任务、改时间、总结今天
                  <br />
                  也可以直接问「这周完成了多少」
                </p>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[12.5px] leading-[1.65] ${
                    m.role === 'user'
                      ? 'rounded-br-md bg-moss-deep text-white'
                      : 'rounded-bl-md bg-paper-deep text-ink'
                  }`}
                >
                  {m.message}
                </div>
              </div>
            ))}

            {thinking && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-paper-deep px-3 py-2.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="ai-dot h-1.5 w-1.5 rounded-full bg-ink-soft"
                      style={{ animationDelay: `${i * 0.14}s` }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 后端判定「不太确定」时给的可点选项 */}
            {clarify.length > 0 && !thinking && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {clarify.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => send(c)}
                    className="rounded-full border border-moss/30 bg-moss-soft px-2.5 py-1 text-[11.5px] text-moss transition-colors hover:bg-moss/15"
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 快捷操作 */}
          <div className="flex gap-1.5 overflow-x-auto border-t border-line-soft px-3 py-2">
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.label}
                onClick={() => send(a.prompt)}
                disabled={thinking}
                className="flex-none rounded-full border border-line bg-white px-2.5 py-1 text-[11.5px] text-ink-mid transition-colors hover:border-moss/30 hover:bg-moss-soft hover:text-moss disabled:opacity-40"
              >
                {a.label}
              </button>
            ))}
          </div>

          {/* 输入区 */}
          <div className="border-t border-line p-2.5">
            <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-2.5 py-1.5 transition-colors focus-within:border-moss/40">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="说点什么，比如「明天3点写周报」"
                className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-faint"
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || thinking}
                aria-label="发送"
                className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-moss-deep text-white transition-colors hover:bg-moss disabled:opacity-30"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4.5 12h14M13 6.5l5.5 5.5L13 17.5" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 确认弹窗（有写操作才会出现）── */}
      {pending && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/25 px-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) cancelAction();
          }}
        >
          <div className="w-[360px] max-w-full max-h-[80vh] overflow-y-auto rounded-2xl border border-line bg-card p-4 shadow-pop">
            <div className="mb-2.5 flex items-center gap-2.5">
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-clay-soft text-clay">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 8.5v5M12 16.8v.2" />
                  <path d="M10.3 3.9L2.7 17a1.4 1.4 0 0 0 1.2 2.1h16.2a1.4 1.4 0 0 0 1.2-2.1L13.7 3.9a1.4 1.4 0 0 0-2.4 0z" />
                </svg>
              </span>
              <h3 className="text-[13.5px] font-semibold text-ink">确认操作</h3>
            </div>

            <p className="mb-2.5 whitespace-pre-wrap text-[12.5px] leading-[1.65] text-ink-mid">{pending.reply}</p>

            <div className="mb-3.5 rounded-xl bg-paper-deep px-3 py-2.5 text-[12px] leading-6">
              <PreviewDetails preview={pending.preview} />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={cancelAction}
                disabled={confirming}
                className="rounded-lg border border-line px-3.5 py-1.5 text-[12.5px] text-ink-mid transition-colors hover:bg-paper-deep disabled:opacity-40"
              >
                取消
              </button>
              <button
                onClick={confirmAction}
                disabled={confirming}
                className="rounded-lg bg-moss-deep px-3.5 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-moss disabled:opacity-40"
              >
                {confirming ? '执行中…' : '确认'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

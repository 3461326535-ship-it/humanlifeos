import { useState, useRef, useEffect } from 'react';
import { SketchIcon } from '@/components/icons/SketchIcon';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { API_BASE } from '@/config';
import { authFetch } from '@/lib/taskMapping';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

const CHAT_STORAGE_KEY = 'ai-chat-messages';
const MAX_HISTORY_DAYS = 7;

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

interface PendingAction {
  confirmId: string;
  type: string;
  title: string;
}

function serializeMessages(msgs: Message[]): string {
  return JSON.stringify(msgs.map(m => ({
    ...m,
    timestamp: m.timestamp.getTime(),
  })));
}

function deserializeMessages(raw: string): Message[] {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const cutoff = Date.now() - MAX_HISTORY_DAYS * 24 * 60 * 60 * 1000;
    return arr
      .filter((m: any) => m.id && typeof m.content === 'string' && m.timestamp > cutoff)
      .map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
  } catch {
    return [];
  }
}

function loadCachedMessages(): Message[] {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return [];
    return deserializeMessages(raw);
  } catch {
    return [];
  }
}

function saveCachedMessages(msgs: Message[]) {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, serializeMessages(msgs));
  } catch {
    // localStorage full or unavailable
  }
}

async function loadServerHistory(): Promise<Message[]> {
  try {
    const res = await authFetch(`${API_BASE}/ai/history`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.history || !Array.isArray(data.history)) return [];
    return data.history.map((h: { role: string; message: string; createdAt?: string }, idx: number) => ({
      id: `srv-${idx}`,
      content: h.message,
      isUser: h.role === 'user',
      timestamp: h.createdAt ? new Date(h.createdAt) : new Date(Date.now() - (data.history.length - idx) * 1000),
    }));
  } catch {
    return [];
  }
}

async function saveToServer(userMsg: string, aiMsg: string) {
  try {
    await authFetch(`${API_BASE}/ai/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'user', message: userMsg },
          { role: 'assistant', message: aiMsg },
        ],
      }),
    });
  } catch (e) {
    console.error('[Sync] 保存失败:', e);
  }
}

const WELCOME_MSG: Message = {
  id: 'welcome',
  content: '你好！我是小日志，可以帮你创建、修改、删除任务，也可以总结和分析你的日程～',
  isUser: false,
  timestamp: new Date(),
};

export default function AIChatPage() {
  const [messages, setMessages] = useState<Message[]>(() => {
    const cached = loadCachedMessages();
    if (cached.length === 0) return [WELCOME_MSG];
    return cached;
  });
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [clarifyOptions, setClarifyOptions] = useState<{ label: string; value: string }[] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<{ role: string; message: string }[]>([]);
  const confirmingRef = useRef(false);
  const initialLoadDone = useRef(false);

  const isOnline = useNetworkStatus();
  const isLoggedIn = !!localStorage.getItem('auth_token');

  useEffect(() => {
    if (!isLoggedIn || !isOnline) return;
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    (async () => {
      const serverMsgs = await loadServerHistory();
      if (serverMsgs.length > 0) {
        const localMsgs = loadCachedMessages().filter(m => m.id !== 'welcome');
        const localKeys = new Set(localMsgs.map(m => `${m.isUser ? 'u' : 'a'}:${m.content}`));
        const newFromServer = serverMsgs.filter(m =>
          !localKeys.has(`${m.isUser ? 'u' : 'a'}:${m.content}`)
        );
        const merged = [WELCOME_MSG, ...localMsgs, ...newFromServer]
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        setMessages(merged);
        saveCachedMessages(merged);

        const ctx: { role: string; message: string }[] = [];
        merged.slice(-20).forEach(m => {
          if (m.id === 'welcome') return;
          ctx.push({ role: m.isUser ? 'user' : 'assistant', message: m.content });
        });
        historyRef.current = ctx;
      } else {
        const cached = loadCachedMessages();
        if (cached.length > 1) {
          const ctx: { role: string; message: string }[] = [];
          cached.slice(-20).forEach(m => {
            if (m.id === 'welcome') return;
            ctx.push({ role: m.isUser ? 'user' : 'assistant', message: m.content });
          });
          historyRef.current = ctx;
        }
      }
    })();
  }, []);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  useEffect(() => {
    saveCachedMessages(messages);
  }, [messages]);

  useEffect(() => {
    const handler = () => {
      const cached = loadCachedMessages();
      if (cached.length > 0) setMessages(cached);
    };
    const handleAuthChanged = () => {
      const cached = loadCachedMessages();
      if (cached.length === 0) {
        setMessages([WELCOME_MSG]);
        historyRef.current = [];
      } else {
        setMessages(cached);
      }
      initialLoadDone.current = false;
    };
    window.addEventListener('chat-updated', handler);
    window.addEventListener('auth-changed', handleAuthChanged);
    handler();
    return () => {
      window.removeEventListener('chat-updated', handler);
      window.removeEventListener('auth-changed', handleAuthChanged);
    };
  }, []);

  const clearHistory = () => {
    setMessages([WELCOME_MSG]);
    historyRef.current = [];
    saveCachedMessages([WELCOME_MSG]);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      content: input.trim(),
      isUser: true,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const res = await authFetch(`${API_BASE}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg.content,
          history: historyRef.current.slice(-10),
        }),
      });

      if (!res.ok) {
        let detail = '';
        try { const body = await res.json(); detail = body?.message || ''; } catch { /* ignore */ }
        throw new Error(detail || `HTTP ${res.status}`);
      }
      const data = await res.json();

      historyRef.current.push({ role: 'user', message: userMsg.content });
      historyRef.current.push({ role: 'assistant', message: data.reply || '' });

      saveToServer(userMsg.content, data.reply || '');

      const aiMsg: Message = {
        id: `msg-${Date.now() + 1}`,
        content: data.reply || '好的，我了解了～',
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMsg]);

      if (data.needsConfirm && data.confirmId && data.actionPreview) {
        const typeMap: Record<string, string> = {
          create: '创建任务', update: '修改任务', delete: '删除任务', addSubtask: '添加子任务',
        };
        setPendingAction({
          confirmId: data.confirmId,
          type: typeMap[data.actionPreview.type] || data.actionPreview.type,
          title: data.actionPreview.data?.title || data.reply,
        });
      }

      if (data.needsClarify && data.clarifyOptions) {
        setClarifyOptions(data.clarifyOptions);
      }
    } catch (err) {
      console.error('AI 请求失败:', err);
      const hint = err instanceof Error && err.message && !err.message.startsWith('HTTP ')
        ? err.message
        : '抱歉，我现在无法处理你的请求，请稍后再试 😕';
      const aiMsg: Message = {
        id: `msg-${Date.now() + 1}`,
        content: hint,
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleConfirm = async () => {
    if (!pendingAction || confirmingRef.current) return;
    confirmingRef.current = true;
    const action = pendingAction;
    setPendingAction(null);

    try {
      const res = await authFetch(`${API_BASE}/ai/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmId: action.confirmId }),
      });
      const data = await res.json();

      const reply = data.reply || (data.success ? '✅ 操作完成' : '❌ 操作失败');
      const aiMsg: Message = {
        id: `msg-${Date.now()}`,
        content: reply,
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMsg]);
      saveToServer('确认执行：' + action.title, reply);
      if (data.success) window.dispatchEvent(new Event('tasks-changed'));
    } catch (err) {
      console.error('确认操作失败:', err);
    } finally {
      confirmingRef.current = false;
    }
  };

  const handleCancel = () => {
    if (confirmingRef.current) return;
    if (!pendingAction && !clarifyOptions) return;
    const action = pendingAction;
    setPendingAction(null);
    setClarifyOptions(null);
    const reply = '好的，已取消该操作。';
    const aiMsg: Message = {
      id: `msg-${Date.now()}`,
      content: reply,
      isUser: false,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, aiMsg]);
    const actionTitle = action?.title || (clarifyOptions ? '选择意图' : '操作');
    saveToServer('取消：' + actionTitle, reply);
  };

  const handleClarifyOption = (value: string) => {
    setClarifyOptions(null);
    setInput(value);
    setTimeout(() => {
      const syntheticSend = async () => {
        const userMsg: Message = {
          id: `msg-${Date.now()}`,
          content: value,
          isUser: true,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, userMsg]);
        setIsTyping(true);

        try {
          const res = await authFetch(`${API_BASE}/ai/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: value, history: historyRef.current.slice(-10) }),
          });
          if (!res.ok) {
        let detail = '';
        try { const body = await res.json(); detail = body?.message || ''; } catch { /* ignore */ }
        throw new Error(detail || `HTTP ${res.status}`);
      }
          const data = await res.json();
          historyRef.current.push({ role: 'user', message: value });
          historyRef.current.push({ role: 'assistant', message: data.reply || '' });
          const aiMsg: Message = {
            id: `msg-${Date.now() + 1}`,
            content: data.reply || '好的，我了解了～',
            isUser: false,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, aiMsg]);
          if (data.needsConfirm && data.confirmId && data.actionPreview) {
            const typeMap: Record<string, string> = {
              create: '创建任务', update: '修改任务', delete: '删除任务', addSubtask: '添加子任务',
            };
            setPendingAction({
              confirmId: data.confirmId,
              type: typeMap[data.actionPreview.type] || data.actionPreview.type,
              title: data.actionPreview.data?.title || data.reply,
            });
          }
          if (data.needsClarify && data.clarifyOptions) {
            setClarifyOptions(data.clarifyOptions);
          }
        } catch (err) {
          console.error('AI 请求失败:', err);
        } finally {
          setIsTyping(false);
        }
      };
      syntheticSend();
    }, 50);
  };

  const formatTime = (d: Date) => {
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const shouldShowTime = (index: number) => {
    if (index === 0) return true;
    const prev = messages[index - 1];
    const curr = messages[index];
    const diff = curr.timestamp.getTime() - prev.timestamp.getTime();
    return diff > 5 * 60 * 1000;
  };

  const quickActions = [
    ['新建', '+'],
    ['今天', 'sun'],
    ['完成', 'check'],
    ['效率', 'chart'],
    ['明天', 'arrow-right'],
    ['搜索', 'search'],
  ];

  return (
    <div className="flex flex-col h-full" style={{
      backgroundColor: 'var(--bg-primary)',
      backgroundImage: 'radial-gradient(#E2D6B8 1px, transparent 1.4px)',
      backgroundSize: '15px 15px',
    }}>
      {/* Not logged in */}
      {!isLoggedIn ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-16 h-16 rounded-full bg-[var(--lav)]/10 flex items-center justify-center mb-4 sketch-wobble-sm border-2 border-[var(--ink)]">
            <SketchIcon name="login" size={28} strokeWidth={2} className="text-[var(--lav)]" />
          </div>
          <p className="font-head text-[16px] text-[var(--ink)] mb-1">请先登录</p>
          <p className="text-[13px] text-[var(--ink-soft)] text-center font-body">
            AI 助手需要登录后才能使用{'\n'}请前往「我的」页面登录
          </p>
        </div>
      ) : !isOnline ? (
        /* Offline */
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-16 h-16 rounded-full bg-[var(--ink-soft)]/10 flex items-center justify-center mb-4 sketch-wobble-sm border-2 border-[var(--ink)]">
            <SketchIcon name="wifi-off" size={28} strokeWidth={2} className="text-[var(--ink-soft)]" />
          </div>
          <p className="font-head text-[16px] text-[var(--ink)] mb-1">网络不可用</p>
          <p className="text-[13px] text-[var(--ink-soft)] text-center font-body">
            AI 助手需要联网才能使用{'\n'}请检查网络连接后重试
          </p>
          {messages.length > 1 && (
            <p className="text-[11px] text-[var(--ink-soft)] mt-4 font-caveat">
              已缓存 {messages.length - 1} 条历史消息
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="sketch-ai-head shrink-0 z-10">
            <div className="sketch-ai-ava">
              <SketchIcon name="sparkle" size={20} strokeWidth={2} stroke="white" />
            </div>
            <div>
              <div className="font-head text-[16px] text-[var(--ink)]">小日志</div>
              <div className="font-caveat text-[13px] text-[var(--teal)] font-bold">在线 · 随时帮你记</div>
            </div>
            <div className="flex-1" />
            <button
              onClick={clearHistory}
              className="text-[11px] text-[var(--ink-soft)] active:text-[var(--red)] transition-colors font-head px-2"
            >
              清空
            </button>
            {isTyping && (
              <span className="absolute bottom-0 right-4 text-[12px] text-[var(--ink-soft)] font-caveat">
                对方正在输入...
              </span>
            )}
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar px-[16px] py-[16px]">
            <div className="flex flex-col gap-[14px]">
              {messages.map((msg, idx) => (
                <div key={msg.id}>
                  {shouldShowTime(idx) && (
                    <div className="flex justify-center my-3">
                      <span className="text-[11px] text-[var(--ink-soft)] bg-[var(--fill-quaternary)] px-2 py-0.5 rounded-full font-caveat">
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                  )}

                  <div className={`flex items-start gap-[9px] max-w-[86%] ${msg.isUser ? 'ml-auto flex-row-reverse' : ''}`}>
                    <div className={`w-[30px] h-[30px] rounded-[11px] flex items-center justify-center shrink-0 border-2 border-[var(--ink)] sketch-wobble-sm ${
                      msg.isUser ? 'bg-[#E5DFD0]' : 'bg-[var(--lav)]'
                    }`}>
                      {msg.isUser ? (
                        <span className="font-head text-[14px] text-[var(--ink)]">A</span>
                      ) : (
                        <SketchIcon name="sparkle" size={16} strokeWidth={2} stroke="white" />
                      )}
                    </div>

                    <div
                      className={`sketch-bubble ${msg.isUser ? 'sketch-bubble-me' : ''} max-w-full`}
                    >
                      {msg.content}
                    </div>
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              <AnimatePresence>
                {isTyping && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="flex items-start gap-[9px] max-w-[86%]"
                  >
                    <div className="w-[30px] h-[30px] rounded-[11px] bg-[var(--lav)] flex items-center justify-center shrink-0 border-2 border-[var(--ink)] sketch-wobble-sm">
                      <SketchIcon name="sparkle" size={16} strokeWidth={2} stroke="white" />
                    </div>
                    <div className="sketch-bubble flex items-center gap-1">
                      {[0, 0.2, 0.4].map((delay, i) => (
                        <motion.div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-[var(--ink-soft)]"
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ repeat: Infinity, duration: 1, delay }}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="shrink-0 bg-[var(--bg-card)] border-t-2 border-dashed border-[var(--ink-soft)] px-[14px] pt-[11px] pb-[10px]">
            <div className="flex gap-[8px] overflow-x-auto no-scrollbar">
              {quickActions.map(([label, icon]) => (
                <button
                  key={label}
                  onClick={() => {
                    const prompts: Record<string, string> = {
                      '新建': '帮我创建一个新任务',
                      '今天': '列出今天所有日程',
                      '完成': '今天还有哪些任务没完成',
                      '效率': '帮我统计各分类任务的完成率',
                      '明天': '列出明天所有日程',
                      '搜索': '帮我搜索任务',
                    };
                    setInput(prompts[label] || '');
                    setTimeout(() => handleSend(), 50);
                  }}
                  className="sketch-chip flex items-center gap-[5px]"
                >
                  <SketchIcon name={icon} size={15} strokeWidth={2.6} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="shrink-0 px-[14px] pb-[16px] pt-[10px] bg-[var(--bg-card)]">
            <div className="sketch-input-pill">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="说点什么，或点上面的快捷指令…"
                className="flex-1 bg-transparent border-0 text-[13px] text-[var(--ink)] placeholder:text-[var(--ink-soft)] outline-none font-body"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="w-[36px] h-[36px] rounded-full bg-[var(--red)] text-white flex items-center justify-center flex-none border-2 border-[var(--ink)] sketch-wobble-sm disabled:opacity-40 active:scale-95 transition-all"
              >
                <SketchIcon name="arrow-right" size={16} strokeWidth={3} stroke="white" />
              </button>
            </div>
          </div>

          {/* Confirm Dialog */}
          <AlertDialog open={!!pendingAction} onOpenChange={(open) => {
            if (!open && !confirmingRef.current) handleCancel();
          }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认操作</AlertDialogTitle>
                <AlertDialogDescription>
                  {pendingAction?.type && (
                    <span className="inline-block bg-primary/10 text-primary px-2 py-0.5 rounded text-xs mb-2 font-head">
                      {pendingAction.type}
                    </span>
                  )}
                  <p className="mt-1 text-sm text-neutral-600">{pendingAction?.title}</p>
                  <p className="mt-2 text-xs text-neutral-400">确认执行此操作吗？</p>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={handleCancel}>取消</AlertDialogCancel>
                <AlertDialogAction onClick={handleConfirm}>确认</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Clarify Options */}
          <AnimatePresence>
            {clarifyOptions && clarifyOptions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute bottom-[72px] left-3 right-3 z-50 bg-[var(--bg-card)] rounded-xl shadow-lg border-2 border-[var(--ink)] sketch-wobble-sm p-3"
              >
                <p className="text-[13px] text-[var(--ink-soft)] mb-2 font-body">请选择你的意图：</p>
                <div className="flex flex-wrap gap-2">
                  {clarifyOptions.map((opt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleClarifyOption(opt.value)}
                      className="sketch-chip on"
                    >
                      {opt.label}
                    </button>
                  ))}
                  <button
                    onClick={() => { setClarifyOptions(null); }}
                    className="sketch-chip"
                  >
                    都不是
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

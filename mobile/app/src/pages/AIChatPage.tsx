import { useState, useRef, useEffect } from 'react';
import { User, Bot, LogIn, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { API_BASE } from '@/config';
import { authFetch } from '@/lib/taskMapping';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

const CHAT_STORAGE_KEY = 'ai-chat-messages';
const MAX_HISTORY_DAYS = 7; // 保留最近 7 天的聊天记录

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

// ── 持久化工具（localStorage 作为离线缓存）──

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
    // localStorage full or unavailable — silently skip
  }
}

// ── 服务端同步工具（PC/移动端共享）──

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
      // 优先使用服务端时间戳，没有则用递减值保证顺序正确
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
    // 先展示本地缓存（无延迟），稍后服务端数据到达后合并
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

  // ── 登录 + 网络检测 ──
  const isOnline = useNetworkStatus();
  const isLoggedIn = !!localStorage.getItem('auth_token');

  // ── 启动时从服务端加载历史（PC/移动端同步）──
  // 只有登录且在线时才尝试加载服务器历史
  useEffect(() => {
    if (!isLoggedIn || !isOnline) return;
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    (async () => {
      const serverMsgs = await loadServerHistory();
      if (serverMsgs.length > 0) {
        // 合并本地 & 服务端消息：用内容+角色去重，本地时间戳优先
        const localMsgs = loadCachedMessages().filter(m => m.id !== 'welcome');
        const localKeys = new Set(localMsgs.map(m => `${m.isUser ? 'u' : 'a'}:${m.content}`));
        const newFromServer = serverMsgs.filter(m =>
          !localKeys.has(`${m.isUser ? 'u' : 'a'}:${m.content}`)
        );
        const merged = [WELCOME_MSG, ...localMsgs, ...newFromServer]
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        setMessages(merged);
        saveCachedMessages(merged);

        // 重建 AI 上下文（用合并后的消息，保留最多20条）
        const ctx: { role: string; message: string }[] = [];
        merged.slice(-20).forEach(m => {
          if (m.id === 'welcome') return;
          ctx.push({ role: m.isUser ? 'user' : 'assistant', message: m.content });
        });
        historyRef.current = ctx;
      } else {
        // 服务端无数据，用本地缓存重建上下文
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

  // ── 持久化：消息变化时写入 localStorage 缓存 ──
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  useEffect(() => {
    saveCachedMessages(messages);
  }, [messages]);

  // ── 监听外部消息更新（日报/周报通过 saveReportToChat 写入时触发）──
  useEffect(() => {
    const handler = () => {
      const cached = loadCachedMessages();
      if (cached.length > 0) {
        setMessages(cached);
      }
    };
    // 账号切换/登出时：重置聊天为欢迎消息
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
    // 切换到此 tab 时也刷新（确保 App.tsx 通知点击后能同步）
    handler();
    return () => {
      window.removeEventListener('chat-updated', handler);
      window.removeEventListener('auth-changed', handleAuthChanged);
    };
  }, []);

  // 清空聊天记录
  const clearHistory = () => {
    setMessages([WELCOME_MSG]);
    historyRef.current = [];
    saveCachedMessages([WELCOME_MSG]);
  };

  // Auto scroll
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

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // 更新对话历史
      historyRef.current.push({ role: 'user', message: userMsg.content });
      historyRef.current.push({ role: 'assistant', message: data.reply || '' });

      // 同步保存到服务端（PC/移动端共享）
      saveToServer(userMsg.content, data.reply || '');

      // 添加 AI 回复
      const aiMsg: Message = {
        id: `msg-${Date.now() + 1}`,
        content: data.reply || '好的，我了解了～',
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMsg]);

      // 如果需要确认，弹出确认框
      if (data.needsConfirm && data.confirmId && data.actionPreview) {
        const typeMap: Record<string, string> = {
          create: '创建任务',
          update: '修改任务',
          delete: '删除任务',
          addSubtask: '添加子任务',
        };
        setPendingAction({
          confirmId: data.confirmId,
          type: typeMap[data.actionPreview.type] || data.actionPreview.type,
          title: data.actionPreview.data?.title || data.reply,
        });
      }

      // 如果 AI 需要澄清（clarify），显示选项按钮
      if (data.needsClarify && data.clarifyOptions) {
        setClarifyOptions(data.clarifyOptions);
      }
    } catch (err) {
      console.error('AI 请求失败:', err);
      const aiMsg: Message = {
        id: `msg-${Date.now() + 1}`,
        content: '抱歉，我现在无法处理你的请求，请稍后再试 😕',
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  // 确认操作
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

      // 同步到服务端，避免刷新后消失
      saveToServer('确认执行：' + action.title, reply);

      // 通知任务列表刷新
      if (data.success) {
        window.dispatchEvent(new Event('tasks-changed'));
      }
    } catch (err) {
      console.error('确认操作失败:', err);
    } finally {
      confirmingRef.current = false;
    }
  };

  // 取消操作
  const handleCancel = () => {
    if (confirmingRef.current) return; // 防止确认时触发取消（修复双重消息）
    if (!pendingAction && !clarifyOptions) return;
    const action = pendingAction; // 先保存引用
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
    // 同步到服务端，避免刷新后消失
    const actionTitle = action?.title || (clarifyOptions ? '选择意图' : '操作');
    saveToServer('取消：' + actionTitle, reply);
  };

  // Clarify option selected — send as follow-up message
  const handleClarifyOption = (value: string) => {
    setClarifyOptions(null);
    setInput(value);
    // Trigger send with the selected value
    setTimeout(() => {
      if (inputRef.current) {
        // We use a synthetic approach — directly call send with this value
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
              body: JSON.stringify({
                message: value,
                history: historyRef.current.slice(-10),
              }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      }
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

  return (
    <div className="flex flex-col h-full bg-[#EDEDED]">
      {/* ── 未登录提示 ── */}
      {!isLoggedIn ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-16 h-16 rounded-full bg-[var(--primary-blue)]/10 flex items-center justify-center mb-4">
            <LogIn size={28} className="text-[var(--primary-blue)]" />
          </div>
          <p className="text-[16px] font-semibold text-[var(--text-primary)] mb-1">请先登录</p>
          <p className="text-[13px] text-[var(--text-tertiary)] text-center">
            AI 助手需要登录后才能使用{'\n'}请前往「我的」页面登录
          </p>
        </div>
      ) : !isOnline ? (
        /* ── 离线提示 ── */
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-16 h-16 rounded-full bg-[var(--text-tertiary)]/10 flex items-center justify-center mb-4">
            <WifiOff size={28} className="text-[var(--text-tertiary)]" />
          </div>
          <p className="text-[16px] font-semibold text-[var(--text-primary)] mb-1">网络不可用</p>
          <p className="text-[13px] text-[var(--text-tertiary)] text-center">
            AI 助手需要联网才能使用{'\n'}请检查网络连接后重试
          </p>
          {/* 本地缓存的聊天历史仍可查看 */}
          {messages.length > 1 && (
            <p className="text-[11px] text-[var(--text-tertiary)] mt-4">
              已缓存 {messages.length - 1} 条历史消息
            </p>
          )}
        </div>
      ) : (
        <>
      {/* Header */}
      <div className="shrink-0 bg-[#EDEDED] border-b border-[#D6D6D6] px-4 py-2.5 flex items-center justify-between relative z-10">
        <div className="w-12" />
        <span className="text-[16px] font-semibold text-[#1C1C1E]">AI助手</span>
        <button
          onClick={clearHistory}
          className="w-12 text-[11px] text-[var(--text-tertiary)] active:text-[var(--red)] transition-colors"
        >
          清空
        </button>
        {isTyping && (
          <span className="absolute bottom-0 right-4 text-[12px] text-[var(--text-tertiary)]">
            对方正在输入...
          </span>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar px-3 py-3">
        <div className="space-y-1">
          {messages.map((msg, idx) => (
            <div key={msg.id}>
              {shouldShowTime(idx) && (
                <div className="flex justify-center my-3">
                  <span className="text-[11px] text-[#999] bg-[#DADADA] px-2 py-0.5 rounded">
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
              )}

              <div
                className={`flex items-start gap-2 mb-3 ${
                  msg.isUser ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    msg.isUser ? 'bg-[#95EC69]/30' : 'bg-[var(--primary-blue)]'
                  }`}
                >
                  {msg.isUser ? (
                    <User size={18} className="text-[#34C759]" />
                  ) : (
                    <Bot size={18} className="text-white" />
                  )}
                </div>

                <div className="max-w-[70%]">
                  <div
                    className={`relative px-3 py-2 text-[15px] leading-relaxed break-words whitespace-pre-wrap ${
                      msg.isUser
                        ? 'bg-[#95EC69] text-black rounded-[12px_4px_12px_12px]'
                        : 'bg-white text-black rounded-[4px_12px_12px_12px]'
                    }`}
                    style={{
                      boxShadow: msg.isUser
                        ? '0 1px 2px rgba(0,0,0,0.05)'
                        : '0 1px 2px rgba(0,0,0,0.08)',
                    }}
                  >
                    {msg.content}
                  </div>
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
                className="flex items-start gap-2 mb-3"
              >
                <div className="w-9 h-9 rounded-lg bg-[var(--primary-blue)] flex items-center justify-center shrink-0">
                  <Bot size={18} className="text-white" />
                </div>
                <div className="bg-white rounded-[4px_12px_12px_12px] px-3 py-2 flex items-center gap-1">
                  <motion.div
                    className="w-1.5 h-1.5 rounded-full bg-[#999]"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1, delay: 0 }}
                  />
                  <motion.div
                    className="w-1.5 h-1.5 rounded-full bg-[#999]"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                  />
                  <motion.div
                    className="w-1.5 h-1.5 rounded-full bg-[#999]"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="shrink-0 bg-[#F7F7F7] px-3 pt-2">
        <div className="grid grid-cols-3 gap-1.5">
          {[
            ['+ 新建任务', '帮我创建一个新任务'],
            ['📋 今天', '列出今天所有日程'],
            ['✅ 完成', '今天还有哪些任务没完成'],
            ['📊 效率', '帮我统计各分类任务的完成率'],
            ['⏰ 明天', '列出明天所有日程'],
            ['🔍 搜索', '帮我搜索任务'],
          ].map(([label, prompt]) => (
            <button
              key={label}
              onClick={() => {
                setInput(prompt);
                setTimeout(() => handleSend(), 50);
              }}
              className="py-1.5 px-2 text-[11px] font-medium text-[#666] bg-white rounded-lg border border-[#E5E5EA] active:bg-[#07C160]/10 active:text-[#07C160] active:border-[#07C160]/30 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 bg-[#F7F7F7] border-t border-[#E5E5E5] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="发消息..."
            className="flex-1 h-9 px-3 rounded bg-white border-0 text-[15px] text-[var(--text-primary)] placeholder:text-[#C7C7CC] outline-none"
            style={{ boxShadow: 'inset 0 0 0 0.5px #E5E5EA' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className={`h-9 px-4 rounded text-[14px] font-medium transition-all active:scale-95 ${
              input.trim()
                ? 'bg-[#07C160] text-white'
                : 'bg-[#E5E5EA] text-[#C7C7CC]'
            }`}
          >
            发送
          </button>
        </div>
      </div>

      {/* Confirm Dialog */}
      <AlertDialog open={!!pendingAction} onOpenChange={(open) => {
        // 只在关闭时触发取消，避免确认按钮自动关闭导致双重消息
        if (!open && !confirmingRef.current) handleCancel();
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认操作</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.type && (
                <span className="inline-block bg-primary/10 text-primary px-2 py-0.5 rounded text-xs mb-2">
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
            className="absolute bottom-[72px] left-3 right-3 z-50 bg-white rounded-xl shadow-lg border border-[var(--divider)] p-3"
          >
            <p className="text-[13px] text-[var(--text-secondary)] mb-2">请选择你的意图：</p>
            <div className="flex flex-wrap gap-2">
              {clarifyOptions.map((opt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleClarifyOption(opt.value)}
                  className="px-3 py-1.5 rounded-full bg-[var(--primary-blue)]/10 text-[var(--primary-blue)] text-[13px] font-medium active:scale-95 transition-all"
                >
                  {opt.label}
                </button>
              ))}
              <button
                onClick={() => { setClarifyOptions(null); }}
                className="px-3 py-1.5 rounded-full bg-gray-100 text-[var(--text-tertiary)] text-[13px] active:scale-95 transition-all"
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

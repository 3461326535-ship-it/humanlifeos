import { useState, useEffect } from 'react';
import {
  Upload,
  Download,
  FolderOpen,
  Bell,
  Info,
  ChevronRight,
  LogIn,
  LogOut,
  UserPlus,
  User,
  Wifi,
  WifiOff,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { motion } from 'framer-motion';
import CategoryManager from '@/components/CategoryManager';
import ReminderModal from '@/components/ReminderModal';
import AboutModal from '@/components/AboutModal';
import type { Category, SyncStatus } from '@/types';
import type { NotificationSettings } from '@/hooks/useNotifications';
import { API_BASE } from '@/config';

interface ProfilePageProps {
  categories: Category[];
  onAddCategory: (name: string) => void;
  onUpdateCategory: (id: string, name: string) => void;
  onDeleteCategory: (id: string) => void;
  onImport: () => void;
  onExport: () => void;
  onDownloadTemplate: () => void;
  notifySettings: NotificationSettings;
  notifyPermission: NotificationPermission;
  onUpdateNotifySetting: (key: 'taskStart' | 'dailySummary' | 'deadlineReminder' | 'weeklyReport') => void;
  onRequestNotifyPermission: () => void;
  onTestNotify: () => void;
  syncStatus: SyncStatus;
  onSyncNow: () => void;
}

// ── 同步状态文字组件 ──
function SyncStatusText({ status, onSyncNow }: { status: SyncStatus; onSyncNow: () => void }) {
  const state = status.state;
  const p = status.pendingCount;

  switch (state) {
    case 'synced':
      return (
        <span className="text-[12px] text-[var(--green)] flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)]" />
          已同步
        </span>
      );
    case 'syncing':
      return (
        <span className="text-[12px] text-[var(--primary-blue)] flex items-center gap-1">
          <RefreshCw size={11} className="animate-spin" />
          同步中...
        </span>
      );
    case 'pending':
      return (
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-[var(--yellow)] flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--yellow)]" />
            待同步 {p > 0 ? `(${p}项)` : ''}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onSyncNow(); }}
            className="text-[11px] text-[var(--primary-blue)] font-medium px-1.5 py-0.5 rounded bg-[var(--primary-blue)]/10 active:scale-95 transition-all"
          >
            立即同步
          </button>
        </div>
      );
    case 'failed':
      return (
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-[var(--red)] flex items-center gap-1">
            <AlertCircle size={11} />
            同步失败
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onSyncNow(); }}
            className="text-[11px] text-[var(--red)] font-medium px-1.5 py-0.5 rounded bg-red-50 active:scale-95 transition-all"
          >
            重试
          </button>
        </div>
      );
    case 'offline':
      return (
        <span className="text-[12px] text-[var(--text-tertiary)] flex items-center gap-1">
          <WifiOff size={11} />
          离线模式
        </span>
      );
    default:
      return (
        <span className="text-[12px] text-[var(--text-tertiary)] flex items-center gap-1">
          <Wifi size={11} />
          离线可用
        </span>
      );
  }
}

export default function ProfilePage({
  categories,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onImport,
  onExport,
  onDownloadTemplate,
  notifySettings,
  notifyPermission,
  onUpdateNotifySetting,
  onRequestNotifyPermission,
  onTestNotify,
  syncStatus,
  onSyncNow,
}: ProfilePageProps) {
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  // ── Auth state ──
  const [loggedIn, setLoggedIn] = useState(false);
  const [authUser, setAuthUser] = useState('');
  const [loginUser, setLoginUser] = useState('');
  const [loginPw, setLoginPw] = useState('');
  const [regUser, setRegUser] = useState('');
  const [regPw, setRegPw] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) checkAuth(token);
  }, []);

  async function checkAuth(token: string) {
    try {
      const res = await fetch(`${API_BASE}/auth/status`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setLoggedIn(true);
        setAuthUser(data.user.username);
      } else {
        localStorage.removeItem('auth_token');
      }
    } catch { /* offline */ }
  }

  // 带超时的 fetch（默认 15 秒）
  async function fetchWithTimeout(url: string, opts?: RequestInit, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: controller.signal });
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  async function handleLogin() {
    if (!loginPw) { setAuthError('请输入密码'); return; }
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetchWithTimeout(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUser || 'admin', password: loginPw }),
      });
      const data = await res.json();
      if (data.success) {
        // 切换账号前清除旧账号的所有本地缓存数据
        localStorage.removeItem('offline_tasks');
        localStorage.removeItem('offline_categories');
        localStorage.removeItem('offline_deleted_ids');
        localStorage.removeItem('ai-chat-messages');

        localStorage.setItem('auth_token', data.token);
        setLoggedIn(true);
        setAuthUser(data.user.username);
        setLoginPw('');
        setAuthError('');
        // 迁移访客数据并触发同步
        try {
          await fetchWithTimeout(`${API_BASE}/auth/migrate`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${data.token}` },
          });
        } catch { /* 迁移失败不阻塞 */ }
        // 通知各组件刷新数据（重新从服务器拉取新账号内容）
        window.dispatchEvent(new Event('tasks-changed'));
        window.dispatchEvent(new CustomEvent('chat-updated'));
        window.dispatchEvent(new CustomEvent('auth-changed'));
        onSyncNow();
      } else {
        setAuthError(data.message || '登录失败');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setAuthError('连接超时，请检查网络后重试');
      } else if (err?.message) {
        setAuthError(`网络错误: ${err.message}`);
      } else {
        setAuthError('网络错误，请检查网络连接');
      }
    }
    finally { setAuthLoading(false); }
  }

  async function handleRegister() {
    if (regUser.length < 2) { setAuthError('用户名至少2个字符'); return; }
    if (regPw.length < 6) { setAuthError('密码至少6位'); return; }
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetchWithTimeout(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: regUser, password: regPw }),
      });
      const data = await res.json();
      if (data.success) {
        // 切换账号前清除旧账号的所有本地缓存数据
        localStorage.removeItem('offline_tasks');
        localStorage.removeItem('offline_categories');
        localStorage.removeItem('offline_deleted_ids');
        localStorage.removeItem('ai-chat-messages');

        localStorage.setItem('auth_token', data.token);
        setLoggedIn(true);
        setAuthUser(data.user.username);
        setRegUser(''); setRegPw('');
        setAuthError('');
        // 通知各组件刷新数据（重新从服务器拉取新账号内容）
        window.dispatchEvent(new Event('tasks-changed'));
        window.dispatchEvent(new CustomEvent('chat-updated'));
        window.dispatchEvent(new CustomEvent('auth-changed'));
        onSyncNow();
      } else {
        setAuthError(data.message || '注册失败');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setAuthError('连接超时，请检查网络后重试');
      } else if (err?.message) {
        setAuthError(`网络错误: ${err.message}`);
      } else {
        setAuthError('网络错误，请检查网络连接');
      }
    }
    finally { setAuthLoading(false); }
  }

  function handleLogout() {
    // 1. 通知服务端清除聊天历史（best-effort，不阻塞登出）
    const token = localStorage.getItem('auth_token');
    if (token) {
      fetch(`${API_BASE}/ai/history`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => { /* 静默失败 */ });
    }

    // 2. 清除所有本地数据，防止数据泄露
    localStorage.removeItem('auth_token');
    localStorage.removeItem('offline_tasks');
    localStorage.removeItem('offline_categories');
    localStorage.removeItem('offline_deleted_ids');
    localStorage.removeItem('ai-chat-messages');

    // 3. 更新 UI 状态
    setLoggedIn(false);
    setAuthUser('');

    // 4. 通知各组件刷新（清空内存中的数据）
    window.dispatchEvent(new Event('tasks-changed'));
    window.dispatchEvent(new CustomEvent('chat-updated'));
    window.dispatchEvent(new CustomEvent('auth-changed'));
  }

  return (
    <div className="flex flex-col h-full">
      <div className="content-scrollable px-4 pt-4 pb-6">
        {/* Page Title */}
        <motion.h1
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[28px] font-bold text-[var(--text-primary)] mb-6"
        >
          我的
        </motion.h1>

        {/* ── Auth Section ── */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl card-shadow overflow-hidden mb-6"
        >
          {loggedIn ? (
            /* 已登录：显示用户信息 + 同步状态 */
            <div className="p-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-[var(--primary-blue)] flex items-center justify-center shrink-0">
                  <User size={22} strokeWidth={2} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[16px] font-semibold text-[var(--text-primary)]">{authUser}</p>
                  <SyncStatusText status={syncStatus} onSyncNow={onSyncNow} />
                </div>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleLogout}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-[13px] text-[var(--red)] font-medium"
                >
                  <LogOut size={14} /> 退出
                </motion.button>
              </div>
            </div>
          ) : (
            /* 未登录：登录/注册 + 离线同步状态 */
            <div className="p-4">
              {/* 离线同步状态 */}
              <SyncStatusText status={syncStatus} onSyncNow={onSyncNow} />
              <div className="flex gap-1 mb-4 bg-[var(--fill-quaternary)] rounded-lg p-1">
                <button
                  onClick={() => { setAuthMode('login'); setAuthError(''); }}
                  className={`flex-1 py-2 rounded-md text-[14px] font-medium transition-all ${authMode === 'login' ? 'bg-white text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-tertiary)]'}`}
                >
                  <LogIn size={14} className="inline mr-1" /> 登录
                </button>
                <button
                  onClick={() => { setAuthMode('register'); setAuthError(''); }}
                  className={`flex-1 py-2 rounded-md text-[14px] font-medium transition-all ${authMode === 'register' ? 'bg-white text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-tertiary)]'}`}
                >
                  <UserPlus size={14} className="inline mr-1" /> 注册
                </button>
              </div>

              {authMode === 'login' ? (
                <div className="space-y-3">
                  <input
                    type="text" value={loginUser} onChange={e => setLoginUser(e.target.value)}
                    placeholder="用户名（默认 admin）" autoComplete="username"
                    className="w-full px-3 py-2.5 rounded-lg border border-[var(--divider)] text-[14px] bg-[var(--bg)] text-[var(--text-primary)] outline-none focus:border-[var(--primary-blue)]"
                  />
                  <input
                    type="password" value={loginPw} onChange={e => setLoginPw(e.target.value)}
                    placeholder="密码" autoComplete="current-password"
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    className="w-full px-3 py-2.5 rounded-lg border border-[var(--divider)] text-[14px] bg-[var(--bg)] text-[var(--text-primary)] outline-none focus:border-[var(--primary-blue)]"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    type="text" value={regUser} onChange={e => setRegUser(e.target.value)}
                    placeholder="用户名（至少2个字符）" autoComplete="username"
                    className="w-full px-3 py-2.5 rounded-lg border border-[var(--divider)] text-[14px] bg-[var(--bg)] text-[var(--text-primary)] outline-none focus:border-[var(--primary-blue)]"
                  />
                  <input
                    type="password" value={regPw} onChange={e => setRegPw(e.target.value)}
                    placeholder="密码（至少6位）" autoComplete="new-password"
                    onKeyDown={e => e.key === 'Enter' && handleRegister()}
                    className="w-full px-3 py-2.5 rounded-lg border border-[var(--divider)] text-[14px] bg-[var(--bg)] text-[var(--text-primary)] outline-none focus:border-[var(--primary-blue)]"
                  />
                </div>
              )}

              {authError && (
                <p className="mt-3 text-[12px] text-[var(--red)] text-center bg-red-50 py-1.5 rounded-md">{authError}</p>
              )}

              <motion.button
                whileTap={{ scale: 0.97 }}
                disabled={authLoading}
                onClick={authMode === 'login' ? handleLogin : handleRegister}
                className="w-full mt-3 py-2.5 rounded-lg bg-[var(--primary-blue)] text-white text-[14px] font-semibold disabled:opacity-50"
              >
                {authLoading ? '请稍候...' : authMode === 'login' ? '登录' : '注册'}
              </motion.button>
            </div>
          )}
        </motion.div>

        {/* Settings List */}
        <div className="bg-white rounded-xl card-shadow overflow-hidden">
          {/* Import Data */}
          <button
            onClick={onImport}
            className="w-full flex items-center px-4 py-4 text-left transition-colors border-b border-[var(--divider)] active:bg-[#F5F5F7]"
          >
            <div className="w-8 h-8 rounded-full bg-[var(--primary-blue)] flex items-center justify-center mr-3 shrink-0">
              <Upload size={16} strokeWidth={2} className="text-white" />
            </div>
            <span className="flex-1 text-[16px] text-[var(--text-primary)]">导入数据</span>
            <span className="text-[11px] text-[var(--text-tertiary)] mr-1">CSV</span>
            <ChevronRight size={18} className="text-[var(--icon-gray)] shrink-0" />
          </button>

          {/* Download Template */}
          <button
            onClick={onDownloadTemplate}
            className="w-full flex items-center px-4 py-4 text-left transition-colors border-b border-[var(--divider)] active:bg-[#F5F5F7]"
          >
            <div className="w-8 h-8 rounded-full bg-[var(--green)] flex items-center justify-center mr-3 shrink-0">
              <Download size={16} strokeWidth={2} className="text-white" />
            </div>
            <span className="flex-1 text-[16px] text-[var(--text-primary)]">下载导入模板</span>
            <span className="text-[11px] text-[var(--text-tertiary)] mr-1">.csv</span>
            <ChevronRight size={18} className="text-[var(--icon-gray)] shrink-0" />
          </button>

          {/* Export Data */}
          <button
            onClick={onExport}
            className="w-full flex items-center px-4 py-4 text-left transition-colors border-b border-[var(--divider)] active:bg-[#F5F5F7]"
          >
            <div className="w-8 h-8 rounded-full bg-[var(--primary-blue)] flex items-center justify-center mr-3 shrink-0">
              <Download size={16} strokeWidth={2} className="text-white" />
            </div>
            <span className="flex-1 text-[16px] text-[var(--text-primary)]">导出数据</span>
            <span className="text-[11px] text-[var(--text-tertiary)] mr-1">CSV</span>
            <ChevronRight size={18} className="text-[var(--icon-gray)] shrink-0" />
          </button>

          {/* Category Management */}
          <button
            onClick={() => setShowCategoryManager(true)}
            className="w-full flex items-center px-4 py-4 text-left transition-colors border-b border-[var(--divider)] active:bg-[#F5F5F7]"
          >
            <div className="w-8 h-8 rounded-full bg-[var(--primary-blue)] flex items-center justify-center mr-3 shrink-0">
              <FolderOpen size={16} strokeWidth={2} className="text-white" />
            </div>
            <span className="flex-1 text-[16px] text-[var(--text-primary)]">分类管理</span>
            <span className="text-[13px] text-[var(--text-tertiary)] mr-1">
              {categories.length} 个
            </span>
            <ChevronRight size={18} className="text-[var(--icon-gray)] shrink-0" />
          </button>

          {/* Reminder Settings */}
          <button
            onClick={() => setShowReminder(true)}
            className="w-full flex items-center px-4 py-4 text-left transition-colors border-b border-[var(--divider)] active:bg-[#F5F5F7]"
          >
            <div className="w-8 h-8 rounded-full bg-[var(--primary-blue)] flex items-center justify-center mr-3 shrink-0">
              <Bell size={16} strokeWidth={2} className="text-white" />
            </div>
            <span className="flex-1 text-[16px] text-[var(--text-primary)]">提醒设置</span>
            {notifyPermission === 'granted' ? (
              <span className="text-[12px] text-[var(--green)] font-medium mr-1">已开启</span>
            ) : (
              <span className="text-[12px] text-[var(--text-tertiary)] mr-1">未授权</span>
            )}
            <ChevronRight size={18} className="text-[var(--icon-gray)] shrink-0" />
          </button>

          {/* About / Help */}
          <button
            onClick={() => setShowAbout(true)}
            className="w-full flex items-center px-4 py-4 text-left transition-colors active:bg-[#F5F5F7]"
          >
            <div className="w-8 h-8 rounded-full bg-[var(--primary-blue)] flex items-center justify-center mr-3 shrink-0">
              <Info size={16} strokeWidth={2} className="text-white" />
            </div>
            <span className="flex-1 text-[16px] text-[var(--text-primary)]">关于/帮助</span>
            <ChevronRight size={18} className="text-[var(--icon-gray)] shrink-0" />
          </button>
        </div>
      </div>

      {/* Category Manager Modal */}
      <CategoryManager
        isOpen={showCategoryManager}
        onClose={() => setShowCategoryManager(false)}
        categories={categories}
        onAdd={onAddCategory}
        onUpdate={onUpdateCategory}
        onDelete={onDeleteCategory}
      />

      {/* Reminder Modal */}
      <ReminderModal
        isOpen={showReminder}
        onClose={() => setShowReminder(false)}
        settings={notifySettings}
        permission={notifyPermission}
        onToggle={onUpdateNotifySetting}
        onRequestPermission={onRequestNotifyPermission}
        onTest={onTestNotify}
      />

      {/* About Modal */}
      <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />
    </div>
  );
}

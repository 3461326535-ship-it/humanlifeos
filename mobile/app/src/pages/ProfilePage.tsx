import { useState, useEffect } from 'react';
import { SketchIcon } from '@/components/icons/SketchIcon';
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

function SyncStatusText({ status, onSyncNow }: { status: SyncStatus; onSyncNow: () => void }) {
  const state = status.state;
  const p = status.pendingCount;

  switch (state) {
    case 'synced':
      return (
        <span className="text-[12px] text-[var(--teal)] flex items-center gap-1 font-caveat">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--teal)]" />
          已同步
        </span>
      );
    case 'syncing':
      return (
        <span className="text-[12px] text-[var(--red)] flex items-center gap-1 font-caveat">
          <SketchIcon name="sync" size={11} strokeWidth={2} />
          同步中...
        </span>
      );
    case 'pending':
      return (
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-[var(--yellow)] flex items-center gap-1 font-caveat">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--yellow)]" />
            待同步 {p > 0 ? `(${p}项)` : ''}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onSyncNow(); }}
            className="text-[11px] text-[var(--red)] font-medium px-1.5 py-0.5 rounded bg-[var(--red)]/10 active:scale-95 transition-all font-head"
          >
            立即同步
          </button>
        </div>
      );
    case 'failed':
      return (
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-[var(--red)] flex items-center gap-1 font-caveat">
            <SketchIcon name="alert" size={11} strokeWidth={2} />
            同步失败
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onSyncNow(); }}
            className="text-[11px] text-[var(--red)] font-medium px-1.5 py-0.5 rounded bg-red-50 active:scale-95 transition-all font-head"
          >
            重试
          </button>
        </div>
      );
    case 'offline':
      return (
        <span className="text-[12px] text-[var(--ink-soft)] flex items-center gap-1 font-caveat">
          <SketchIcon name="wifi-off" size={11} strokeWidth={2} />
          离线模式
        </span>
      );
    default:
      return (
        <span className="text-[12px] text-[var(--ink-soft)] flex items-center gap-1 font-caveat">
          <SketchIcon name="wifi" size={11} strokeWidth={2} />
          离线可用
        </span>
      );
  }
}

const settingsRows = [
  { key: 'import', label: '导入数据', badge: 'CSV', icon: 'upload', color: 'var(--lav)', onClick: 'onImport' as const },
  { key: 'template', label: '下载导入模板', badge: '.csv', icon: 'download', color: 'var(--green)', onClick: 'onDownloadTemplate' as const },
  { key: 'export', label: '导出数据', badge: 'CSV', icon: 'download', color: 'var(--sky)', onClick: 'onExport' as const },
  { key: 'categories', label: '分类管理', icon: 'folder', color: 'var(--lav)', onClick: 'categories' as const },
  { key: 'reminders', label: '提醒设置', icon: 'bell', color: 'var(--yellow)', onClick: 'reminders' as const },
  { key: 'about', label: '关于/帮助', icon: 'info', color: 'var(--red)', onClick: 'about' as const },
];

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
        localStorage.removeItem('offline_tasks');
        localStorage.removeItem('offline_categories');
        localStorage.removeItem('offline_deleted_ids');
        localStorage.removeItem('ai-chat-messages');
        localStorage.setItem('auth_token', data.token);
        setLoggedIn(true);
        setAuthUser(data.user.username);
        setLoginPw('');
        setAuthError('');
        try {
          await fetchWithTimeout(`${API_BASE}/auth/migrate`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${data.token}` },
          });
        } catch { /* silent */ }
        window.dispatchEvent(new Event('tasks-changed'));
        window.dispatchEvent(new CustomEvent('chat-updated'));
        window.dispatchEvent(new CustomEvent('auth-changed'));
        onSyncNow();
      } else {
        setAuthError(data.message || '登录失败');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') setAuthError('连接超时，请检查网络后重试');
      else if (err?.message) setAuthError(`网络错误: ${err.message}`);
      else setAuthError('网络错误，请检查网络连接');
    } finally { setAuthLoading(false); }
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
        localStorage.removeItem('offline_tasks');
        localStorage.removeItem('offline_categories');
        localStorage.removeItem('offline_deleted_ids');
        localStorage.removeItem('ai-chat-messages');
        localStorage.setItem('auth_token', data.token);
        setLoggedIn(true);
        setAuthUser(data.user.username);
        setRegUser(''); setRegPw('');
        setAuthError('');
        window.dispatchEvent(new Event('tasks-changed'));
        window.dispatchEvent(new CustomEvent('chat-updated'));
        window.dispatchEvent(new CustomEvent('auth-changed'));
        onSyncNow();
      } else {
        setAuthError(data.message || '注册失败');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') setAuthError('连接超时，请检查网络后重试');
      else if (err?.message) setAuthError(`网络错误: ${err.message}`);
      else setAuthError('网络错误，请检查网络连接');
    } finally { setAuthLoading(false); }
  }

  function handleLogout() {
    const token = localStorage.getItem('auth_token');
    if (token) {
      fetch(`${API_BASE}/ai/history`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('offline_tasks');
    localStorage.removeItem('offline_categories');
    localStorage.removeItem('offline_deleted_ids');
    localStorage.removeItem('ai-chat-messages');
    setLoggedIn(false);
    setAuthUser('');
    window.dispatchEvent(new Event('tasks-changed'));
    window.dispatchEvent(new CustomEvent('chat-updated'));
    window.dispatchEvent(new CustomEvent('auth-changed'));
  }

  const handleRowClick = (key: string) => {
    switch (key) {
      case 'import': onImport(); break;
      case 'template': onDownloadTemplate(); break;
      case 'export': onExport(); break;
      case 'categories': setShowCategoryManager(true); break;
      case 'reminders': setShowReminder(true); break;
      case 'about': setShowAbout(true); break;
    }
  };

  const getRowBadge = (key: string) => {
    if (key === 'categories') return `${categories.length} 个`;
    if (key === 'reminders') return notifyPermission === 'granted' ? '已开启' : '未授权';
    if (key === 'import') return 'CSV';
    if (key === 'export') return 'CSV';
    if (key === 'template') return '.csv';
    return '';
  };

  return (
    <div className="flex flex-col h-full">
      <div className="content-scrollable px-4 pt-4 pb-6">
        {/* Page Title */}
        <div className="sketch-section-head">
          <h2 className="sketch-underline sketch-underline-lav">我的</h2>
        </div>

        {/* Auth Section */}
        <div className="sketch-card mx-0 mt-[14px] p-[16px]">
          {loggedIn ? (
            <div className="flex items-center gap-[14px]">
              <div className="sketch-ava w-[58px] h-[58px] bg-[var(--red)]">
                <span className="font-head text-[26px]">{authUser.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-head text-[19px] text-[var(--ink)]">{authUser}</p>
                <SyncStatusText status={syncStatus} onSyncNow={onSyncNow} />
              </div>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleLogout}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-[13px] text-[var(--red)] font-head"
              >
                <SketchIcon name="logout" size={14} strokeWidth={2} /> 退出
              </motion.button>
            </div>
          ) : (
            <div>
              <SyncStatusText status={syncStatus} onSyncNow={onSyncNow} />
              <div className="flex gap-1 mb-4 bg-[var(--fill-quaternary)] rounded-lg p-1 mt-2">
                <button
                  onClick={() => { setAuthMode('login'); setAuthError(''); }}
                  className={`flex-1 py-2 rounded-md text-[14px] font-head transition-all ${authMode === 'login' ? 'bg-[var(--bg-card)] text-[var(--ink)] shadow-sm' : 'text-[var(--ink-soft)]'}`}
                >
                  <SketchIcon name="login" size={14} strokeWidth={2} className="inline mr-1" /> 登录
                </button>
                <button
                  onClick={() => { setAuthMode('register'); setAuthError(''); }}
                  className={`flex-1 py-2 rounded-md text-[14px] font-head transition-all ${authMode === 'register' ? 'bg-[var(--bg-card)] text-[var(--ink)] shadow-sm' : 'text-[var(--ink-soft)]'}`}
                >
                  <SketchIcon name="plus" size={14} strokeWidth={2} className="inline mr-1" /> 注册
                </button>
              </div>

              {authMode === 'login' ? (
                <div className="space-y-3">
                  <input type="text" value={loginUser} onChange={e => setLoginUser(e.target.value)}
                    placeholder="用户名（默认 admin）" autoComplete="username"
                    className="sketch-input w-full px-3 py-2.5 text-[14px] text-[var(--ink)] placeholder:text-[var(--text-tertiary)] outline-none" />
                  <input type="password" value={loginPw} onChange={e => setLoginPw(e.target.value)}
                    placeholder="密码" autoComplete="current-password"
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    className="sketch-input w-full px-3 py-2.5 text-[14px] text-[var(--ink)] placeholder:text-[var(--text-tertiary)] outline-none" />
                </div>
              ) : (
                <div className="space-y-3">
                  <input type="text" value={regUser} onChange={e => setRegUser(e.target.value)}
                    placeholder="用户名（至少2个字符）" autoComplete="username"
                    className="sketch-input w-full px-3 py-2.5 text-[14px] text-[var(--ink)] placeholder:text-[var(--text-tertiary)] outline-none" />
                  <input type="password" value={regPw} onChange={e => setRegPw(e.target.value)}
                    placeholder="密码（至少6位）" autoComplete="new-password"
                    onKeyDown={e => e.key === 'Enter' && handleRegister()}
                    className="sketch-input w-full px-3 py-2.5 text-[14px] text-[var(--ink)] placeholder:text-[var(--text-tertiary)] outline-none" />
                </div>
              )}

              {authError && (
                <p className="mt-3 text-[12px] text-[var(--red)] text-center bg-red-50 py-1.5 rounded-md font-head">{authError}</p>
              )}

              <motion.button
                whileTap={{ scale: 0.97 }}
                disabled={authLoading}
                onClick={authMode === 'login' ? handleLogin : handleRegister}
                className="w-full mt-3 py-2.5 rounded-xl bg-[var(--red)] text-white text-[14px] font-head font-semibold disabled:opacity-50 border-2 border-[var(--ink)] sketch-wobble-sm"
              >
                {authLoading ? '请稍候...' : authMode === 'login' ? '登录' : '注册'}
              </motion.button>
            </div>
          )}
        </div>

        {/* Settings List */}
        <div className="flex flex-col gap-[11px] mt-[14px]">
          {settingsRows.map((row) => (
            <button
              key={row.key}
              onClick={() => handleRowClick(row.key)}
              className="sketch-card sketch-mitem text-left w-full"
            >
              <div className="sketch-mitem-icon" style={{ backgroundColor: row.color }}>
                <SketchIcon name={row.icon} size={15} strokeWidth={2.5} stroke="white" />
              </div>
              <span className="flex-1 font-head text-[15px] text-[var(--ink)]">{row.label}</span>
              <span className="text-[12px] text-[var(--ink-soft)] mr-1 font-caveat">{getRowBadge(row.key)}</span>
              <span className="text-[var(--ink-soft)] font-caveat text-[18px]">›</span>
            </button>
          ))}
          {/* Logout row (only when logged in) */}
          {loggedIn && (
            <button
              onClick={handleLogout}
              className="sketch-card sketch-mitem text-left w-full"
            >
              <div className="sketch-mitem-icon" style={{ backgroundColor: '#C9BEA3' }}>
                <SketchIcon name="logout" size={15} strokeWidth={2.5} stroke="white" />
              </div>
              <span className="flex-1 font-head text-[15px] text-[var(--red)]">退出登录</span>
              <span className="text-[var(--ink-soft)] font-caveat text-[18px]">›</span>
            </button>
          )}
        </div>
      </div>

      <CategoryManager
        isOpen={showCategoryManager}
        onClose={() => setShowCategoryManager(false)}
        categories={categories}
        onAdd={onAddCategory}
        onUpdate={onUpdateCategory}
        onDelete={onDeleteCategory}
      />
      <ReminderModal
        isOpen={showReminder}
        onClose={() => setShowReminder(false)}
        settings={notifySettings}
        permission={notifyPermission}
        onToggle={onUpdateNotifySetting}
        onRequestPermission={onRequestNotifyPermission}
        onTest={onTestNotify}
      />
      <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />
    </div>
  );
}

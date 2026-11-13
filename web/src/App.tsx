import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './lib/api';
import LoginPage from './pages/LoginPage';
import TodayPage from './pages/TodayPage';
import KanbanPage from './pages/KanbanPage';
import GanttPage from './pages/GanttPage';
import CalendarPage from './pages/CalendarPage';
import StatsPage from './pages/StatsPage';
import PlaceholderPage from './pages/PlaceholderPage';
import AiChat from './components/AiChat';
import TimerFloat from './components/TimerFloat';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function todayLabel() {
  const d = new Date();
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`;
}

const TABS = [
  { to: '/', label: '今天', end: true },
  { to: '/kanban', label: '看板', end: false },
  { to: '/gantt', label: '甘特', end: false },
  { to: '/calendar', label: '日历', end: false },
  { to: '/stats', label: '统计', end: false },
];

export default function App() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const focus = params.get('focus') === '1';
  const [newMenu, setNewMenu] = useState(false);

  // 切路由就收起「新建」菜单
  useEffect(() => {
    setNewMenu(false);
  }, [pathname]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  // 认证状态：401 = 未登录（guest 模式浏览，与旧版行为一致）
  const { data: auth } = useQuery({
    queryKey: ['auth'],
    queryFn: () => api.authStatus().then((r) => r.user).catch(() => null),
    retry: false,
  });

  const handleLogout = async () => {
    await api.logout();
    queryClient.invalidateQueries();
    navigate('/');
  };

  const isLogin = pathname === '/login';

  return (
    <div className="min-h-screen">
      {/* ── 页头：标题 + 日期 + 搜索/筛选/新建，下面一条下划线 tab（模块唯一的二级导航）── */}
      <div className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur-md">
        <div className="mx-auto w-full max-w-page px-7 pt-4">
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-ink">任务</h1>
            <span className="pb-0.5 text-[12.5px] text-ink-soft">{todayLabel()}</span>

            <div className="ml-auto flex flex-none items-center gap-2 pb-1">
              {/* 搜索 */}
              <div className="flex h-8 w-[172px] items-center gap-1.5 rounded-lg border border-line bg-white/70 px-2 transition-colors focus-within:border-moss/40">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-none text-ink-soft">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.6-3.6" strokeLinecap="round" />
                </svg>
                <input
                  value={q}
                  onChange={(e) => setParam('q', e.target.value)}
                  placeholder="搜索任务"
                  className="w-full bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-faint"
                />
                {q && (
                  <button className="text-[11px] text-ink-soft hover:text-ink-mid" onClick={() => setParam('q', null)} aria-label="清除搜索">
                    ✕
                  </button>
                )}
              </div>

              {/* 筛选：只看未完成 */}
              <button
                onClick={() => setParam('focus', focus ? null : '1')}
                title={focus ? '显示全部' : '只看未完成'}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                  focus
                    ? 'border-moss/30 bg-moss-soft text-moss'
                    : 'border-line bg-white/70 text-ink-soft hover:text-ink-mid'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 5h18l-7 8v6l-4-2v-4z" />
                </svg>
              </button>

              {/* 新建：任务 / 习惯 两个入口 */}
              <div className="relative">
                <button
                  className="flex h-8 items-center gap-1 rounded-lg bg-moss-deep px-3 text-[12.5px] font-medium text-white transition-colors hover:bg-moss"
                  onClick={() => setNewMenu((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={newMenu}
                >
                  新建
                  <span className={`text-[9px] leading-none transition-transform ${newMenu ? 'rotate-180' : ''}`}>▾</span>
                </button>

                {newMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setNewMenu(false)} />
                    <div
                      className="absolute right-0 top-full z-20 mt-1.5 w-44 overflow-hidden rounded-xl border border-line bg-white p-1 shadow-pop"
                      role="menu"
                    >
                      <button
                        role="menuitem"
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-ink-mid transition-colors hover:bg-paper-deep hover:text-ink"
                        onClick={() => {
                          setNewMenu(false);
                          navigate('/?new=1');
                        }}
                      >
                        <span className="flex h-5 w-5 flex-none items-center justify-center rounded-md bg-moss-soft text-moss">
                          <svg viewBox="0 0 14 14" className="h-3 w-3 fill-none stroke-current" strokeWidth="1.6" strokeLinecap="round">
                            <path d="M7 2.5v9M2.5 7h9" />
                          </svg>
                        </span>
                        单次任务
                      </button>
                      <button
                        role="menuitem"
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-ink-mid transition-colors hover:bg-paper-deep hover:text-ink"
                        onClick={() => {
                          setNewMenu(false);
                          navigate('/?new=1&repeat=daily');
                        }}
                      >
                        <span className="flex h-5 w-5 flex-none items-center justify-center rounded-md bg-lagoon-soft text-lagoon">
                          <svg viewBox="0 0 14 14" className="h-3 w-3 fill-none stroke-current" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11.5 6.4A4.6 4.6 0 1 1 9.9 3M11.6 1.8v3.2H8.4" />
                          </svg>
                        </span>
                        周期任务
                      </button>
                      <button
                        role="menuitem"
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-ink-mid transition-colors hover:bg-paper-deep hover:text-ink"
                        onClick={() => {
                          setNewMenu(false);
                          navigate('/?habit=new');
                        }}
                      >
                        <span className="flex h-5 w-5 flex-none items-center justify-center rounded-md bg-clay-soft text-clay">
                          <svg viewBox="0 0 14 14" className="h-3 w-3 fill-none stroke-current" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2.4 7.2l2.4 2.6 2.6-3M8 8.4l1.4 1.4L12 6.6" />
                          </svg>
                        </span>
                        习惯
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* 账号 */}
              {auth ? (
                <button
                  className="ml-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-moss-soft text-[11px] font-semibold text-moss"
                  title={`${auth.username} · 点击退出`}
                  onClick={handleLogout}
                >
                  {auth.username.slice(0, 1).toUpperCase()}
                </button>
              ) : (
                !isLogin && (
                  <NavLink to="/login" className="ml-0.5 text-[12.5px] text-ink-soft underline-offset-4 hover:text-moss hover:underline">
                    登录
                  </NavLink>
                )
              )}
            </div>
          </div>

          <nav className="mt-2 flex items-center gap-7">
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  `relative pb-2.5 text-[13.5px] transition-colors ${
                    isActive
                      ? 'font-medium text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-moss-deep'
                      : 'text-ink-mid hover:text-ink'
                  }`
                }
              >
                {t.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      <main className="mx-auto w-full max-w-page px-7 py-5">
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/kanban" element={<KanbanPage />} />
          <Route path="/gantt" element={<GanttPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="*" element={<PlaceholderPage title="页面" milestone="—" />} />
        </Routes>
      </main>

      {/* 全局计时浮标：任何页面都能看到 / 结束当前计时 */}
      {!isLogin && <TimerFloat />}
      {/* AI 助手：浮标 + 聊天窗 + 确认弹窗，走后端现有的 /api/ai/* */}
      {!isLogin && <AiChat />}
    </div>
  );
}

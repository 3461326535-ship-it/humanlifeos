import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './lib/api';
import LoginPage from './pages/LoginPage';
import TodayPage from './pages/TodayPage';
import KanbanPage from './pages/KanbanPage';
import CalendarPage from './pages/CalendarPage';
import StatsPage from './pages/StatsPage';
import PlaceholderPage from './pages/PlaceholderPage';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function todayLabel() {
  const d = new Date();
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${WEEKDAYS[d.getDay()]}`;
}

const TABS = [
  { to: '/', label: '今天', end: true },
  { to: '/kanban', label: '看板', end: false },
  { to: '/calendar', label: '日历', end: false },
  { to: '/stats', label: '统计', end: false },
];

const PAGE_META: Record<string, { title: string; sub: string }> = {
  '/': { title: '今天', sub: `${todayLabel()} · 今天的安排` },
  '/kanban': { title: '看板', sub: '按状态推进，拖动卡片换列' },
  '/calendar': { title: '日历', sub: '计划与实际，两条轨道对照' },
  '/stats': { title: '统计', sub: '完成趋势、状态分布与每日战报' },
  '/login': { title: '登录', sub: '登录后任务在 PC 与移动端同步' },
};

export default function App() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const meta = PAGE_META[pathname] ?? { title: '页面', sub: '' };

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
      {/* ── 页头 + 二级导航：模块自己的导航只有这一条下划线 tab，不另起侧栏 ── */}
      <div className="sticky top-0 z-20 border-b border-line bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-page items-end justify-between gap-6 px-7 pt-5">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-ink">
              {meta.title}
            </h1>
            <p className="mt-1 truncate text-[12.5px] text-ink-soft">{meta.sub}</p>
          </div>

          <div className="flex flex-none items-center gap-1.5 pb-2 text-[13px]">
            {auth ? (
              <>
                <span className="flex items-center gap-1.5 text-ink-soft">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-moss-soft text-[11px] font-semibold text-moss">
                    {auth.username.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden sm:inline">{auth.username}</span>
                </span>
                <button className="btn-ghost text-[12.5px]" onClick={handleLogout}>
                  退出
                </button>
              </>
            ) : (
              !isLogin && (
                <NavLink to="/login" className="btn-primary text-[12.5px]">
                  登录
                </NavLink>
              )
            )}
          </div>
        </div>

        <div className="mx-auto w-full max-w-page px-7">
          <nav className="flex items-center gap-6">
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  `relative pb-2.5 text-[13.5px] transition-colors ${
                    isActive
                      ? 'font-medium text-moss after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-moss'
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
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="*" element={<PlaceholderPage title="页面" milestone="—" />} />
        </Routes>
      </main>
    </div>
  );
}

import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './lib/api';
import LoginPage from './pages/LoginPage';
import TodayPage from './pages/TodayPage';
import KanbanPage from './pages/KanbanPage';
import CalendarPage from './pages/CalendarPage';
import StatsPage from './pages/StatsPage';
import PlaceholderPage from './pages/PlaceholderPage';
import ActiveTimer from './components/ActiveTimer';

function Header() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-4xl items-center gap-5 px-5 py-3">
        {/* Logo */}
        <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-slate-900">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600 text-[11px] font-bold text-white">
            T
          </span>
          Todo
        </span>

        {/* 导航 */}
        <nav className="flex items-center gap-0.5 text-[13px]">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `rounded-md px-2.5 py-1.5 ${
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`
            }
          >
            今天
          </NavLink>
          <NavLink
            to="/kanban"
            className={({ isActive }) =>
              `rounded-md px-2.5 py-1.5 ${
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`
            }
          >
            看板
          </NavLink>
          <NavLink
            to="/calendar"
            className={({ isActive }) =>
              `rounded-md px-2.5 py-1.5 ${
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`
            }
          >
            日历
          </NavLink>
          <NavLink
            to="/stats"
            className={({ isActive }) =>
              `rounded-md px-2.5 py-1.5 ${
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`
            }
          >
            统计
          </NavLink>
        </nav>

        {/* 账户 */}
        <ActiveTimer />
        <div className="ml-auto flex items-center gap-1.5 text-[13px]">
          {auth ? (
            <>
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-50 text-[11px] font-semibold text-indigo-600">
                  {auth.username.slice(0, 1).toUpperCase()}
                </span>
                {auth.username}
              </span>
              <button className="btn-ghost" onClick={handleLogout}>
                退出
              </button>
            </>
          ) : (
            <NavLink to="/login" className="btn-primary">
              登录
            </NavLink>
          )}
        </div>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-6xl px-5 py-7">
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

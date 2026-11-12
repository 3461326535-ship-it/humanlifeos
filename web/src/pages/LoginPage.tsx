import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const loginMutation = useMutation({
    mutationFn: () => api.login(username.trim() || 'admin', password),
    onSuccess: () => {
      queryClient.invalidateQueries();
      navigate('/');
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="mx-auto mt-20 max-w-sm">
      <div className="card p-7">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
            T
          </span>
          <h1 className="text-lg font-semibold text-slate-900">登录</h1>
        </div>
        <p className="-mt-4 mb-5 text-[13px] text-slate-400">
          登录后同步你的任务；不登录也可以游客模式使用
        </p>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            loginMutation.mutate();
          }}
        >
          <div>
            <label className="label" htmlFor="username">用户名（默认 admin）</label>
            <input
              id="username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="label" htmlFor="password">密码</label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-600">{error}</p>
          )}
          <button type="submit" className="btn-primary w-full py-2" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? '登录中…' : '登录'}
          </button>
        </form>
      </div>
      <p className="mt-4 text-center text-xs text-slate-400">
        会话通过 httpOnly Cookie 保持，无需记住 token
      </p>
    </div>
  );
}

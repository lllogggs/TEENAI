import React, { useState } from 'react';

interface AdminAuthProps {
  loading: boolean;
  onLogin: (email: string, password: string) => Promise<void>;
  onGoogleLogin: () => Promise<void>;
}

const AdminAuth: React.FC<AdminAuthProps> = ({ loading, onLogin, onGoogleLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onLogin(email.trim(), password);
  };

  return (
    <div className="min-h-screen bg-[#F4F7FC] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-6 shadow-xl">
        <h1 className="text-2xl font-black text-slate-900">관리자 로그인</h1>
        <p className="mt-2 text-sm text-slate-500">운영 대시보드 접근을 위해 관리자 계정으로 로그인하세요.</p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@forteenai.com"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="비밀번호"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand-900 py-3 text-sm font-black text-white disabled:opacity-60"
          >
            {loading ? '로그인 중...' : '관리자 로그인'}
          </button>
        </form>

        <div className="my-4 flex items-center gap-2">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs font-bold text-slate-400">또는</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <button
          type="button"
          onClick={onGoogleLogin}
          disabled={loading}
          className="w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-black text-slate-700 disabled:opacity-60"
        >
          {loading ? '처리 중...' : 'Google로 관리자 로그인'}
        </button>

      </div>
    </div>
  );
};

export default AdminAuth;

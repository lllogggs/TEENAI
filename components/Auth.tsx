
import React, { useState } from 'react';
import { UserRole } from '../types';

interface AuthProps {
  onLogin: (email: string, password: string, role: UserRole, inviteCode?: string, isSignup?: boolean) => Promise<void>;
  loading: boolean;
}

const Auth: React.FC<AuthProps> = ({ onLogin, loading }) => {
  const [view, setView] = useState<'selection' | 'parent-auth' | 'student-auth'>('selection');
  const [isSignup, setIsSignup] = useState(false);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) { alert("올바른 이메일 주소를 입력해주세요."); return; }
    if (password.length < 6) { alert("비밀번호는 6자리 이상이어야 합니다."); return; }
    if (view === 'student-auth' && isSignup && inviteCode.length < 6) {
        alert("올바른 초대 코드를 입력해주세요.");
        return;
    }

    if (view === 'parent-auth') {
      await onLogin(email, password, UserRole.PARENT, undefined, isSignup);
    } else {
      await onLogin(email, password, UserRole.STUDENT, inviteCode, isSignup);
    }
  };

  const goBack = () => {
    setView('selection');
    setEmail('');
    setPassword('');
    setInviteCode('');
    setIsSignup(false);
  };

  if (view === 'selection') {
    return (
      <div className="min-h-screen bg-[#F1F5F9] flex flex-col items-center justify-center p-10">
        <div className="text-center mb-20 animate-in fade-in zoom-in duration-700">
            <h1 className="text-7xl font-black text-brand-900 tracking-tighter mb-6">TEENAI</h1>
            <p className="text-slate-500 font-bold text-lg">청소년을 위한 가장 안전한 AI 성장의 공간</p>
        </div>

        <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-2 gap-10">
          <button onClick={() => setView('student-auth')} className="group flex flex-col p-14 bg-brand-900 rounded-[3rem] shadow-2xl hover:shadow-brand-900/30 hover:-translate-y-2 transition-all text-left border border-slate-800 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 group-hover:bg-white/10 transition-colors"></div>
             <div className="w-16 h-16 bg-white/10 rounded-3xl flex items-center justify-center text-4xl mb-10 group-hover:scale-110 transition-transform">🎓</div>
             <h2 className="text-4xl font-black text-white mb-5">학생 시작하기</h2>
             <p className="text-slate-400 font-medium text-lg leading-relaxed mb-10 text-balance tracking-tight">부모님께 받은 코드를 준비하셨나요?<br/>지금 멘토와 대화를 시작해보세요.</p>
             <div className="mt-auto flex items-center gap-2 text-white font-black text-sm uppercase tracking-widest">Start Now <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg></div>
          </button>

          <button onClick={() => setView('parent-auth')} className="group flex flex-col p-14 bg-white rounded-[3rem] shadow-2xl hover:shadow-slate-200 hover:-translate-y-2 transition-all text-left border border-white relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50/50 rounded-full -mr-16 -mt-16 group-hover:bg-indigo-50 transition-colors"></div>
             <div className="w-16 h-16 bg-indigo-50 rounded-3xl flex items-center justify-center text-4xl mb-10 group-hover:scale-110 transition-transform">🛡️</div>
             <h2 className="text-4xl font-black text-slate-900 mb-5">학부모 시작하기</h2>
             <p className="text-slate-400 font-medium text-lg leading-relaxed mb-10 text-balance tracking-tight">자녀를 위해 안전 가이드를 설정하고<br/>성장 리포트를 확인하세요.</p>
             <div className="mt-auto flex items-center gap-2 text-indigo-600 font-black text-sm uppercase tracking-widest">Parent Portal <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg></div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center p-10">
      <div className="max-w-lg w-full bg-white rounded-[3rem] shadow-2xl p-14 relative overflow-hidden">
        <button onClick={goBack} className="text-slate-400 hover:text-slate-800 mb-10 flex items-center gap-2 font-black text-xs uppercase tracking-widest transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7"></path></svg> Back
        </button>
        
        <h2 className="text-4xl font-black text-slate-900 mb-3 tracking-tighter">
            {view === 'parent-auth' ? 'Parent ' : 'Student '}
            {isSignup ? 'Signup' : 'Login'}
        </h2>
        <p className="text-slate-400 text-sm font-bold mb-10">
           {isSignup ? '새로운 틴에이아이 계정을 생성합니다.' : '계정에 로그인하여 계속합니다.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-slate-50 border border-slate-100 rounded-[1.5rem] px-7 py-5 text-sm font-bold focus:ring-4 focus:ring-brand-100 outline-none transition-all placeholder-slate-300" placeholder="이메일 주소"
          />
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-slate-50 border border-slate-100 rounded-[1.5rem] px-7 py-5 text-sm font-bold focus:ring-4 focus:ring-brand-100 outline-none transition-all placeholder-slate-300" placeholder="비밀번호 (6자리 이상)"
          />

          {view === 'student-auth' && isSignup && (
            <div className="pt-2">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2 block">Parent Invite Code</label>
               <input type="text" required value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                className="w-full bg-brand-50 border border-brand-100 rounded-[1.5rem] px-7 py-5 text-xl font-black text-brand-900 tracking-[0.3em] focus:ring-4 focus:ring-brand-100 outline-none transition-all uppercase placeholder-brand-200" placeholder="A1B2C3"
              />
            </div>
          )}

          <button type="submit" disabled={loading} className="w-full bg-brand-900 text-white font-black py-6 rounded-[1.75rem] hover:bg-black transition-all shadow-xl shadow-brand-900/20 active:scale-[0.98] disabled:bg-slate-300 disabled:shadow-none mt-4 text-lg">
            {loading ? 'Processing...' : (isSignup ? '가입하고 시작하기' : '로그인')}
          </button>
        </form>

        <div className="mt-10 text-center">
            <button onClick={() => setIsSignup(!isSignup)} className="text-xs font-black text-slate-400 hover:text-brand-600 underline underline-offset-4 tracking-tighter">
                {isSignup ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원가입'}
            </button>
        </div>
      </div>
    </div>
  );
};

export default Auth;

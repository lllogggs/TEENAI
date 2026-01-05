import React, { useState } from 'react';
import { UserRole } from '../types';
import { MockDb } from '../services/mockDb';

interface AuthProps {
  onLogin: (email: string, role: UserRole) => void;
}

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [view, setView] = useState<'selection' | 'parent-login' | 'student-code' | 'student-signup'>('selection');
  const [email, setEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [agreeAge, setAgreeAge] = useState(false);
  const [agreeSafety, setAgreeSafety] = useState(false);

  const handleParentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(email, UserRole.PARENT);
  };

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isValid = MockDb.validateInviteCode(inviteCode.toUpperCase());
    if (isValid) {
      setCodeError('');
      setView('student-signup');
    } else {
      setCodeError('유효하지 않은 초대 코드입니다. 부모님께 확인해주세요.');
    }
  };

  const handleStudentSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = await MockDb.registerStudent(email, inviteCode.toUpperCase());
    if (user) onLogin(email, UserRole.STUDENT);
  };

  const goBack = () => {
    setView('selection');
    setEmail('');
    setInviteCode('');
    setCodeError('');
  };

  if (view === 'selection') {
    return (
      <div className="min-h-screen bg-[#F1F5F9] flex flex-col items-center justify-center p-6">
        <div className="text-center mb-16">
            <h1 className="text-5xl font-black text-brand-900 tracking-tighter mb-4">TEENAI</h1>
            <p className="text-slate-500 font-medium">청소년을 위한 안전하고 똑똑한 AI 멘토링 서비스</p>
        </div>

        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* 학생 섹션 (왼쪽) */}
          <button onClick={() => setView('student-code')} className="group flex flex-col p-10 bg-brand-900 rounded-[2.5rem] shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all text-left border border-slate-800">
             <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-3xl mb-8 group-hover:bg-brand-500 transition-colors">🎓</div>
             <h2 className="text-3xl font-black text-white mb-4">대화 시작하기</h2>
             <p className="text-slate-400 font-medium leading-relaxed mb-8 text-balance">초대 코드를 입력하고<br/>나만의 AI 멘토와 대화를 시작하세요.</p>
          </button>

          {/* 학부모 섹션 (오른쪽) */}
          <button onClick={() => setView('parent-login')} className="group flex flex-col p-10 bg-white rounded-[2.5rem] shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all text-left border border-white">
             <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-3xl mb-8 group-hover:bg-indigo-600 group-hover:text-white transition-colors">🛡️</div>
             <h2 className="text-3xl font-black text-slate-800 mb-4">학부모</h2>
             <p className="text-slate-400 font-medium leading-relaxed mb-8 text-balance">자녀의 대화 요약을 확인하고<br/>AI에게 직접 지침을 내려보세요.</p>
          </button>
        </div>

        <div className="mt-12 flex gap-4">
            <button onClick={() => onLogin('TEST@TEST.COM', UserRole.STUDENT)} className="text-[11px] font-bold py-2 px-6 bg-white rounded-full text-slate-400 hover:text-indigo-600 transition shadow-sm">학생 테스트 계정</button>
            <button onClick={() => onLogin('TEST@TEST.COM', UserRole.PARENT)} className="text-[11px] font-bold py-2 px-6 bg-white rounded-full text-slate-400 hover:text-indigo-600 transition shadow-sm">학부모 테스트 계정</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-[2rem] shadow-2xl p-10 relative overflow-hidden">
        <button onClick={goBack} className="text-slate-400 hover:text-slate-800 mb-8 flex items-center gap-2 font-bold text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7"></path></svg> 처음으로
        </button>
        
        <h2 className="text-3xl font-black text-slate-900 mb-2">
            {view === 'parent-login' ? '학부모 로그인' : view === 'student-code' ? '코드 입력' : '회원 가입'}
        </h2>
        <p className="text-slate-400 text-sm font-medium mb-10">계속하려면 아래 정보를 입력해주세요.</p>

        {view === 'parent-login' && (
          <form onSubmit={handleParentSubmit} className="space-y-4">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-medium focus:ring-4 focus:ring-brand-100 outline-none transition-all" placeholder="이메일 주소"
            />
            <button type="submit" className="w-full bg-brand-900 text-white font-bold py-4 rounded-2xl hover:bg-black transition-colors shadow-lg">로그인</button>
          </form>
        )}

        {view === 'student-code' && (
          <form onSubmit={handleCodeSubmit} className="space-y-4">
            <input type="text" required maxLength={6} value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-6 text-center text-4xl font-black tracking-widest focus:ring-4 focus:ring-brand-100 outline-none transition-all text-brand-900" placeholder="000000"
            />
            {codeError && <p className="text-red-500 text-xs font-bold text-center">{codeError}</p>}
            <button type="submit" className="w-full bg-brand-900 text-white font-bold py-4 rounded-2xl hover:bg-black transition-colors shadow-lg mt-4">초대 코드 확인</button>
          </form>
        )}

        {view === 'student-signup' && (
          <form onSubmit={handleStudentSignup} className="space-y-6">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-medium focus:ring-4 focus:ring-brand-100 outline-none transition-all" placeholder="사용할 이메일 주소"
            />
            <div className="space-y-3 p-5 bg-slate-50 rounded-2xl border border-slate-100 text-[11px] text-slate-500 font-medium">
                <label className="flex gap-3 cursor-pointer">
                    <input type="checkbox" required checked={agreeAge} onChange={e => setAgreeAge(e.target.checked)} className="w-4 h-4 mt-0.5" />
                    <span>[필수] 만 13세 이상이며 대화 요약이 공유됨에 동의합니다.</span>
                </label>
                <label className="flex gap-3 cursor-pointer">
                    <input type="checkbox" required checked={agreeSafety} onChange={e => setAgreeSafety(e.target.checked)} className="w-4 h-4 mt-0.5" />
                    <span>[필수] 위험 상황 감지 시 보호자에게 즉시 알림이 전송됩니다.</span>
                </label>
            </div>
            <button type="submit" className="w-full bg-brand-900 text-white font-bold py-4 rounded-2xl hover:bg-black transition-colors shadow-lg">대화 시작하기</button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Auth;
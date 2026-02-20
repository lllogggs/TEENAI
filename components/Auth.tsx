
import React, { useState } from 'react';
import { UserRole } from '../types';
import { supabase } from '../utils/supabase';
import TermsModal from './TermsModal';

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
  const [registrationCode, setRegistrationCode] = useState('');

  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const verifyRegistrationCode = async (code: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('admin_codes')
      .select('code, is_used')
      .eq('code', code)
      .eq('is_used', false)
      .single();

    if (error || !data) return false;
    return true;
  };

  const markRegistrationCodeUsed = async (code: string) => {
    await supabase
      .from('admin_codes')
      .update({ is_used: true, used_at: new Date().toISOString() })
      .eq('code', code);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) { alert("올바른 이메일 주소를 입력해주세요."); return; }
    if (password.length < 6) { alert("비밀번호는 6자리 이상이어야 합니다."); return; }

    if (isSignup) {
      if (!termsAccepted || !privacyAccepted) {
        alert("이용약관 및 개인정보처리방침에 동의해주세요.");
        return;
      }

      if (view === 'parent-auth') {
        if (!registrationCode) {
          alert("관리자 등록 코드가 필요합니다.");
          return;
        }
        const isValid = await verifyRegistrationCode(registrationCode);
        if (!isValid) {
          alert("유효하지 않거나 이미 사용된 등록 코드입니다.");
          return;
        }
        // Code will be marked as used AFTER successful signup in the parent component or via a triggered function ideally.
        // But here we rely on the onLogin callback. 
        // NOTE: For stricter security, code verification and usage should be atomic on server side.
        // For this implementation, we will mark it used after successful auth in the callback context if possible.
        // However, onLogin is passed from App.tsx. We will assume validation is enough here and update App.tsx to handle post-signup logic or handle it here?
        // Let's modify logic: onLogin will handle the actual duplicate check. 
        // We will just pass validation here.
        // Checking code validity is done. Mark used happens inside App.tsx or we do it here right before calling onLogin?
        // If onLogin fails, we shouldn't mark it used.
        // Ideally App.tsx should handle the "mark used" part.
      }

      if (view === 'student-auth' && inviteCode.length < 6) {
        alert("올바른 초대 코드를 입력해주세요.");
        return;
      }
    }

    if (view === 'parent-auth') {
      // Pass registration code as the last argument if needed, or handle it within App.tsx by passing it as 'code'.
      // The interface for onLogin is: (..., inviteCode?: string, ...)
      // We can overload inviteCode for parents to be "Registration Code".
      await onLogin(email, password, UserRole.PARENT, isSignup ? registrationCode : undefined, isSignup);

      if (isSignup && view === 'parent-auth') {
        // Best effort to mark code used if login/signup didn't throw (onLogin returns Promise<void>).
        // But onLogin in App.tsx might fail.
        // Let's rely on App.tsx to handle the business logic of "using" the code to avoid race conditions or split logic.
        // Actually, App.tsx doesn't know about admin_codes table yet. We'll update App.tsx next.
      }
    } else {
      await onLogin(email, password, UserRole.STUDENT, inviteCode, isSignup);
    }
  };

  const goBack = () => {
    setView('selection');
    setEmail('');
    setPassword('');
    setInviteCode('');
    setRegistrationCode('');
    setIsSignup(false);
    setTermsAccepted(false);
    setPrivacyAccepted(false);
  };

  const termsContent = (
    <div className="space-y-3">
      <p><strong>제1조 (목적)</strong><br />본 약관은 ForTeenAI(이하 "회사")가 제공하는 인공지능 채팅 서비스(이하 "서비스")의 이용 조건 및 절차를 규정합니다.</p>
      <p><strong>제2조 (AI의 한계 및 면책)</strong><br />1. 본 서비스는 인공지능 기술을 기반으로 하며, AI가 생성하는 답변의 정확성, 신뢰성, 완전성을 보장하지 않습니다.<br />2. AI는 때때로 부정확하거나(환각 현상), 편향되거나, 의도치 않은 답변을 할 수 있습니다.<br />3. 본 서비스는 전문 심리 상담이나 의료 진단을 대체할 수 없으며, 위급한 상황에서는 반드시 전문가나 관련 기관의 도움을 받아야 합니다.</p>
      <p><strong>제3조 (이용자의 의무)</strong><br />1. 이용자는 서비스를 불법적이거나 타인의 권리를 침해하는 목적으로 사용해서는 안 됩니다.<br />2. 욕설, 비방, 성적 수치심을 유발하는 대화 등 부적절한 사용 시 이용이 제한될 수 있습니다.</p>
      <p><strong>제4조 (부모의 감독 권한)</strong><br />1. 본 서비스는 청소년 보호를 위해 학부모가 자녀의 대화 내용 및 심리 상태 보고서를 열람할 수 있는 기능을 제공합니다.<br />2. 학부모 및 자녀 회원은 이에 동의한 것으로 간주합니다.</p>
    </div>
  );

  const privacyContent = (
    <div className="space-y-3">
      <p><strong>1. 수집하는 개인정보 항목</strong><br />이메일, 비밀번호, 이름, 대화 내용, 심리 분석 데이터, 서비스 이용 기록</p>
      <p><strong>2. 개인정보의 수집 및 이용 목적</strong><br />서비스 제공, 회원 관리, AI 모델 학습 및 서비스 개선, 심리 분석 리포트 생성, 안전 가드레일 작동</p>
      <p><strong>3. 개인정보의 제공</strong><br />회사는 법령에 따른 경우를 제외하고는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다. 다만, '학생' 회원의 대화 요약 및 위험 징후 데이터는 연결된 '학부모' 회원에게 제공됩니다.</p>
      <p><strong>4. 개인정보의 보유 및 이용 기간</strong><br />회원 탈퇴 시까지 보유하며, 관련 법령에 따라 일정 기간 보관이 필요한 경우 해당 기간 동안 보관합니다.</p>
      <p><strong>5. 서비스 모니터링 및 안전 관리</strong><br />회사는 이용자의 안전을 보호하고, 서비스 품질 개선 및 AI 모델의 고도화를 위해 필요한 경우 대화 내용을 검토 및 모니터링할 수 있습니다. 이는 성범죄, 폭력, 자해 등 위험 상황을 방지하고 더 나은 서비스를 제공하기 위함입니다.</p>
    </div>
  );

  if (view === 'selection') {
    return (
      <div className="min-h-[100dvh] bg-[#F1F5F9] flex flex-col items-center justify-center p-4 md:p-10">
        <div className="text-center mb-8 md:mb-20 animate-in fade-in zoom-in duration-700">
          <h1 className="text-5xl md:text-7xl font-black text-brand-900 tracking-tighter mb-3 md:mb-6">ForTeenAI</h1>
          <p className="text-slate-500 font-bold text-sm md:text-lg">청소년을 위한 가장 안전한 AI 성장의 공간</p>
        </div>

        <div className="max-w-5xl w-[85vw] sm:w-[85%] md:w-full grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-10">
          <button onClick={() => setView('student-auth')} className="group flex flex-col p-6 md:p-14 bg-brand-900 rounded-[2rem] md:rounded-[3rem] shadow-2xl hover:shadow-brand-900/30 hover:-translate-y-2 transition-all text-left border border-slate-800 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 bg-white/5 rounded-full -mr-12 -mt-12 md:-mr-16 md:-mt-16 group-hover:bg-white/10 transition-colors"></div>
            <div className="w-12 h-12 md:w-16 md:h-16 bg-white/10 rounded-2xl md:rounded-3xl flex items-center justify-center text-2xl md:text-4xl mb-4 md:mb-10 group-hover:scale-110 transition-transform">🎓</div>
            <h2 className="text-2xl md:text-4xl font-black text-white mb-2 md:mb-5">학생 시작하기</h2>
            <p className="text-slate-400 font-medium text-sm md:text-lg leading-relaxed mb-6 md:mb-10 text-balance tracking-tight">부모님께 받은 코드를 준비하셨나요?<br />지금 멘토와 대화를 시작해보세요.</p>
            <div className="mt-auto flex items-center gap-2 text-white font-black text-xs md:text-sm uppercase tracking-widest">Start Now <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg></div>
          </button>

          <button onClick={() => setView('parent-auth')} className="group flex flex-col p-6 md:p-14 bg-white rounded-[2rem] md:rounded-[3rem] shadow-2xl hover:shadow-slate-200 hover:-translate-y-2 transition-all text-left border border-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 bg-indigo-50/50 rounded-full -mr-12 -mt-12 md:-mr-16 md:-mt-16 group-hover:bg-indigo-50 transition-colors"></div>
            <div className="w-12 h-12 md:w-16 md:h-16 bg-indigo-50 rounded-2xl md:rounded-3xl flex items-center justify-center text-2xl md:text-4xl mb-4 md:mb-10 group-hover:scale-110 transition-transform">🛡️</div>
            <h2 className="text-2xl md:text-4xl font-black text-slate-900 mb-2 md:mb-5">학부모 시작하기</h2>
            <p className="text-slate-400 font-medium text-sm md:text-lg leading-relaxed mb-6 md:mb-10 text-balance tracking-tight">자녀를 위해 안전 가이드를 설정하고<br />성장 리포트를 확인하세요.</p>
            <div className="mt-auto flex items-center gap-2 text-indigo-600 font-black text-xs md:text-sm uppercase tracking-widest">Parent Portal <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg></div>
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
          {isSignup ? '새로운 포틴에이아이 계정을 생성합니다.' : '계정에 로그인하여 계속합니다.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-slate-50 border border-slate-100 rounded-[1.5rem] px-7 py-5 text-sm font-bold focus:ring-4 focus:ring-brand-100 outline-none transition-all placeholder-slate-300" placeholder="이메일 주소"
          />
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-slate-50 border border-slate-100 rounded-[1.5rem] px-7 py-5 text-sm font-bold focus:ring-4 focus:ring-brand-100 outline-none transition-all placeholder-slate-300" placeholder="비밀번호 (6자리 이상)"
          />

          {view === 'parent-auth' && isSignup && (
            <div className="pt-2 animate-in slide-in-from-bottom-2 fade-in">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2 block">Admin Registration Code</label>
              <input type="text" required value={registrationCode} onChange={(e) => setRegistrationCode(e.target.value)}
                className="w-full bg-indigo-50 border border-indigo-100 rounded-[1.5rem] px-7 py-5 text-sm font-black text-indigo-900 focus:ring-4 focus:ring-indigo-100 outline-none transition-all placeholder-indigo-300" placeholder="등록 코드 입력"
              />
              <p className="text-[10px] text-slate-400 mt-2 px-4">관리자로부터 발급받은 등록 코드가 필요합니다.</p>
            </div>
          )}

          {view === 'student-auth' && isSignup && (
            <div className="pt-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2 block">Parent Invite Code</label>
              <input type="text" required value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                className="w-full bg-brand-50 border border-brand-100 rounded-[1.5rem] px-7 py-5 text-xl font-black text-brand-900 tracking-[0.3em] focus:ring-4 focus:ring-brand-100 outline-none transition-all uppercase placeholder-brand-200" placeholder="A1B2C3"
              />
            </div>
          )}

          {isSignup && (
            <div className="space-y-3 pt-2">
              <label className="flex items-center gap-3 px-2 cursor-pointer group">
                <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} className="w-5 h-5 rounded-lg border-slate-300 text-brand-900 focus:ring-brand-500" />
                <span className="text-xs font-bold text-slate-500 group-hover:text-slate-800 transition-colors">
                  <span className="underline underline-offset-2" onClick={(e) => { e.preventDefault(); setShowTerms(true); }}>서비스 이용약관</span>에 동의합니다. (필수)
                </span>
              </label>
              <label className="flex items-center gap-3 px-2 cursor-pointer group">
                <input type="checkbox" checked={privacyAccepted} onChange={(e) => setPrivacyAccepted(e.target.checked)} className="w-5 h-5 rounded-lg border-slate-300 text-brand-900 focus:ring-brand-500" />
                <span className="text-xs font-bold text-slate-500 group-hover:text-slate-800 transition-colors">
                  <span className="underline underline-offset-2" onClick={(e) => { e.preventDefault(); setShowPrivacy(true); }}>개인정보 수집 및 이용</span>에 동의합니다. (필수)
                </span>
              </label>
              <p className="text-[10px] text-slate-400 px-2 mt-1">
                * 만 14세 미만 가입 시 법정대리인의 동의가 필요합니다.
              </p>
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

      <TermsModal isOpen={showTerms} onClose={() => setShowTerms(false)} title="서비스 이용약관" content={termsContent} />
      <TermsModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} title="개인정보 처리방침" content={privacyContent} />
    </div>
  );
};

export default Auth;

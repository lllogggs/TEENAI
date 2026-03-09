import React, { useEffect, useMemo, useState } from 'react';
import { UserRole } from '../types';
import TermsModal from './TermsModal';
import { ForteenLogo } from './Icons';

interface AuthProps {
  onLogin: (email: string, password: string, role: UserRole, inviteCode?: string, isSignup?: boolean) => Promise<void>;
  onSocialLogin: (provider: 'google' | 'apple', role: UserRole, isSignup: boolean) => Promise<void>;
  loading: boolean;
}

const Auth: React.FC<AuthProps> = ({ onLogin, onSocialLogin, loading }) => {
  const [view, setView] = useState<'selection' | 'email-auth'>('selection');
  const [role, setRole] = useState<UserRole>(UserRole.STUDENT);
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [registrationCode, setRegistrationCode] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const hasAcceptedRequiredPolicies = useMemo(() => termsAccepted && privacyAccepted, [termsAccepted, privacyAccepted]);
  const validateEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  useEffect(() => {
    const focusHandler = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 180);
      }
    };
    window.addEventListener('focusin', focusHandler);
    return () => window.removeEventListener('focusin', focusHandler);
  }, []);

  const resetFields = () => {
    setEmail(''); setPassword(''); setInviteCode(''); setRegistrationCode('');
    setTermsAccepted(false); setPrivacyAccepted(false);
  };

  const goBack = () => { setView('selection'); resetFields(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) return alert('올바른 이메일 주소를 입력해주세요.');
    if (password.length < 6) return alert('비밀번호는 6자리 이상이어야 합니다.');

    if (isSignup) {
      if (!hasAcceptedRequiredPolicies) return alert('이용약관 및 개인정보처리방침에 동의해주세요.');
      if (role === UserRole.PARENT && !registrationCode) return alert('관리자 등록 코드가 필요합니다.');
      if (role === UserRole.STUDENT && inviteCode.length < 6) return alert('올바른 초대 코드를 입력해주세요.');
    }

    await onLogin(email, password, role, role === UserRole.PARENT ? registrationCode : inviteCode, isSignup);
  };

  const termsContent = <div className="space-y-3"><p><strong>제1조 (목적)</strong><br />본 약관은 포틴AI(이하 "회사")가 제공하는 인공지능 채팅 서비스(이하 "서비스")의 이용 조건 및 절차를 규정합니다.</p></div>;
  const privacyContent = <div className="space-y-3"><p><strong>1. 수집하는 개인정보 항목</strong><br />이메일, 비밀번호, 이름, 대화 내용, 심리 분석 데이터, 서비스 이용 기록</p></div>;

  const emailText = isSignup ? 'e-mail로 가입' : 'e-mail로 로그인';
  const googleText = isSignup ? '구글 계정으로 가입' : '구글 계정으로 로그인';
  const appleText = isSignup ? '애플 계정으로 가입' : '애플 계정으로 로그인';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-100 flex items-center justify-center p-5">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 px-6 py-7">
        <div className="text-center mb-5"><ForteenLogo className="mx-auto h-10 w-auto" /></div>

        {view === 'selection' ? (
          <>
            <p className="text-center text-sm text-slate-500 mb-4">{isSignup ? '처음이시군요. 간편하게 시작해보세요.' : '다시 오신 걸 환영해요.'}</p>
            <div className="space-y-2.5">
              <button onClick={() => setView('email-auth')} className="w-full bg-brand-900 text-white font-black py-3.5 rounded-2xl">{emailText}</button>
              <button onClick={() => onSocialLogin('google', role, isSignup)} disabled={loading} className="w-full border border-slate-200 py-3.5 rounded-2xl font-bold text-slate-700">{googleText}</button>
              <button onClick={() => onSocialLogin('apple', role, isSignup)} disabled={loading} className="w-full border border-slate-200 py-3.5 rounded-2xl font-bold text-slate-700">{appleText}</button>
            </div>
            <div className="mt-4 flex items-center justify-center gap-2 text-xs">
              <button onClick={() => setRole(UserRole.STUDENT)} className={`px-3 py-1.5 rounded-full border ${role===UserRole.STUDENT?'bg-brand-50 border-brand-200 text-brand-900':'border-slate-200 text-slate-500'}`}>학생</button>
              <button onClick={() => setRole(UserRole.PARENT)} className={`px-3 py-1.5 rounded-full border ${role===UserRole.PARENT?'bg-brand-50 border-brand-200 text-brand-900':'border-slate-200 text-slate-500'}`}>학부모</button>
            </div>
            <div className="mt-5 text-center">
              <button onClick={() => { setIsSignup(!isSignup); resetFields(); }} className="text-xs font-black text-slate-400 underline underline-offset-4">{isSignup ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원가입'}</button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <button type="button" onClick={goBack} className="text-xs text-slate-400">← 돌아가기</button>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3" placeholder="이메일" />
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3" placeholder="비밀번호" />
            {isSignup && role === UserRole.PARENT && <input type="text" required value={registrationCode} onChange={(e)=>setRegistrationCode(e.target.value)} className="w-full bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3" placeholder="등록 코드 입력" />}
            {isSignup && role === UserRole.STUDENT && <input type="text" required value={inviteCode} onChange={(e)=>setInviteCode(e.target.value.toUpperCase())} className="w-full bg-brand-50 border border-brand-100 rounded-2xl px-4 py-3 uppercase" placeholder="초대 코드" />}

            {isSignup && <div className="space-y-2 pt-1">
              <button type="button" onClick={() => setShowTerms(true)} className="w-full text-left px-3 py-2 border rounded-xl text-xs">서비스 이용약관 전체 읽기 (필수)</button>
              <button type="button" onClick={() => setShowPrivacy(true)} className="w-full text-left px-3 py-2 border rounded-xl text-xs">개인정보 처리방침 전체 읽기 (필수)</button>
            </div>}
            <button type="submit" disabled={loading || (isSignup && !hasAcceptedRequiredPolicies)} className="w-full bg-brand-900 text-white font-black py-3.5 rounded-2xl">{isSignup ? '가입하고 시작하기' : '로그인'}</button>
          </form>
        )}
      </div>

      <TermsModal isOpen={showTerms} onClose={() => setShowTerms(false)} onConfirm={() => setTermsAccepted(true)} title="서비스 이용약관" content={termsContent} requireScrollToConfirm />
      <TermsModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} onConfirm={() => setPrivacyAccepted(true)} title="개인정보 처리방침" content={privacyContent} requireScrollToConfirm />
    </div>
  );
};

export default Auth;

import React, { useEffect, useMemo, useState } from 'react';
import { UserRole } from '../types';
import TermsModal from './TermsModal';
import { ForteenLogo } from './Icons';

interface AuthProps {
  onLogin: (
    email: string,
    password: string,
    role: UserRole,
    inviteCode?: string,
    isSignup?: boolean,
    metadata?: { nickname?: string; birthYear?: string; parentalConsent?: boolean },
  ) => Promise<void>;
  onSocialLogin: (provider: 'apple' | 'google', role: UserRole) => Promise<void>;
  loading: boolean;
}

const Auth: React.FC<AuthProps> = ({ onLogin, onSocialLogin, loading }) => {
  const [view, setView] = useState<'selection' | 'parent-auth' | 'student-auth'>('selection');
  const [isSignup, setIsSignup] = useState(false);
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [registrationCode, setRegistrationCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [parentConsent, setParentConsent] = useState(false);

  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const validateEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const hasAcceptedRequiredPolicies = useMemo(() => termsAccepted && privacyAccepted, [termsAccepted, privacyAccepted]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOffline) {
      alert('네트워크 연결이 불안정합니다. 연결을 확인해 주세요.');
      return;
    }
    if (!validateEmail(email)) return alert('올바른 이메일 주소를 입력해주세요.');
    if (password.length < 6) return alert('비밀번호는 6자리 이상이어야 합니다.');

    if (isSignup) {
      if (!hasAcceptedRequiredPolicies) return alert('이용약관 및 개인정보처리방침에 동의해주세요.');
      if (view === 'parent-auth' && !registrationCode) return alert('관리자 등록 코드가 필요합니다.');
      if (view === 'student-auth' && inviteCode.length < 6) return alert('올바른 초대 코드를 입력해주세요.');
      if (view === 'student-auth') {
        if (!nickname.trim()) return alert('닉네임을 입력해주세요.');
        if (!/^\d{4}$/.test(birthYear)) return alert('출생 연도를 4자리로 입력해주세요.');
        if (!parentConsent) return alert('법정대리인(학부모) 동의 확인이 필요합니다.');
      }
    }

    if (view === 'parent-auth') {
      await onLogin(email, password, UserRole.PARENT, isSignup ? registrationCode : undefined, isSignup);
    } else {
      await onLogin(email, password, UserRole.STUDENT, inviteCode, isSignup, {
        nickname,
        birthYear,
        parentalConsent: parentConsent,
      });
    }
  };

  const goBack = () => {
    setView('selection');
    setEmail('');
    setPassword('');
    setInviteCode('');
    setRegistrationCode('');
    setNickname('');
    setBirthYear('');
    setParentConsent(false);
    setIsSignup(false);
    setTermsAccepted(false);
    setPrivacyAccepted(false);
  };

  const termsContent = <p>서비스 이용약관 전체 확인 후 동의해주세요.</p>;
  const privacyContent = <p>개인정보 처리방침 전체 확인 후 동의해주세요.</p>;

  if (view === 'selection') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full bg-white border border-slate-100 rounded-3xl p-8">
          <div className="flex items-center gap-3 mb-8"><ForteenLogo className="w-12 h-12" /><h1 className="font-black text-2xl">포틴AI</h1></div>
          <div className="space-y-3">
            <button onClick={() => setView('student-auth')} className="w-full bg-brand-900 text-white py-4 rounded-2xl font-black">학생 시작하기</button>
            <button onClick={() => setView('parent-auth')} className="w-full border border-slate-200 py-4 rounded-2xl font-black">학부모 시작하기</button>
          </div>
        </div>
      </div>
    );
  }

  const role = view === 'parent-auth' ? UserRole.PARENT : UserRole.STUDENT;

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full bg-white border border-slate-100 rounded-3xl p-8">
        <button onClick={goBack} className="text-xs font-bold text-slate-500 mb-4">← 뒤로</button>
        <h2 className="text-2xl font-black mb-2">{role === UserRole.PARENT ? 'Parent' : 'Student'} {isSignup ? 'Signup' : 'Login'}</h2>
        {isOffline && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-700">네트워크 연결이 불안정합니다. 연결을 확인해 주세요.</div>}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border rounded-xl px-4 py-3" placeholder="이메일" />
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border rounded-xl px-4 py-3" placeholder="비밀번호" />
          {view === 'parent-auth' && isSignup && <input type="text" required value={registrationCode} onChange={(e) => setRegistrationCode(e.target.value)} className="w-full border rounded-xl px-4 py-3" placeholder="관리자 등록 코드" />}
          {view === 'student-auth' && isSignup && (
            <>
              <input type="text" required value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} className="w-full border rounded-xl px-4 py-3" placeholder="초대 코드" />
              <input type="text" required value={nickname} onChange={(e) => setNickname(e.target.value)} className="w-full border rounded-xl px-4 py-3" placeholder="닉네임" />
              <input type="number" required value={birthYear} onChange={(e) => setBirthYear(e.target.value)} className="w-full border rounded-xl px-4 py-3" placeholder="출생 연도" />
              <label className="flex gap-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={parentConsent} onChange={(e) => setParentConsent(e.target.checked)} />법정대리인(학부모) 동의 확인 (필수)</label>
            </>
          )}

          {isSignup && (
            <div className="space-y-2">
              <button type="button" onClick={() => setShowTerms(true)} className="w-full border rounded-xl px-4 py-3 text-xs font-bold">서비스 이용약관 전체 읽기 (필수)</button>
              <button type="button" onClick={() => setShowPrivacy(true)} className="w-full border rounded-xl px-4 py-3 text-xs font-bold">개인정보 처리방침 전체 읽기 (필수)</button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={loading || isOffline} onClick={() => onSocialLogin('apple', role)} className="rounded-xl border py-3 text-xs font-black disabled:opacity-50">Apple 로그인</button>
            <button type="button" disabled={loading || isOffline} onClick={() => onSocialLogin('google', role)} className="rounded-xl border py-3 text-xs font-black disabled:opacity-50">Google 로그인</button>
          </div>

          <button type="submit" disabled={loading || (isSignup && !hasAcceptedRequiredPolicies)} className="w-full bg-brand-900 text-white py-4 rounded-2xl font-black disabled:bg-slate-300">{loading ? 'Processing...' : (isSignup ? '가입하고 시작하기' : '로그인')}</button>
        </form>

        <button onClick={() => { setIsSignup(!isSignup); setTermsAccepted(false); setPrivacyAccepted(false); }} className="w-full mt-4 text-xs underline text-slate-500">
          {isSignup ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원가입'}
        </button>
      </div>

      <TermsModal isOpen={showTerms} onClose={() => setShowTerms(false)} onConfirm={() => setTermsAccepted(true)} title="서비스 이용약관" content={termsContent} requireScrollToConfirm />
      <TermsModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} onConfirm={() => setPrivacyAccepted(true)} title="개인정보 처리방침" content={privacyContent} requireScrollToConfirm />
    </div>
  );
};

export default Auth;

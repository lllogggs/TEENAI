import React, { useState } from 'react';
import { UserRole } from '../types';

interface StudentOnboardingPayload {
  nickname: string;
  birthYear: string;
  parentInviteCode: string;
  parentalConsent: boolean;
}

interface ParentOnboardingPayload {
  registrationCode: string;
}

interface SocialOnboardingProps {
  role: UserRole;
  email: string;
  loading: boolean;
  onSubmit: (payload: StudentOnboardingPayload | ParentOnboardingPayload) => Promise<void>;
  onLogout: () => Promise<void> | void;
}

const SocialOnboarding: React.FC<SocialOnboardingProps> = ({ role, email, loading, onSubmit, onLogout }) => {
  const [nickname, setNickname] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [parentInviteCode, setParentInviteCode] = useState('');
  const [parentalConsent, setParentalConsent] = useState(false);
  const [registrationCode, setRegistrationCode] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (role === UserRole.STUDENT) {
      if (!nickname.trim()) return alert('닉네임을 입력해주세요.');
      if (!/^\d{4}$/.test(birthYear)) return alert('출생 연도를 4자리로 입력해주세요.');
      if (parentInviteCode.trim().length < 6) return alert('학부모 코드를 올바르게 입력해주세요.');
      if (!parentalConsent) return alert('법정대리인(학부모) 동의 확인이 필요합니다.');

      await onSubmit({
        nickname: nickname.trim(),
        birthYear,
        parentInviteCode: parentInviteCode.trim().toUpperCase(),
        parentalConsent,
      });
      return;
    }

    if (!registrationCode.trim()) return alert('초대 코드를 입력해주세요.');

    await onSubmit({ registrationCode: registrationCode.trim() });
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full bg-white border border-slate-100 rounded-3xl p-8">
        <h1 className="text-2xl font-black mb-2">추가 프로필 입력</h1>
        <p className="text-sm text-slate-600 mb-6 break-all">{email}</p>
        <p className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4">
          필수 정보를 완료해야 서비스를 이용할 수 있습니다.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          {role === UserRole.STUDENT ? (
            <>
              <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} className="w-full border rounded-xl px-4 py-3" placeholder="닉네임" />
              <input type="number" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} className="w-full border rounded-xl px-4 py-3" placeholder="출생 연도 (YYYY)" />
              <input type="text" value={parentInviteCode} onChange={(e) => setParentInviteCode(e.target.value.toUpperCase())} className="w-full border rounded-xl px-4 py-3" placeholder="자녀-학부모 코드" />
              <label className="flex gap-2 text-xs font-bold text-slate-600">
                <input type="checkbox" checked={parentalConsent} onChange={(e) => setParentalConsent(e.target.checked)} />
                법정대리인(학부모) 동의 확인 (필수)
              </label>
            </>
          ) : (
            <input type="text" value={registrationCode} onChange={(e) => setRegistrationCode(e.target.value)} className="w-full border rounded-xl px-4 py-3" placeholder="초대 코드 입력" />
          )}

          <button type="submit" disabled={loading} className="w-full bg-brand-900 text-white py-4 rounded-2xl font-black disabled:bg-slate-300">
            {loading ? '처리 중...' : '완료하고 시작하기'}
          </button>
        </form>

        <button onClick={onLogout} className="w-full mt-4 text-xs underline text-slate-500">다른 계정으로 로그인</button>
      </div>
    </div>
  );
};

export default SocialOnboarding;

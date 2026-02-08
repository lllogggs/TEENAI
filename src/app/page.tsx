'use client';

import { useEffect, useMemo, useState } from 'react';
import ParentDashboard from '@/components/ParentDashboard';
import StudentChat from '@/components/StudentChat';
import { supabase } from '@/utils/supabase/client';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'parent';
}

export default function Home() {
  const [role, setRole] = useState<'student' | 'parent' | ''>('');
  const [email, setEmail] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [step, setStep] = useState<'landing' | 'login'>('landing');

  useEffect(() => {
    if (!sessionId) {
      setSessionId(crypto.randomUUID());
    }
  }, [sessionId]);

  const handleGenerateCode = () => {
    if (!email.trim()) {
      setStatus('부모 이메일을 입력해주세요.');
      return;
    }

    const code = `${Math.floor(100000 + Math.random() * 900000)}`;
    setGeneratedCode(code);
    setStatus('인증코드가 발급되었습니다. 학생에게 전달해주세요.');
  };

  const handleLogin = async () => {
    if (!role) {
      setStatus('역할을 선택해주세요.');
      return;
    }
    if (!email.trim()) {
      setStatus('이메일을 입력해주세요.');
      return;
    }
    if (role === 'parent' && !generatedCode) {
      setStatus('먼저 인증코드를 발급해주세요.');
      return;
    }
    if (role === 'student') {
      if (!authCode.trim()) {
        setStatus('부모님께 받은 인증코드를 입력해주세요.');
        return;
      }
      if (!generatedCode || authCode.trim() !== generatedCode) {
        setStatus('인증코드가 일치하지 않습니다.');
        return;
      }
    }
    if (!supabase) {
      setStatus('Supabase 연결이 설정되지 않았습니다. .env.local을 확인해주세요.');
      return;
    }

    const userId = crypto.randomUUID();
    const displayName = email.trim();
    setUser({ id: userId, name: displayName, email: email.trim(), role });
    setStatus('프로필이 생성되었습니다. Supabase에 동기화 중...');

    await supabase.from('profiles').upsert({ id: userId, name: displayName, email: email.trim(), role });

    if (role === 'student') {
      const { data } = await supabase
        .from('sessions')
        .insert({ id: sessionId || crypto.randomUUID(), user_id: userId, title: `${displayName}님의 학습 세션` })
        .select('id')
        .single();

      if (data?.id) {
        setSessionId(data.id);
      }
    }

    setStatus('로그인 완료! 대시보드를 불러옵니다.');
  };

  const headerTitle = useMemo(() => {
    if (!user) return 'TEENAI 로그인';
    return user.role === 'student' ? `${user.name} 학생 전용 채팅` : `${user.name} 보호자 대시보드`;
  }, [user]);

  return (
    <main className="container">
      {!user && step === 'landing' && (
        <section className="auth-selection">
          <header className="auth-selection-header">
            <h1>TEENAI</h1>
            <p>청소년을 위한 가장 안전한 AI 성장의 공간</p>
          </header>

          <div className="auth-selection-grid">
            <button
              type="button"
              className="auth-card auth-card-student"
              onClick={() => {
                setRole('student');
                setStep('login');
              }}
            >
              <span className="auth-card-orbit" aria-hidden="true" />
              <span className="auth-card-icon">🎓</span>
              <h2>학생 시작하기</h2>
              <p>부모님께 받은 인증코드를 입력하고 멘토와 대화를 시작하세요.</p>
              <span className="auth-card-cta">Start Now →</span>
            </button>

            <button
              type="button"
              className="auth-card auth-card-parent"
              onClick={() => {
                setRole('parent');
                setStep('login');
              }}
            >
              <span className="auth-card-orbit" aria-hidden="true" />
              <span className="auth-card-icon">🛡️</span>
              <h2>학부모 시작하기</h2>
              <p>부모 이메일을 등록하고 인증코드를 발급해 자녀와 연결하세요.</p>
              <span className="auth-card-cta">Parent Portal →</span>
            </button>
          </div>
        </section>
      )}

      {(user || step === 'login') && (
        <header className="glass-nav auth-title">
          <div>
            <p>AI 멘토와 보호자 리포트가 함께 있는 TEENAI</p>
            <h1>{headerTitle}</h1>
          </div>
          {user && <span>{user.role === 'student' ? '학생 모드' : '보호자 모드'}</span>}
        </header>
      )}

      {!user && step === 'login' && (
        <section className="auth-panel">
          <button type="button" className="auth-back" onClick={() => setStep('landing')}>
            ← 시작 화면으로 돌아가기
          </button>
          <h2>{role === 'parent' ? 'Parent Login' : 'Student Login'}</h2>
          <p>이메일만 입력해 부모-학생 계정을 연결하세요.</p>

          <div className="auth-role-toggle">
            <button
              type="button"
              className={role === 'student' ? 'active' : ''}
              onClick={() => setRole('student')}
            >
              학생으로 사용
            </button>
            <button
              type="button"
              className={role === 'parent' ? 'active' : ''}
              onClick={() => setRole('parent')}
            >
              보호자로 보기
            </button>
          </div>

          <div className="auth-form-grid">
            <label>
              <span>{role === 'parent' ? '부모 이메일' : '학생 이메일'}</span>
              <input
                placeholder={role === 'parent' ? 'parent@example.com' : 'student@example.com'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
              />
            </label>
            {role === 'student' && (
              <label>
                <span>인증코드</span>
                <input
                  placeholder="부모님께 받은 6자리 코드"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  type="text"
                  inputMode="numeric"
                />
              </label>
            )}
          </div>

          {role === 'parent' && (
            <div className="auth-code-row">
              <button type="button" onClick={handleGenerateCode}>
                인증코드 발급
              </button>
              {generatedCode && <span>인증코드: {generatedCode}</span>}
            </div>
          )}

          <button
            className="auth-submit"
            type="button"
            onClick={handleLogin}
          >
            {role === 'parent' ? '보호자 대시보드 열기' : '학생 채팅 시작하기'}
          </button>
          {status && <p className="auth-status">{status}</p>}
        </section>
      )}

      {user && role === 'student' && (
        <StudentChat sessionId={sessionId} userId={user.id} studentName={user.name} />
      )}

      {user && role === 'parent' && <ParentDashboard parentName={user.name} />}
    </main>
  );
}

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
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [step, setStep] = useState<'landing' | 'login'>('landing');

  useEffect(() => {
    if (!sessionId) {
      setSessionId(crypto.randomUUID());
    }
  }, [sessionId]);

  const handleLogin = async () => {
    if (!role || !name.trim()) {
      setStatus('역할과 이름을 입력해주세요.');
      return;
    }
    if (!supabase) {
      setStatus('Supabase 연결이 설정되지 않았습니다. .env.local을 확인해주세요.');
      return;
    }

    const userId = crypto.randomUUID();
    setUser({ id: userId, name: name.trim(), email, role });
    setStatus('프로필이 생성되었습니다. Supabase에 동기화 중...');

    await supabase.from('profiles').upsert({ id: userId, name: name.trim(), email, role });

    if (role === 'student') {
      const { data } = await supabase
        .from('sessions')
        .insert({ id: sessionId || crypto.randomUUID(), user_id: userId, title: `${name.trim()}님의 학습 세션` })
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
        <section className="landing">
          <header className="landing-header">
            <h1 className="landing-title">TEENAI</h1>
            <p className="landing-subtitle">청소년을 위한 안전하고 똑똑한 AI 멘토링 서비스</p>
          </header>

          <div className="landing-grid">
            <button
              type="button"
              className="landing-card primary"
              onClick={() => {
                setRole('student');
                setStep('login');
              }}
            >
              <span className="landing-card-icon" aria-hidden="true">
                🎓
              </span>
              <h2 className="landing-card-title">학생 시작하기</h2>
              <p className="landing-card-description">부모님께 받은 코드를 입력하고 나만의 AI 멘토를 만나보세요.</p>
            </button>

            <button
              type="button"
              className="landing-card"
              onClick={() => {
                setRole('parent');
                setStep('login');
              }}
            >
              <span className="landing-card-icon" aria-hidden="true">
                🛡️
              </span>
              <h2 className="landing-card-title">학부모 시작하기</h2>
              <p className="landing-card-description">회원가입 후 코드를 생성하여 자녀와 연결하세요.</p>
            </button>
          </div>
        </section>
      )}

      {(user || step === 'login') && (
        <header className="glass-nav" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: 0 }}>AI 멘토와 보호자 리포트가 함께 있는 TEENAI</p>
            <h1 style={{ margin: '0.35rem 0', fontSize: '2rem', fontWeight: 800, color: 'var(--brand-900)' }}>{headerTitle}</h1>
          </div>
          {user && (
            <span style={{ padding: '0.4rem 0.75rem', background: 'var(--brand-50)', borderRadius: 999, fontSize: '0.9rem', fontWeight: 700, color: 'var(--brand-900)' }}>
              {user.role === 'student' ? '학생 모드' : '보호자 모드'}
            </span>
          )}
        </header>
      )}

      {!user && step === 'login' && (
        <section className="premium-card" style={{ marginBottom: '1.5rem' }}>
          <button type="button" className="back-button button-base" onClick={() => setStep('landing')}>
            ← 시작 화면으로 돌아가기
          </button>
          <h2 style={{ marginTop: 0 }}>로그인</h2>
          <p style={{ color: 'var(--muted)', marginTop: 0 }}>역할을 선택하고 이름과 이메일을 입력하세요.</p>

          <div style={{ display: 'flex', gap: '1rem', margin: '1rem 0' }}>
            <button
              className="button-base"
              style={{ flex: 1, padding: '0.95rem', borderRadius: 16, border: role === 'student' ? '2px solid var(--brand-500)' : '1px solid rgba(148, 163, 184, 0.3)', background: 'var(--brand-50)', color: 'var(--brand-900)', fontWeight: 700 }}
              onClick={() => setRole('student')}
            >
              학생으로 사용
            </button>
            <button
              className="button-base"
              style={{ flex: 1, padding: '0.95rem', borderRadius: 16, border: role === 'parent' ? '2px solid var(--brand-500)' : '1px solid rgba(148, 163, 184, 0.3)', background: 'var(--brand-50)', color: 'var(--brand-900)', fontWeight: 700 }}
              onClick={() => setRole('parent')}
            >
              보호자로 보기
            </button>
          </div>

          <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <span>이름</span>
              <input
                style={{ padding: '0.9rem 1rem', borderRadius: 16, border: '1px solid rgba(148, 163, 184, 0.35)', background: '#ffffff', color: 'inherit' }}
                placeholder="예: 홍길동"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <span>이메일 (선택)</span>
              <input
                style={{ padding: '0.9rem 1rem', borderRadius: 16, border: '1px solid rgba(148, 163, 184, 0.35)', background: '#ffffff', color: 'inherit' }}
                placeholder="parent@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
              />
            </label>
          </div>

          <button
            className="button-base button-primary"
            style={{ marginTop: '1rem' }}
            onClick={handleLogin}
          >
            {role === 'parent' ? '보호자 대시보드 열기' : '학생 채팅 시작하기'}
          </button>
          {status && <p style={{ color: 'var(--muted)', marginTop: '0.75rem' }}>{status}</p>}
        </section>
      )}

      {user && role === 'student' && (
        <StudentChat sessionId={sessionId} userId={user.id} studentName={user.name} />
      )}

      {user && role === 'parent' && <ParentDashboard parentName={user.name} />}
    </main>
  );
}

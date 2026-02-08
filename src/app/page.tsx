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
    if (!user) return 'TEENAI 새 학습 공간';
    return user.role === 'student' ? `${user.name} 학생 전용 채팅` : `${user.name} 보호자 대시보드`;
  }, [user]);

  return (
    <main className="container">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: 0 }}>AI 멘토와 보호자 리포트가 함께 있는 TEENAI</p>
          <h1 style={{ margin: '0.35rem 0', fontSize: '2rem' }}>{headerTitle}</h1>
        </div>
        {user && (
          <span style={{ padding: '0.4rem 0.75rem', background: 'rgba(255,255,255,0.06)', borderRadius: 12, fontSize: '0.9rem' }}>
            {user.role === 'student' ? '학생 모드' : '보호자 모드'}
          </span>
        )}
      </header>

      {!user && (
        <section className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ marginTop: 0 }}>로그인</h2>
          <p style={{ color: 'var(--muted)', marginTop: 0 }}>역할을 선택하고 이름과 이메일을 입력하세요.</p>

          <div style={{ display: 'flex', gap: '1rem', margin: '1rem 0' }}>
            <button
              style={{ flex: 1, padding: '0.9rem', borderRadius: 12, border: role === 'student' ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'inherit' }}
              onClick={() => setRole('student')}
            >
              학생으로 사용
            </button>
            <button
              style={{ flex: 1, padding: '0.9rem', borderRadius: 12, border: role === 'parent' ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'inherit' }}
              onClick={() => setRole('parent')}
            >
              보호자로 보기
            </button>
          </div>

          <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <span>이름</span>
              <input
                style={{ padding: '0.85rem', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'inherit' }}
                placeholder="예: 홍길동"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <span>이메일 (선택)</span>
              <input
                style={{ padding: '0.85rem', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'inherit' }}
                placeholder="parent@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
              />
            </label>
          </div>

          <button
            style={{ marginTop: '1rem', padding: '0.95rem 1.25rem', borderRadius: 12, border: 'none', background: 'linear-gradient(90deg, #7c3aed, #a855f7)', color: 'white', fontWeight: 700, fontSize: '1rem' }}
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

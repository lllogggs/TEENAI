'use client';

import { useState } from 'react';
import ParentDashboard from '@/components/ParentDashboard';
import StudentChat from '@/components/StudentChat';
import { supabase } from '@/utils/supabase/client';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'parent';
  access_code?: string;
}

type Role = 'student' | 'parent';

export default function Home() {
  const [role, setRole] = useState<Role | ''>('');
  const [email, setEmail] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [step, setStep] = useState<'landing' | 'login'>('landing');

  const handleGenerateCode = () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedCode(code);
    setStatus('인증코드가 발급되었습니다. 학생에게 알려주세요!');
  };

  const findOrCreateSession = async (userId: string, accessCode: string) => {
    if (!supabase) return '';

    const { data: existingSessions, error: sessionError } = await supabase
      .from('sessions')
      .select('id')
      .eq('access_code', accessCode)
      .order('created_at', { ascending: false })
      .limit(1);

    if (sessionError) {
      console.error('세션 조회 에러:', sessionError);
    }

    if (existingSessions && existingSessions.length > 0) {
      setSessionId(existingSessions[0].id);
      return existingSessions[0].id;
    }

    const newSessionId = crypto.randomUUID();
    const { error: insertError } = await supabase.from('sessions').insert({
      id: newSessionId,
      user_id: userId,
      title: `${email.split('@')[0]}의 세션`,
      access_code: accessCode,
    });

    if (insertError) {
      console.error('세션 생성 에러:', insertError);
    }

    setSessionId(newSessionId);
    return newSessionId;
  };

  const handleLogin = async () => {
    if (!email.trim()) return setStatus('이메일을 입력해주세요.');
    if (!role) return setStatus('역할을 선택해주세요.');

    const finalAccessCode = role === 'parent' ? generatedCode : authCode;

    if (role === 'parent' && !generatedCode) return setStatus('먼저 인증코드를 발급해주세요.');
    if (role === 'student' && !authCode) return setStatus('인증코드를 입력해주세요.');

    if (!supabase) return setStatus('Supabase 연결 오류.');

    setStatus('입장 중...');

    const userId = crypto.randomUUID();
    const displayName = email.split('@')[0];

    let activeSessionId = sessionId;
    if (role === 'student') {
      activeSessionId = await findOrCreateSession(userId, finalAccessCode);
    }

    const { error } = await supabase.from('profiles').upsert({
      id: userId,
      name: displayName,
      email,
      role: role as Role,
      access_code: finalAccessCode,
    });

    if (error) {
      console.error('프로필 저장 에러:', error);
      return setStatus('로그인 실패. 다시 시도해주세요.');
    }

    if (role === 'parent') {
      await supabase.from('access_codes').upsert({
        code: finalAccessCode,
        creator_role: 'parent',
      });
    }

    if (role === 'student' && activeSessionId) {
      await supabase.from('sessions').upsert({
        id: activeSessionId,
        user_id: userId,
        title: `${displayName}의 세션`,
        access_code: finalAccessCode,
      });
    }

    setUser({
      id: userId,
      name: displayName,
      email,
      role: role as Role,
      access_code: finalAccessCode,
    });
  };

  return (
    <main className="container">
      {!user && step === 'landing' && (
        <section className="auth-selection">
          <h1>TEENAI</h1>
          <div className="auth-selection-grid">
            <button
              className="auth-card auth-card-student"
              onClick={() => {
                setRole('student');
                setStep('login');
              }}
            >
              <h2>🎓 학생 시작하기</h2>
              <p>부모님께 받은 코드로 입장하세요.</p>
            </button>
            <button
              className="auth-card auth-card-parent"
              onClick={() => {
                setRole('parent');
                setStep('login');
              }}
            >
              <h2>🛡️ 부모님 시작하기</h2>
              <p>코드를 만들고 자녀와 연결하세요.</p>
            </button>
          </div>
        </section>
      )}

      {!user && step === 'login' && (
        <section className="auth-panel">
          <button onClick={() => setStep('landing')}>← 뒤로</button>
          <h2>{role === 'parent' ? '부모님 입장' : '학생 입장'}</h2>

          <label>
            이메일
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </label>

          {role === 'parent' && (
            <div className="auth-code-row">
              <button onClick={handleGenerateCode}>코드 발급</button>
              {generatedCode && <strong>{generatedCode}</strong>}
            </div>
          )}

          {role === 'student' && (
            <label>
              인증코드 (부모님께 받은 6자리)
              <input
                type="text"
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                placeholder="123456"
              />
            </label>
          )}

          <button className="auth-submit" onClick={handleLogin}>
            입장하기
          </button>
          <p>{status}</p>
        </section>
      )}

      {user && role === 'student' && (
        <StudentChat
          initialSessionId={sessionId}
          userId={user.id}
          studentName={user.name}
          accessCode={user.access_code}
        />
      )}
      {user && role === 'parent' && (
        <ParentDashboard parentName={user.name} accessCode={user.access_code} />
      )}
    </main>
  );
}

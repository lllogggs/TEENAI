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
  access_code?: string;
}

export default function Home() {
  const [role, setRole] = useState<'student' | 'parent' | ''>('');
  const [email, setEmail] = useState('');
  const [authCode, setAuthCode] = useState(''); // 학생이 입력하는 코드
  const [generatedCode, setGeneratedCode] = useState(''); // 부모가 만든 코드
  const [user, setUser] = useState<UserProfile | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [step, setStep] = useState<'landing' | 'login'>('landing');

  // 세션 ID 초기화
  useEffect(() => {
    if (!sessionId) setSessionId(crypto.randomUUID());
  }, [sessionId]);

  // 기존 세션 복구 로직 (인증코드 기반)
  const restoreSession = async (userId: string, accessCode: string) => {
    if (!supabase) return sessionId;
    
    // 1. 해당 코드로 생성된 가장 최근 세션 조회
    const { data: existingSessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('access_code', accessCode)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingSessions && existingSessions.length > 0) {
      setSessionId(existingSessions[0].id);
      return existingSessions[0].id;
    }
    
    // 2. 없으면 현재 sessionId 유지
    return sessionId;
  };

  // 부모: 인증코드 생성 함수
  const handleGenerateCode = () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedCode(code);
    setStatus('인증코드가 발급되었습니다. 학생에게 알려주세요!');
  };

  // 로그인 및 DB 저장 함수
  const handleLogin = async () => {
    if (!email.trim()) return setStatus('이메일을 입력해주세요.');
    if (!role) return setStatus('역할을 선택해주세요.');
    
    // 코드 검증 로직
    const finalAccessCode = role === 'parent' ? generatedCode : authCode;

    if (role === 'parent' && !generatedCode) return setStatus('먼저 인증코드를 발급해주세요.');
    if (role === 'student' && !authCode) return setStatus('인증코드를 입력해주세요.');
    
    if (!supabase) return setStatus('Supabase 연결 오류.');

    setStatus('입장 중...');
    
    const userId = crypto.randomUUID();
    const displayName = email.split('@')[0];

    // 0. 학생의 경우, 기존 세션이 있는지 확인하고 복구
    let activeSessionId = sessionId;
    if (role === 'student') {
        const restoredId = await restoreSession(userId, finalAccessCode);
        if (restoredId) activeSessionId = restoredId;
    }

    // 1. 프로필 저장 (중요: access_code 포함!)
    const { error } = await supabase.from('profiles').upsert({
      id: userId,
      name: displayName,
      email: email,
      role: role,
      access_code: finalAccessCode
    });

    if (error) {
      console.error('프로필 저장 에러:', error);
      return setStatus('로그인 실패. 다시 시도해주세요.');
    }

    // 2. 부모면 코드 테이블에도 저장
    if (role === 'parent') {
      await supabase.from('access_codes').upsert({
        code: finalAccessCode,
        creator_role: 'parent'
      });
    }

    // 3. 학생이면 세션 생성/업데이트
    if (role === 'student') {
      await supabase.from('sessions').upsert({
        id: activeSessionId,
        user_id: userId,
        title: `${displayName}의 세션`,
        access_code: finalAccessCode
      });
    }

    // 상태 업데이트 (화면 전환)
    // [핵심 수정] role을 강제로 'student' | 'parent'로 변환하여 타입 에러 해결
    setUser({ 
        id: userId, 
        name: displayName, 
        email, 
        role: role as 'student' | 'parent', 
        access_code: finalAccessCode 
    });
  };

  const headerTitle = useMemo(() => {
    if (!user) return 'TEENAI';
    return user.role === 'student' ? `${user.name} 학생` : `${user.name} 부모님`;
  }, [user]);

  return (
    <main className="container">
      {/* 1. 랜딩 페이지 */}
      {!user && step === 'landing' && (
        <section className="auth-selection">
          <h1>TEENAI</h1>
          <div className="auth-selection-grid">
            <button className="auth-card auth-card-student" onClick={() => { setRole('student'); setStep('login'); }}>
              <h2>🎓 학생 시작하기</h2>
              <p>부모님께 받은 코드로 입장하세요.</p>
            </button>
            <button className="auth-card auth-card-parent" onClick={() => { setRole('parent'); setStep('login'); }}>
              <h2>🛡️ 부모님 시작하기</h2>
              <p>코드를 만들고 자녀와 연결하세요.</p>
            </button>
          </div>
        </section>
      )}

      {/* 2. 로그인 입력 화면 */}
      {!user && step === 'login' && (
        <section className="auth-panel">
          <button onClick={() => setStep('landing')}>← 뒤로</button>
          <h2>{role === 'parent' ? '부모님 입장' : '학생 입장'}</h2>
          
          <label>
            이메일
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
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
              <input type="text" value={authCode} onChange={(e) => setAuthCode(e.target.value)} placeholder="123456" />
            </label>
          )}

          <button className="auth-submit" onClick={handleLogin}>입장하기</button>
          <p>{status}</p>
        </section>
      )}

      {/* 3. 메인 화면 */}
      {user && role === 'student' && (
        <StudentChat sessionId={sessionId} userId={user.id} studentName={user.name} accessCode={user.access_code} />
      )}
      {user && role === 'parent' && (
        <ParentDashboard parentName={user.name} accessCode={user.access_code} />
      )}
    </main>
  );
}

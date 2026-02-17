"use client"; // Next.js 클라이언트 컴포넌트 선언

import React, { useEffect, useState } from 'react';
import { User, UserRole } from './types';
import Auth from './components/Auth';
import StudentChat from './components/StudentChat';
import ParentDashboard from './components/ParentDashboard';
// ParentSessionDetail은 ParentDashboard 내부에서 모달로 처리하므로 제거
import { isSupabaseConfigured, supabase } from './utils/supabase';

const getSignupName = (email: string) => {
  const emailPrefix = email.split('@')[0]?.trim();
  return emailPrefix || 'User';
};

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // [수정] ensureProfile 함수 (API 호출 대신 직접 DB 조회/생성 로직으로 변경 가능하지만, 일단 유지)
  const ensureProfile = async (role?: UserRole, inviteCode?: string) => {
     // ... (기존 로직 유지하되 API 경로는 Next.js API 라우트로 연결됨)
     // 만약 API를 안 쓰고 싶다면 여기서 직접 supabase.from('users').insert(...) 등을 호출해야 함.
     
     // 일단 기존 코드 유지 (Next.js로 전환 시 /api/ensure-profile 경로가 살아나므로)
     const { data } = await supabase.auth.getSession();
     const session = data.session;
     if (!session?.access_token) throw new Error('세션 만료');

     // Next.js API 호출
     const response = await fetch('/api/ensure-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ role: role === UserRole.PARENT ? 'parent' : 'student', inviteCode }),
     });
     
     const payload = await response.json();
     if (response.ok && payload?.profile) {
        setUser(payload.profile);
        return;
     }
     
     // 실패 시 DB 직접 조회 (Fallback)
     const { data: fallback } = await supabase.from('users').select('*').eq('id', session.user.id).single();
     if (fallback) {
        setUser(fallback as User);
        return;
     }
     throw new Error(payload?.error || '프로필 오류');
  };

  useEffect(() => {
    const checkSession = async () => {
      if (!isSupabaseConfigured()) { // 함수 호출로 변경
        setLoading(false);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
         // 세션이 있으면 프로필 로드 시도
         // 에러 나면 로그아웃 처리
         try {
            await ensureProfile();
         } catch(e) {
            console.error(e);
            await supabase.auth.signOut();
            setUser(null);
         }
      }
      setLoading(false);
    };
    checkSession();
  }, []);

  const handleAuth = async (email: string, password: string, role: UserRole, code?: string, isSignup?: boolean) => {
     // ... (기존 로그인/회원가입 로직 유지)
     try {
      setAuthLoading(true);
      setAuthError('');
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
            email, password, options: { data: { role, name: getSignupName(email) } }
        });
        if (error) throw error;
        if (data.session) await ensureProfile(role, code);
        else alert('가입 확인 이메일을 보냈습니다.');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) await ensureProfile(role);
      }
     } catch (e: any) {
        setAuthError(e.message);
     } finally {
        setAuthLoading(false);
     }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  if (loading) return <div className="h-screen flex items-center justify-center">로딩 중...</div>;

  if (!user) {
    return <Auth onLogin={handleAuth} loading={authLoading} />;
  }

  // [수정] 복잡한 라우팅 제거 -> 컴포넌트 교체만 수행
  if (user.role === UserRole.STUDENT) {
    return <StudentChat user={user} onLogout={handleLogout} />;
  }

  // 부모일 경우: 대시보드만 렌더링 (대시보드 내부에서 상세 보기 처리함)
  return <ParentDashboard user={user} onLogout={handleLogout} />;
}

export default App;

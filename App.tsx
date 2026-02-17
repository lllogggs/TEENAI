import React, { useEffect, useState } from 'react';
import { User, UserRole } from './types';
import Auth from './components/Auth';
import StudentChat from './components/StudentChat';
import ParentDashboard from './components/ParentDashboard';
import ParentSessionDetail from './components/ParentSessionDetail';
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
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const movePath = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  const ensureProfile = async (role?: UserRole, inviteCode?: string) => {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session?.access_token) throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.');

    const response = await fetch('/api/ensure-profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        role: role === UserRole.PARENT ? 'parent' : 'student',
        inviteCode: inviteCode?.trim() || undefined,
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (response.ok && payload?.profile) {
      setUser(payload.profile as User);
      return;
    }

    const fallback = await supabase
      .from('users')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (fallback.data) {
      setUser(fallback.data as User);
      return;
    }

    throw new Error(payload?.error || '프로필 초기화 실패, 다시 시도해 주세요.');
  };

  useEffect(() => {
    const checkSession = async () => {
      if (!isSupabaseConfigured) {
        setLoading(false);
        return;
      }

      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          await ensureProfile();
        }
      } catch (error) {
        console.error('Session bootstrap failed:', error);
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  const handleAuth = async (email: string, password: string, role: UserRole, code?: string, isSignup?: boolean) => {
    if (!isSupabaseConfigured) {
      alert('Supabase가 연결되지 않았습니다. VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY를 설정해주세요.');
      return;
    }

    try {
      setAuthLoading(true);
      setAuthError('');

      if (isSignup) {
        const normalizedInviteCode = code?.trim().toUpperCase();
        const signupName = getSignupName(email);
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              role,
              name: signupName,
            },
          },
        });

        if (authError) throw authError;
        if (!authData.user) throw new Error('가입 실패');

        if (authData.session?.user) {
          await ensureProfile(role, role === UserRole.STUDENT ? normalizedInviteCode : undefined);
          return;
        }

        alert('가입이 완료되었습니다. 이메일 확인 후 로그인해주세요. (이메일 인증 OFF 환경에서는 바로 로그인될 수 있어요.)');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        if (data.user) {
          await ensureProfile(role);
        }
      }
    } catch (err: any) {
      const message = err.message || '오류가 발생했습니다.';
      setAuthError(message);
      alert(message);
    } finally {
      setAuthLoading(false);
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setUser(null);
  };

  if (loading) {
    return <div className="h-screen flex items-center justify-center">로딩 중...</div>;
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="h-screen flex items-center justify-center p-8 text-center">
        <div>
          <h1 className="text-2xl font-bold mb-4">Supabase 연결 필요</h1>
          <p className="text-slate-500">VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY를 Vercel 환경 변수로 설정해주세요.</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        {authError && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-red-50 text-red-700 px-4 py-2 rounded-lg text-sm font-semibold z-50">{authError}</div>}
        <Auth onLogin={handleAuth} loading={authLoading} />
      </>
    );
  }

  if (user.role === UserRole.STUDENT) {
    return <StudentChat user={user} onLogout={handleLogout} />;
  }

  const sessionDetailMatch = currentPath.match(/^\/parent\/sessions\/([^/]+)$/);
  if (sessionDetailMatch) {
    return (
      <ParentSessionDetail
        user={user}
        sessionId={sessionDetailMatch[1]}
        onBack={() => movePath('/parent')}
      />
    );
  }

  return (
    <ParentDashboard
      user={user}
      onLogout={handleLogout}
      onOpenSession={(sessionId) => movePath(`/parent/sessions/${sessionId}`)}
    />
  );
}

export default App;

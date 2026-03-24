import React, { Suspense, lazy, useEffect, useState } from 'react';
import { User, UserRole } from './types';
import { isSupabaseConfigured, supabase } from './utils/supabase';
import { ensureProfileLoaded } from './services/authProfile';
import {
  DEMO_MODE_STORAGE_KEY,
  MOBILE_MESSAGE_SOURCE,
  OAUTH_BRIDGE_NONCE_KEY,
  PENDING_SOCIAL_INVITE_REQUIRED_KEY,
  PENDING_SOCIAL_ROLE_KEY,
  PENDING_SOCIAL_SIGNUP_KEY,
} from './utils/auth/constants';
import { getMissingSupabaseEnvVars, getSignupName, shouldEnableDemoMode } from './utils/auth/runtime';
import { getOAuthRedirectUrl } from './utils/auth/oauth';

const Auth = lazy(() => import('./components/Auth'));
const StudentChat = lazy(() => import('./components/StudentChat'));
const ParentDashboard = lazy(() => import('./components/ParentDashboard'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const AdminAuth = lazy(() => import('./components/AdminAuth'));

const AppShellFallback = () => (
  <div className="h-screen flex items-center justify-center">로딩 중...</div>
);

const createOAuthBridgeNonce = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [pendingSocialUser, setPendingSocialUser] = useState<{ id: string; email: string; role: UserRole } | null>(null);
  const [socialInviteCode, setSocialInviteCode] = useState('');
  const [isDemoMode, setIsDemoMode] = useState(() => !isSupabaseConfigured && shouldEnableDemoMode());

  const loadProfile = async (userId: string, fallbackEmail: string, fromSocialCallback = false) => {
    try {
      const result = await ensureProfileLoaded(supabase, userId, fallbackEmail, fromSocialCallback);
      if (result.status === 'user') {
        setUser(result.user);
        return;
      }

      if (result.status === 'pending-social-invite') {
        setPendingSocialUser(result.pendingUser);
        return;
      }

      if (result.shouldAlert) {
        alert('프로필 생성이 아직 완료되지 않았습니다. 잠시 후 다시 로그인해주세요.');
      }
    } catch (loadError) {
      console.error('Profile load error:', loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const checkSession = async () => {
      if (!isSupabaseConfigured) {
        setLoading(false);
        return;
      }

      const isAuthCallback = typeof window !== 'undefined' && window.location.pathname === '/auth/callback';
      if (isAuthCallback) {
        const query = new URLSearchParams(window.location.search);
        const code = query.get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error('OAuth callback exchange error:', error);
          }
        }
      }

      if (isAuthCallback) {
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const accessToken = hash.get('access_token');
        const refreshToken = hash.get('refresh_token');
        if (accessToken && refreshToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await loadProfile(session.user.id, session.user.email || '', isAuthCallback);
      } else {
        setLoading(false);
      }

      if (isAuthCallback && typeof window !== 'undefined') {
        window.history.replaceState({}, document.title, '/');
      }
    };

    void checkSession();
  }, []);

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      const expectedOrigin = typeof window !== 'undefined' ? window.location.origin : '';

      try {
        if (event.origin && event.origin !== expectedOrigin) return;

        const raw = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (raw?.type !== 'social_oauth_result') return;
        if (raw?.source !== MOBILE_MESSAGE_SOURCE) return;

        const expectedNonce = typeof window !== 'undefined' ? window.localStorage.getItem(OAUTH_BRIDGE_NONCE_KEY) : null;
        if (!expectedNonce || raw?.nonce !== expectedNonce) {
          console.warn('Rejected social_oauth_result due to nonce mismatch.');
          return;
        }

        const accessToken = raw?.accessToken;
        const refreshToken = raw?.refreshToken;
        if (!accessToken || !refreshToken) return;

        const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error) throw error;

        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(OAUTH_BRIDGE_NONCE_KEY);
        }

        if (data.user) {
          await loadProfile(data.user.id, data.user.email || '', true);
        }
      } catch (err) {
        console.error('social_oauth_result parse/set session error', err);
      } finally {
        setAuthLoading(false);
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const completeSocialInviteVerification = async () => {
    if (!pendingSocialUser) return;
    const normalizedCode = socialInviteCode.trim().toUpperCase();
    if (normalizedCode.length < 6) {
      alert('초대 코드를 입력해주세요.');
      return;
    }

    const { data: parents } = await supabase
      .from('users')
      .select('id')
      .eq('my_invite_code', normalizedCode)
      .eq('role', UserRole.PARENT)
      .limit(1);

    if (!parents?.length) {
      alert('유효하지 않은 초대 코드입니다.');
      return;
    }

    const { error } = await supabase.from('student_profiles').upsert({
      user_id: pendingSocialUser.id,
      invite_code: normalizedCode,
      parent_user_id: parents[0].id,
    });

    if (error) {
      alert(error.message || '초대 코드 검증 중 오류가 발생했습니다.');
      return;
    }

    localStorage.removeItem(PENDING_SOCIAL_INVITE_REQUIRED_KEY);
    localStorage.removeItem(PENDING_SOCIAL_SIGNUP_KEY);
    setPendingSocialUser(null);
    setSocialInviteCode('');
    await loadProfile(pendingSocialUser.id, pendingSocialUser.email);
  };

  const handleSocialLogin = async (provider: 'google' | 'apple', role: UserRole, isSignup: boolean) => {
    if (!isSupabaseConfigured) {
      alert('소셜 로그인은 Supabase 연결 환경에서만 사용 가능합니다.');
      return;
    }

    try {
      setAuthLoading(true);
      localStorage.setItem(PENDING_SOCIAL_ROLE_KEY, role);
      localStorage.setItem(PENDING_SOCIAL_SIGNUP_KEY, String(Boolean(isSignup)));
      const isNativeWebView = typeof window !== 'undefined' && Boolean((window as any).ReactNativeWebView);
      const oauthBridgeNonce = createOAuthBridgeNonce();
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(OAUTH_BRIDGE_NONCE_KEY, oauthBridgeNonce);
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: getOAuthRedirectUrl(isNativeWebView),
          skipBrowserRedirect: isNativeWebView,
          queryParams: { prompt: 'select_account' },
        },
      });

      if (error) throw error;

      if (isNativeWebView && data?.url) {
        (window as any).ReactNativeWebView?.postMessage(JSON.stringify({
          type: 'oauth_start',
          provider,
          url: data.url,
          nonce: oauthBridgeNonce,
        }));
        return;
      }

      setAuthLoading(false);
    } catch (err: any) {
      localStorage.removeItem(PENDING_SOCIAL_ROLE_KEY);
      localStorage.removeItem(PENDING_SOCIAL_SIGNUP_KEY);
      localStorage.removeItem(OAUTH_BRIDGE_NONCE_KEY);
      alert(err.message || '소셜 로그인 중 오류가 발생했습니다.');
      setAuthLoading(false);
    }
  };

  const handleAuth = async (email: string, password: string, role: UserRole, code?: string, isSignup?: boolean) => {
    if (!isSupabaseConfigured) {
      const { MockDb } = await import('./services/mockDb');
      try {
        setAuthLoading(true);
        if (isSignup) {
          if (role === UserRole.STUDENT) {
            const u = await MockDb.registerStudent(email, code || '');
            if (!u) throw new Error('유효하지 않은 초대 코드');
            setUser(u);
          } else {
            const u = await MockDb.loginParent(email);
            setUser(u);
          }
        } else {
          const mockUsers = JSON.parse(localStorage.getItem('forteenai_users') || '[]');
          const u = mockUsers.find((mockUser: any) => mockUser.email === email && mockUser.role === role);
          if (u) setUser(u);
          else throw new Error('계정을 찾을 수 없습니다.');
        }
      } catch (err: any) {
        alert(err.message || '로그인/가입 실패');
      } finally {
        setAuthLoading(false);
      }
      return;
    }

    try {
      setAuthLoading(true);

      if (isSignup) {
        let parentId: string | null = null;
        let registrationCode: string | null = null;

        if (role === UserRole.STUDENT) {
          if (!code) throw new Error('초대 코드가 필요합니다.');

          const normalizedCode = code.trim().toUpperCase();
          const { data: parents } = await supabase
            .from('users')
            .select('id, my_invite_code')
            .eq('my_invite_code', normalizedCode)
            .eq('role', UserRole.PARENT)
            .limit(1);

          if (!parents || parents.length === 0) {
            throw new Error('유효하지 않은 초대 코드입니다.');
          }

          const { count, error: countError } = await supabase
            .from('student_profiles')
            .select('user_id', { count: 'exact', head: true })
            .eq('parent_user_id', parents[0].id);

          if (countError) {
            console.error('student count lookup error:', countError);
            throw countError;
          }
          if ((count || 0) >= 3) {
            throw new Error('해당 부모님 계정의 학생 수가 최대(3명)에 도달했습니다.');
          }

          parentId = parents[0].id;
        } else if (role === UserRole.PARENT) {
          if (!code) throw new Error('관리자 등록 코드가 필요합니다.');
          registrationCode = code.trim();

          const parentSignupResponse = await fetch('/api/parent-signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, registrationCode }),
          });

          const parentSignupPayload = await parentSignupResponse.json().catch(() => ({}));
          if (!parentSignupResponse.ok) {
            throw new Error(parentSignupPayload?.error || '부모 계정 생성에 실패했습니다.');
          }

          const { data: parentLoginData, error: parentLoginError } = await supabase.auth.signInWithPassword({ email, password });
          if (parentLoginError) throw parentLoginError;

          if (parentLoginData.user) {
            await loadProfile(parentLoginData.user.id, parentLoginData.user.email || email);
            return;
          }

          throw new Error('부모 계정 로그인에 실패했습니다.');
        }

        const normalizedInviteCode = role === UserRole.STUDENT ? code?.trim().toUpperCase() : undefined;
        const signupName = getSignupName(email);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 31);

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              role,
              name: signupName,
              subscription_expires_at: expiresAt.toISOString(),
              ...(role === UserRole.STUDENT
                ? {
                  parent_user_id: parentId,
                  invite_code: normalizedInviteCode,
                }
                : {}),
            },
          },
        });
        if (authError) throw authError;
        if (!authData.user) throw new Error('가입 실패');

        if (role === UserRole.STUDENT && authData.session?.user && parentId) {
          const { error: studentProfileError } = await supabase
            .from('student_profiles')
            .upsert({
              user_id: authData.user.id,
              invite_code: normalizedInviteCode,
              parent_user_id: parentId,
            });

          if (studentProfileError) {
            console.error('student_profiles upsert after signup error:', studentProfileError);
          }
        }

        if (authData.session?.user) {
          await loadProfile(authData.session.user.id, email);
          return;
        }

        alert('가입이 완료되었습니다. 이메일 확인 후 로그인해주세요. (이메일 인증 OFF 환경에서는 바로 로그인될 수 있어요.)');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        if (data.user) {
          await loadProfile(data.user.id, data.user.email || email);
        }
      }
    } catch (err: any) {
      alert(err.message || '오류가 발생했습니다.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAdminLogin = async (email: string, password: string) => {
    try {
      setAuthLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error('로그인에 실패했습니다.');

      await loadProfile(data.user.id, data.user.email || email);
    } catch (err: any) {
      alert(err.message || '관리자 로그인 중 오류가 발생했습니다.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setUser(null);
  };

  if (loading) {
    return <AppShellFallback />;
  }

  if (!isSupabaseConfigured && !isDemoMode) {
    const missingVars = getMissingSupabaseEnvVars();

    const startDemoMode = () => {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(DEMO_MODE_STORAGE_KEY, 'true');
      }
      setIsDemoMode(true);
    };

    return (
      <div className="h-screen flex items-center justify-center p-8 text-center bg-slate-100">
        <div className="max-w-xl bg-white rounded-3xl shadow-md border border-slate-200 p-8">
          <h1 className="text-2xl font-bold mb-3 text-slate-900">Supabase 연결 필요</h1>
          <p className="text-slate-600">운영 배포는 아래 환경 변수를 설정해야 합니다. 다만 화면 점검/캡처는 데모 모드로 바로 진행할 수 있어요.</p>
          <p className="mt-3 font-mono text-sm text-slate-700">VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY</p>
          <div className="mt-5 rounded-2xl bg-amber-50 border border-amber-200 p-4 text-left">
            <p className="text-sm font-semibold text-amber-800">현재 누락/placeholder로 감지된 값</p>
            <p className="mt-1 text-sm text-amber-700 font-mono">{missingVars.length ? missingVars.join(', ') : '값은 존재하지만 연결 확인 실패'}</p>
          </div>
          <button
            type="button"
            onClick={startDemoMode}
            className="mt-5 w-full rounded-2xl bg-brand-900 text-white py-3 font-black"
          >
            데모 모드로 계속하기 (캡처 가능)
          </button>
          <p className="mt-3 text-xs text-slate-500">팁: URL 뒤에 <span className="font-mono">?demo=1</span>을 붙이면 자동으로 데모 모드가 켜집니다.</p>
        </div>
      </div>
    );
  }

  if (pendingSocialUser) {
    return (
      <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-6">
          <h2 className="text-2xl font-black text-slate-900">초대코드 입력</h2>
          <p className="text-sm text-slate-500 mt-2">소셜 인증이 완료되었습니다. 권한 확인을 위해 초대코드를 입력해주세요.</p>
          <input
            value={socialInviteCode}
            onChange={(e) => setSocialInviteCode(e.target.value.toUpperCase())}
            className="mt-5 w-full bg-brand-50 border border-brand-100 rounded-2xl px-5 py-4 text-center tracking-[0.25em] font-black text-brand-900"
            placeholder="A1B2C3"
          />
          <button onClick={completeSocialInviteVerification} className="mt-4 w-full bg-brand-900 text-white font-black py-4 rounded-2xl">검증 후 시작하기</button>
        </div>
      </div>
    );
  }

  const isAdminPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');

  const demoModeBadge = (!isSupabaseConfigured && isDemoMode) ? (
    <div className="fixed bottom-4 right-4 z-50 rounded-full bg-amber-100 border border-amber-300 px-4 py-2 text-xs font-bold text-amber-800 shadow">
      데모 모드 실행 중 (mock 데이터)
    </div>
  ) : null;

  if (!user) {
    if (isAdminPath) {
      return <Suspense fallback={<AppShellFallback />}>{demoModeBadge}<AdminAuth loading={authLoading} onLogin={handleAdminLogin} /></Suspense>;
    }

    return <Suspense fallback={<AppShellFallback />}>{demoModeBadge}<Auth onLogin={handleAuth} onSocialLogin={handleSocialLogin} loading={authLoading} /></Suspense>;
  }

  if (isAdminPath) {
    if (user.role !== UserRole.ADMIN) {
      return (
        <div className="min-h-screen bg-[#F4F7FC] flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl border border-rose-100 bg-white p-6 shadow-xl">
            <h1 className="text-2xl font-black text-slate-900">접근 권한이 없습니다</h1>
            <p className="mt-2 text-sm text-slate-500">관리자 계정으로 로그인한 사용자만 운영 대시보드에 접근할 수 있습니다.</p>
            <button onClick={handleLogout} className="mt-5 w-full rounded-xl bg-slate-900 py-3 text-sm font-black text-white">다시 로그인</button>
          </div>
        </div>
      );
    }

    return <Suspense fallback={<AppShellFallback />}>{demoModeBadge}<AdminDashboard user={user} onLogout={handleLogout} /></Suspense>;
  }

  return user.role === UserRole.STUDENT
    ? <Suspense fallback={<AppShellFallback />}>{demoModeBadge}<StudentChat user={user} onLogout={handleLogout} /></Suspense>
    : <Suspense fallback={<AppShellFallback />}>{demoModeBadge}<ParentDashboard user={user} onLogout={handleLogout} /></Suspense>;
}

export default App;

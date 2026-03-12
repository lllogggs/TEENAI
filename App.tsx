import React, { useEffect, useState } from 'react';
import { User, UserRole } from './types';
import Auth from './components/Auth';
import StudentChat from './components/StudentChat';
import ParentDashboard from './components/ParentDashboard';
import AdminDashboard from './components/AdminDashboard';
import AdminAuth from './components/AdminAuth';
import { isSupabaseConfigured, supabase } from './utils/supabase';

const PENDING_SOCIAL_ROLE_KEY = 'forteenai_pending_social_role';
const PENDING_SOCIAL_SIGNUP_KEY = 'forteenai_pending_social_signup';
const PENDING_SOCIAL_INVITE_REQUIRED_KEY = 'forteenai_pending_social_invite_required';

const getSignupName = (email: string) => {
  const emailPrefix = email.split('@')[0]?.trim();
  return emailPrefix || 'User';
};


const requiredSupabaseEnvVars = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
const DEMO_MODE_STORAGE_KEY = 'forteenai_demo_mode';

const getMissingSupabaseEnvVars = () => requiredSupabaseEnvVars.filter((key) => {
  const env = import.meta.env as Record<string, string | undefined>;
  const value = env[key];
  return !value || String(value).includes('placeholder');
});


const shouldEnableDemoMode = () => {
  if (typeof window === 'undefined') return false;

  const query = new URLSearchParams(window.location.search);
  const byQuery = query.get('demo') === '1';
  const byStorage = window.localStorage.getItem(DEMO_MODE_STORAGE_KEY) === 'true';
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

  return byQuery || byStorage || isLocal;
};

const getOAuthRedirectUrl = (isNativeWebView: boolean) => {
  if (isNativeWebView) return 'forteenai://auth/callback';
  if (typeof window === 'undefined') return 'http://localhost:5173/auth/callback';
  if (window.location.hostname === 'forteenai.com' || window.location.hostname === 'www.forteenai.com') {
    return 'https://forteenai.com/auth/callback';
  }
  return 'http://localhost:5173/auth/callback';
};

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [pendingSocialUser, setPendingSocialUser] = useState<{ id: string; email: string; role: UserRole } | null>(null);
  const [socialInviteCode, setSocialInviteCode] = useState('');
  const [isDemoMode, setIsDemoMode] = useState(() => !isSupabaseConfigured && shouldEnableDemoMode());

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
        await ensureProfileLoaded(session.user.id, session.user.email || '', isAuthCallback);
      } else {
        setLoading(false);
      }

      if (isAuthCallback && typeof window !== 'undefined') {
        window.history.replaceState({}, document.title, '/');
      }
    };

    checkSession();
  }, []);

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      try {
        const raw = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (raw?.type !== 'social_oauth_result') return;
        const accessToken = raw?.accessToken;
        const refreshToken = raw?.refreshToken;
        if (!accessToken || !refreshToken) return;
        const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error) throw error;
        if (data.user) {
          await ensureProfileLoaded(data.user.id, data.user.email || '', true);
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

  const ensureProfileLoaded = async (userId: string, fallbackEmail: string, fromSocialCallback = false) => {
    try {
      let profile: any = null;
      let lastError: any = null;

      for (let i = 0; i < 10; i += 1) {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .single();

        if (data) {
          profile = data;
          break;
        }

        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      if (profile) {
        if (fromSocialCallback) {
          const pendingRole = localStorage.getItem(PENDING_SOCIAL_ROLE_KEY);
          const pendingSignup = localStorage.getItem(PENDING_SOCIAL_SIGNUP_KEY) === 'true';
          if (pendingRole && pendingRole !== profile.role) {
            alert(`기존 계정의 역할(${profile.role})이 우선 적용됩니다.`);
          }
          if (pendingSignup && profile.role === UserRole.STUDENT) {
            setPendingSocialUser({ id: profile.id, email: profile.email, role: profile.role as UserRole });
            localStorage.setItem(PENDING_SOCIAL_INVITE_REQUIRED_KEY, 'true');
            setLoading(false);
            return;
          }
          localStorage.removeItem(PENDING_SOCIAL_ROLE_KEY);
          localStorage.removeItem(PENDING_SOCIAL_SIGNUP_KEY);
        }
        setUser(profile as User);
        return;
      }

      if (fromSocialCallback) {
        const pendingRole = localStorage.getItem(PENDING_SOCIAL_ROLE_KEY) as UserRole | null;
        const socialRole = pendingRole === UserRole.PARENT || pendingRole === UserRole.STUDENT
          ? pendingRole
          : UserRole.STUDENT;
        const socialName = getSignupName(fallbackEmail);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 31);

        const pendingSignup = localStorage.getItem(PENDING_SOCIAL_SIGNUP_KEY) === 'true';

        const { data: insertedProfile, error: insertError } = await supabase
          .from('users')
          .upsert({
            id: userId,
            email: fallbackEmail,
            role: socialRole,
            name: socialName,
            subscription_expires_at: expiresAt.toISOString(),
          }, { onConflict: 'id' })
          .select('*')
          .single();

        localStorage.removeItem(PENDING_SOCIAL_ROLE_KEY);
        localStorage.removeItem(PENDING_SOCIAL_SIGNUP_KEY);

        if (insertError) {
          console.error('social users upsert error:', insertError);
          throw insertError;
        }

        if (insertedProfile) {
          if (pendingSignup && insertedProfile.role === UserRole.STUDENT) {
            setPendingSocialUser({ id: insertedProfile.id, email: insertedProfile.email, role: insertedProfile.role as UserRole });
            localStorage.setItem(PENDING_SOCIAL_INVITE_REQUIRED_KEY, 'true');
            setLoading(false);
            return;
          }
          setUser(insertedProfile as User);
          return;
        }
      }

      const { data: userInfo } = await supabase.auth.getUser();
      const metadata = userInfo.user?.user_metadata || {};
      const metadataRole = metadata.role === UserRole.PARENT || metadata.role === UserRole.STUDENT
        ? metadata.role
        : UserRole.STUDENT;
      const metadataName = typeof metadata.name === 'string' && metadata.name.trim()
        ? metadata.name.trim()
        : getSignupName(fallbackEmail || userInfo.user?.email || '');
      const metadataEmail = userInfo.user?.email || fallbackEmail;

      if (userInfo.user && metadataEmail) {
        const { data: repairedProfile, error: repairError } = await supabase
          .from('users')
          .upsert({
            id: userId,
            email: metadataEmail,
            role: metadataRole,
            name: metadataName,
            subscription_expires_at: metadata.subscription_expires_at || null,
          }, { onConflict: 'id' })
          .select('*')
          .single();

        if (!repairError && repairedProfile) {
          setUser(repairedProfile as User);
          return;
        }

        console.error('users profile repair upsert error:', repairError);
      }

      console.error('users profile lookup error:', lastError);
      if (fallbackEmail) {
        alert('프로필 생성이 아직 완료되지 않았습니다. 잠시 후 다시 로그인해주세요.');
      }
    } catch (loadError) {
      console.error('Profile load error:', loadError);
    } finally {
      setLoading(false);
    }
  };


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
    await ensureProfileLoaded(pendingSocialUser.id, pendingSocialUser.email);
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
        }));
        return;
      }

      setAuthLoading(false);
    } catch (err: any) {
      localStorage.removeItem(PENDING_SOCIAL_ROLE_KEY);
      localStorage.removeItem(PENDING_SOCIAL_SIGNUP_KEY);
      alert(err.message || '소셜 로그인 중 오류가 발생했습니다.');
      setAuthLoading(false);
    }
  };

  const handleAuth = async (email: string, password: string, role: UserRole, code?: string, isSignup?: boolean) => {
    if (!isSupabaseConfigured) {
      // Mock Auth logic
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
          const u = mockUsers.find((u: any) => u.email === email && u.role === role);
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
            .select('id, my_invite_code') // Fetch invite code to verify correct parent if needed, but ID is enough
            .eq('my_invite_code', normalizedCode)
            .eq('role', UserRole.PARENT)
            .limit(1);

          if (!parents || parents.length === 0) {
            throw new Error('유효하지 않은 초대 코드입니다.');
          }

          // Check if parent has reached student limit (max 3)
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
            await ensureProfileLoaded(parentLoginData.user.id, parentLoginData.user.email || email);
            return;
          }

          throw new Error('부모 계정 로그인에 실패했습니다.');
        }

        const normalizedInviteCode = role === UserRole.STUDENT ? code?.trim().toUpperCase() : undefined;
        const signupName = getSignupName(email);

        // Default 31 days trial
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 31);

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              role,
              name: signupName,
              subscription_expires_at: expiresAt.toISOString(), // Save to user metadata for easy access trigger
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
          await ensureProfileLoaded(authData.session.user.id, email);
          return;
        }

        alert('가입이 완료되었습니다. 이메일 확인 후 로그인해주세요. (이메일 인증 OFF 환경에서는 바로 로그인될 수 있어요.)');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        if (data.user) {
          await ensureProfileLoaded(data.user.id, data.user.email || email);
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

      await ensureProfileLoaded(data.user.id, data.user.email || email);
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
    return <div className="h-screen flex items-center justify-center">로딩 중...</div>;
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
      return <>{demoModeBadge}<AdminAuth loading={authLoading} onLogin={handleAdminLogin} /></>;
    }

    return <>{demoModeBadge}<Auth onLogin={handleAuth} onSocialLogin={handleSocialLogin} loading={authLoading} /></>;
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

    return <>{demoModeBadge}<AdminDashboard user={user} onLogout={handleLogout} /></>;
  }

  return user.role === UserRole.STUDENT
    ? <>{demoModeBadge}<StudentChat user={user} onLogout={handleLogout} /></>
    : <>{demoModeBadge}<ParentDashboard user={user} onLogout={handleLogout} /></>;
}

export default App;

import React, { useEffect, useState } from 'react';
import { User, UserRole } from './types';
import Auth from './components/Auth';
import StudentChat from './components/StudentChat';
import ParentDashboard from './components/ParentDashboard';
import { isSupabaseConfigured, supabase } from './utils/supabase';

const PENDING_SOCIAL_ROLE_KEY = 'forteenai_pending_social_role';

const getSignupName = (email: string) => {
  const emailPrefix = email.split('@')[0]?.trim();
  return emailPrefix || 'User';
};

const getOAuthRedirectUrl = () => {
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
          if (pendingRole && pendingRole !== profile.role) {
            alert(`기존 계정의 역할(${profile.role})이 우선 적용됩니다.`);
          }
          localStorage.removeItem(PENDING_SOCIAL_ROLE_KEY);
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

        if (insertError) {
          console.error('social users upsert error:', insertError);
          throw insertError;
        }

        if (insertedProfile) {
          setUser(insertedProfile as User);
          return;
        }
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

  const handleSocialLogin = async (role: UserRole) => {
    if (!isSupabaseConfigured) {
      alert('소셜 로그인은 Supabase 연결 환경에서만 사용 가능합니다.');
      return;
    }

    try {
      setAuthLoading(true);
      localStorage.setItem(PENDING_SOCIAL_ROLE_KEY, role);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getOAuthRedirectUrl(),
          queryParams: {
            prompt: 'select_account',
          },
        },
      });

      if (error) {
        localStorage.removeItem(PENDING_SOCIAL_ROLE_KEY);
        throw error;
      }
    } catch (err: any) {
      alert(err.message || 'Google 로그인 중 오류가 발생했습니다.');
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
    return <Auth onLogin={handleAuth} onSocialLogin={handleSocialLogin} loading={authLoading} />;
  }

  return user.role === UserRole.STUDENT
    ? <StudentChat user={user} onLogout={handleLogout} />
    : <ParentDashboard user={user} onLogout={handleLogout} />;
}

export default App;

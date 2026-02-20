import React, { useEffect, useState } from 'react';
import { User, UserRole } from './types';
import Auth from './components/Auth';
import StudentChat from './components/StudentChat';
import ParentDashboard from './components/ParentDashboard';
import { isSupabaseConfigured, supabase } from './utils/supabase';

const getSignupName = (email: string) => {
  const emailPrefix = email.split('@')[0]?.trim();
  return emailPrefix || 'User';
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

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await ensureProfileLoaded(session.user.id, session.user.email || '');
      } else {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  const ensureProfileLoaded = async (userId: string, fallbackEmail: string) => {
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
        setUser(profile as User);
        return;
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
            .from('users')
            .select('id', { count: 'exact', head: true })
            .eq('parent_user_id', parents[0].id);

          if (countError) throw countError;
          if ((count || 0) >= 3) {
            throw new Error('해당 부모님 계정의 학생 수가 최대(3명)에 도달했습니다.');
          }

          parentId = parents[0].id;
        } else if (role === UserRole.PARENT) {
          // "code" argument is treated as Registration Code for Parents
          if (!code) throw new Error('관리자 등록 코드가 필요합니다.');
          registrationCode = code.trim();
          // Validation is done in Auth.tsx, but good to re-verify or just proceed to mark used.
          // We will mark it used AFTER successful signup.
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

        // If parent signup successful, mark registration code as used
        if (role === UserRole.PARENT && registrationCode) {
          const { error: codeError } = await supabase
            .from('admin_codes')
            .update({ is_used: true, used_at: new Date().toISOString() })
            .eq('code', registrationCode);

          if (codeError) {
            console.error('Failed to mark registration code as used:', codeError);
            // Non-fatal error for the user, but needs admin attention. 
            // We might want to alert or log this system-wide.
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
    return <Auth onLogin={handleAuth} loading={authLoading} />;
  }

  return user.role === UserRole.STUDENT
    ? <StudentChat user={user} onLogout={handleLogout} />
    : <ParentDashboard user={user} onLogout={handleLogout} />;
}

export default App;

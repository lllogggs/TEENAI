
'use client';

import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/utils/supabase';
import { User, UserRole } from '@/types';
import StudentChat from '@/components/StudentChat';
import ParentDashboard from '@/components/ParentDashboard';
import Auth from '@/components/Auth';

export default function Home() {
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

  const getSignupName = (email: string) => {
    const emailPrefix = email.split('@')[0]?.trim();
    return emailPrefix || 'User';
  };

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
    } catch (error) {
      console.error('Profile load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setUser(null);
  };

  // 실제 로그인/가입 처리 로직
  const handleAuth = async (email: string, pass: string, role: UserRole, code?: string, isSignup?: boolean) => {
    if (!isSupabaseConfigured) {
      alert('Supabase가 연결되지 않았습니다.');
      return;
    }

    try {
      setAuthLoading(true);

      if (isSignup) {
        let parentId: string | null = null;

        if (role === UserRole.STUDENT) {
          if (!code) throw new Error('초대 코드가 필요합니다.');

          const normalizedCode = code.trim().toUpperCase();
          const { data: parents } = await supabase
            .from('users')
            .select('id')
            .eq('my_invite_code', normalizedCode)
            .eq('role', UserRole.PARENT)
            .limit(1);

          if (!parents || parents.length === 0) {
            throw new Error('유효하지 않은 초대 코드입니다.');
          }

          parentId = parents[0].id;
        }

        const normalizedInviteCode = code?.trim().toUpperCase();
        const signupName = getSignupName(email);
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password: pass,
          options: {
            data: {
              role,
              name: signupName,
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

        if (authData.session?.user) {
          await ensureProfileLoaded(authData.session.user.id, email);
          return;
        }

        alert('가입이 완료되었습니다. 이메일 확인 후 로그인해주세요. (이메일 인증 OFF 환경에서는 바로 로그인될 수 있어요.)');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password: pass,
        });

        if (error) throw error;
        if (data.user) await ensureProfileLoaded(data.user.id, data.user.email || email);
      }
    } catch (err: any) {
      alert(err.message || '오류가 발생했습니다.');
    } finally {
      setAuthLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="animate-pulse text-brand-900 font-black text-2xl tracking-tighter">TEENAI...</div>
      </div>
    );
  }

  // 연결 전 가이드 (Supabase 설정을 안했을 경우)
  if (!isSupabaseConfigured) {
    return (
      <div className="h-screen flex items-center justify-center p-8 text-center">
        <div>
            <h1 className="text-2xl font-bold mb-4">Supabase 연결 필요</h1>
            <p className="text-slate-500">실제 가입 테스트를 위해 Supabase를 연결해주세요.</p>
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

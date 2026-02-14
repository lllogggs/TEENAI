import React, { useEffect, useState } from 'react';
import { User, UserRole } from './types';
import Auth from './components/Auth';
import StudentChat from './components/StudentChat';
import ParentDashboard from './components/ParentDashboard';
import { isSupabaseConfigured, supabase } from './utils/supabase';

const createInviteCode = () => {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const randomValues = new Uint32Array(6);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join('');
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
        await loadUserProfile(session.user.id);
      } else {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  const loadUserProfile = async (userId: string) => {
    try {
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (profile) {
        if (profile.role === UserRole.PARENT && !profile.my_invite_code) {
          const newCode = createInviteCode();
          await supabase.from('users').update({ my_invite_code: newCode }).eq('id', userId);
          profile.my_invite_code = newCode;
        }

        setUser(profile as User);
      }
    } catch (error) {
      console.error('Profile load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (email: string, password: string, role: UserRole, code?: string, isSignup?: boolean) => {
    if (!isSupabaseConfigured) {
      alert('Supabase가 연결되지 않았습니다. VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY를 설정해주세요.');
      return;
    }

    try {
      setAuthLoading(true);

      if (isSignup) {
        let parentId: string | null = null;

        if (role === UserRole.STUDENT) {
          if (!code) {
            throw new Error('초대 코드가 필요합니다.');
          }

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

        const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;
        if (!authData.user) throw new Error('가입 실패');

        const myInviteCode = role === UserRole.PARENT ? createInviteCode() : null;

        const { error: userInsertError } = await supabase.from('users').insert({
          id: authData.user.id,
          email,
          role,
          name: email.split('@')[0],
          my_invite_code: myInviteCode,
        });

        if (userInsertError) throw userInsertError;

        if (role === UserRole.STUDENT && parentId) {
          const { error: profileInsertError } = await supabase.from('student_profiles').insert({
            user_id: authData.user.id,
            invite_code: code?.trim().toUpperCase(),
            parent_user_id: parentId,
            settings: {},
          });

          if (profileInsertError) throw profileInsertError;
        }

        await loadUserProfile(authData.user.id);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) await loadUserProfile(data.user.id);
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

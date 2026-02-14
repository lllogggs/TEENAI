
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
        // [수정] 학부모인데 코드가 없는 경우(기존 가입자 등), 자동으로 생성하여 저장
        if (profile.role === UserRole.PARENT && !profile.my_invite_code) {
            const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            
            // DB 업데이트
            await supabase
                .from('users')
                .update({ my_invite_code: newCode })
                .eq('id', userId);
            
            // 로컬 상태에도 반영
            profile.my_invite_code = newCode;
        }

        setUser(profile as User);
      }
    } catch (error) {
      console.error("Profile load error:", error);
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
      alert("Supabase가 연결되지 않았습니다.");
      return;
    }

    try {
      setAuthLoading(true);

      if (isSignup) {
        // --- 회원가입 로직 ---
        
        // 1. 학생 가입 시 초대 코드 검증 (부모 찾기)
        let parentId = null;
        if (role === UserRole.STUDENT) {
            if (!code) throw new Error("초대 코드가 필요합니다.");
            const { data: parents } = await supabase
                .from('users')
                .select('id')
                .eq('my_invite_code', code) // 부모의 코드로 검색
                .eq('role', 'parent');
            
            if (!parents || parents.length === 0) {
                throw new Error("유효하지 않은 초대 코드입니다.");
            }
            parentId = parents[0].id;
        }

        // 2. Supabase Auth 가입
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password: pass,
        });

        if (authError) throw authError;
        if (!authData.user) throw new Error("가입 실패");

        // 3. 사용자 정보 DB 저장
        // 학부모라면 본인의 초대 코드 생성 (랜덤 6자리)
        const myInviteCode = role === UserRole.PARENT 
            ? Math.random().toString(36).substring(2, 8).toUpperCase() 
            : undefined;

        const { error: dbError } = await supabase.from('users').insert({
            id: authData.user.id,
            email: email,
            role: role,
            name: email.split('@')[0], // 이메일 앞부분을 이름으로
            my_invite_code: myInviteCode
        });

        if (dbError) throw dbError;

        // 4. 학생 프로필 생성 및 부모 연결
        if (role === UserRole.STUDENT && parentId) {
            await supabase.from('student_profiles').insert({
                user_id: authData.user.id,
                invite_code: code, // 사용한 코드 기록
                parent_user_id: parentId,
                settings: {}
            });
        }

        await loadUserProfile(authData.user.id);

      } else {
        // --- 로그인 로직 ---
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password: pass,
        });
        if (error) throw error;
        if (data.user) await loadUserProfile(data.user.id);
      }

    } catch (err: any) {
      alert(err.message || "오류가 발생했습니다.");
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

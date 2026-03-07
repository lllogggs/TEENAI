import React, { useEffect, useState } from 'react';
import { User, UserRole } from './types';
import Auth from './components/Auth';
import StudentChat from './components/StudentChat';
import ParentDashboard from './components/ParentDashboard';
import { isSupabaseConfigured, supabase } from './utils/supabase';
import SocialOnboarding from './components/SocialOnboarding';
import { getOAuthRedirectUrl, isAuthCallbackPath } from './utils/oauth';

interface OnboardingState {
  userId: string;
  email: string;
  role: UserRole;
}


function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      if (!isSupabaseConfigured) {
        setLoading(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await ensureProfileLoaded(session.user.id, session.user.email || '', session.user);
        if (isAuthCallbackPath()) {
          window.history.replaceState({}, '', '/');
        }
      } else {
        if (isAuthCallbackPath()) {
          window.history.replaceState({}, '', '/');
        }
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  const ensureProfileLoaded = async (userId: string, fallbackEmail: string, authUserArg?: any) => {
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
        const authUser = authUserArg || (await supabase.auth.getUser()).data.user;
        if (await needsOnboarding(profile, authUser)) {
          setOnboardingState({
            userId,
            email: profile.email || fallbackEmail,
            role: profile.role,
          });
          setUser(null);
          return;
        }

        setOnboardingState(null);
        setUser(profile as User);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const metadata = session?.user?.user_metadata || {};
      const fallbackRole = metadata.role === UserRole.PARENT ? UserRole.PARENT : UserRole.STUDENT;
      const fallbackNickname = metadata.nickname || metadata.name || fallbackEmail.split('@')[0] || 'User';
      const { data: inserted, error: insertError } = await supabase
        .from('users')
        .upsert({
          id: userId,
          email: fallbackEmail,
          role: fallbackRole,
          nickname: fallbackNickname,
          name: fallbackNickname,
          birth_year: metadata.birth_year ? Number(metadata.birth_year) : null,
        })
        .select('*')
        .single();

      if (!insertError && inserted) {
        setOnboardingState(null);
        setUser(inserted as User);
        return;
      }

      console.error('users profile lookup error:', lastError || insertError);
      if (fallbackEmail) {
        alert('프로필 생성이 아직 완료되지 않았습니다. 잠시 후 다시 로그인해주세요.');
      }
    } catch (loadError) {
      console.error('Profile load error:', loadError);
    } finally {
      setLoading(false);
    }
  };

  const needsOnboarding = async (profile: any, authUser: any) => {
    if (!profile?.id || !profile?.role) return false;

    if (profile.role === UserRole.STUDENT) {
      const { data: studentProfile } = await supabase
        .from('student_profiles')
        .select('parent_user_id, invite_code')
        .eq('user_id', profile.id)
        .maybeSingle();

      const hasNickname = Boolean((profile.nickname || profile.name || '').trim());
      const hasBirthYear = Boolean(profile.birth_year);
      const hasParentLink = Boolean(studentProfile?.parent_user_id && studentProfile?.invite_code);
      const hasParentalConsent = authUser?.user_metadata?.parental_consent === true;

      return !hasNickname || !hasBirthYear || !hasParentLink || !hasParentalConsent;
    }

    if (profile.role === UserRole.PARENT) {
      const provider = authUser?.app_metadata?.provider;
      const isSocialProvider = provider === 'google' || provider === 'apple';
      const hasValidatedCode = authUser?.user_metadata?.parent_registration_verified === true;
      return isSocialProvider && !hasValidatedCode;
    }

    return false;
  };

  const handleOnboardingSubmit = async (payload: any) => {
    if (!onboardingState) return;

    try {
      setAuthLoading(true);

      if (onboardingState.role === UserRole.STUDENT) {
        const { nickname, birthYear, parentInviteCode, parentalConsent } = payload;
        const normalizedCode = String(parentInviteCode || '').trim().toUpperCase();

        const { data: parents } = await supabase
          .from('users')
          .select('id')
          .eq('my_invite_code', normalizedCode)
          .eq('role', UserRole.PARENT)
          .limit(1);

        if (!parents || parents.length === 0) {
          throw new Error('유효하지 않은 자녀-학부모 코드입니다.');
        }

        const parentId = parents[0].id;

        const { count, error: countError } = await supabase
          .from('student_profiles')
          .select('user_id', { count: 'exact', head: true })
          .eq('parent_user_id', parentId)
          .neq('user_id', onboardingState.userId);

        if (countError) throw countError;
        if ((count || 0) >= 3) {
          throw new Error('해당 부모님 계정의 학생 수가 최대(3명)에 도달했습니다.');
        }

        const parsedBirthYear = Number(birthYear);
        const resolvedNickname = String(nickname || '').trim();

        const { error: updateUserError } = await supabase
          .from('users')
          .update({
            nickname: resolvedNickname,
            name: resolvedNickname,
            birth_year: parsedBirthYear,
          })
          .eq('id', onboardingState.userId);

        if (updateUserError) throw updateUserError;

        const { error: studentProfileError } = await supabase
          .from('student_profiles')
          .upsert({
            user_id: onboardingState.userId,
            invite_code: normalizedCode,
            parent_user_id: parentId,
          });

        if (studentProfileError) throw studentProfileError;

        const { error: updateAuthError } = await supabase.auth.updateUser({
          data: {
            nickname: resolvedNickname,
            name: resolvedNickname,
            birth_year: parsedBirthYear,
            parental_consent: Boolean(parentalConsent),
          },
        });
        if (updateAuthError) throw updateAuthError;
      } else {
        const normalizedCode = String(payload?.registrationCode || '').trim();
        if (!normalizedCode) {
          throw new Error('초대 코드를 입력해주세요.');
        }

        const verifyResponse = await fetch('/api/verify-parent-code', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            registrationCode: normalizedCode,
          }),
        });

        const verifyResult = await verifyResponse.json().catch(() => null);
        if (!verifyResponse.ok || !verifyResult?.success) {
          throw new Error(verifyResult?.error || '초대 코드 인증에 실패했습니다.');
        }

        const { error: updateAuthError } = await supabase.auth.updateUser({
          data: {
            parent_registration_verified: true,
          },
        });

        if (updateAuthError) throw updateAuthError;
      }

      const { data: userData } = await supabase.auth.getUser();
      await ensureProfileLoaded(onboardingState.userId, onboardingState.email, userData.user);
    } catch (err: any) {
      alert(err.message || '추가 정보 저장에 실패했습니다.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAuth = async (
    email: string,
    password: string,
    role: UserRole,
    code?: string,
    isSignup?: boolean,
    metadata?: { nickname?: string; birthYear?: string; parentalConsent?: boolean },
  ) => {
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
        const signupNickname = metadata?.nickname?.trim() || email.split('@')[0]?.trim() || 'User';
        const parsedBirthYear = metadata?.birthYear ? Number(metadata.birthYear) : null;

        // Default 31 days trial
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 31);

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              role,
              nickname: signupNickname,
              name: signupNickname,
              ...(parsedBirthYear ? { birth_year: parsedBirthYear } : {}),
              ...(metadata?.parentalConsent ? { parental_consent: true } : {}),
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
          await ensureProfileLoaded(data.user.id, data.user.email || email, data.user);
        }
      }
    } catch (err: any) {
      alert(err.message || '오류가 발생했습니다.');
    } finally {
      setAuthLoading(false);
    }
  };


  const handleSocialLogin = async (provider: 'apple' | 'google', role: UserRole) => {
    try {
      setAuthLoading(true);
      const redirectTo = getOAuthRedirectUrl();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          queryParams: { role },
        },
      });
      if (error) throw error;
    } catch (err: any) {
      alert(err.message || '소셜 로그인에 실패했습니다.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm('정말로 탈퇴하시겠습니까? 모든 데이터가 복구 불가능하게 삭제됩니다.')) return;

    try {
      setAuthLoading(true);
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      const response = await fetch('/api/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || '회원 탈퇴 처리에 실패했습니다.');
      }

      await supabase.auth.signOut();
      setUser(null);
      alert('회원 탈퇴가 완료되었습니다.');
    } catch (err: any) {
      alert(err.message || '회원 탈퇴 중 오류가 발생했습니다.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setOnboardingState(null);
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
    if (onboardingState) {
      return (
        <SocialOnboarding
          role={onboardingState.role}
          email={onboardingState.email}
          loading={authLoading}
          onSubmit={handleOnboardingSubmit}
          onLogout={handleLogout}
        />
      );
    }

    return <Auth onLogin={handleAuth} onSocialLogin={handleSocialLogin} loading={authLoading} />;
  }

  return user.role === UserRole.STUDENT
    ? <StudentChat user={user} onLogout={handleLogout} onDeleteAccount={handleDeleteAccount} />
    : <ParentDashboard user={user} onLogout={handleLogout} />;
}

export default App;

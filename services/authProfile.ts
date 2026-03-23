import { User, UserRole } from '../types';
import {
  PENDING_SOCIAL_INVITE_REQUIRED_KEY,
  PENDING_SOCIAL_ROLE_KEY,
  PENDING_SOCIAL_SIGNUP_KEY,
} from '../utils/auth/constants';
import { getSignupName } from '../utils/auth/runtime';

type PendingSocialUser = { id: string; email: string; role: UserRole };

type EnsureProfileResult =
  | { status: 'user'; user: User }
  | { status: 'pending-social-invite'; pendingUser: PendingSocialUser }
  | { status: 'missing-profile'; shouldAlert: boolean };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const clearPendingSocialStorage = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PENDING_SOCIAL_ROLE_KEY);
  localStorage.removeItem(PENDING_SOCIAL_SIGNUP_KEY);
};

export const ensureProfileLoaded = async (
  supabase: any,
  userId: string,
  fallbackEmail: string,
  fromSocialCallback = false,
): Promise<EnsureProfileResult> => {
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
    await wait(300);
  }

  if (profile) {
    if (fromSocialCallback && typeof window !== 'undefined') {
      const pendingRole = localStorage.getItem(PENDING_SOCIAL_ROLE_KEY);
      const pendingSignup = localStorage.getItem(PENDING_SOCIAL_SIGNUP_KEY) === 'true';

      if (pendingRole && pendingRole !== profile.role) {
        alert(`기존 계정의 역할(${profile.role})이 우선 적용됩니다.`);
      }

      if (pendingSignup && profile.role === UserRole.STUDENT) {
        const pendingUser = { id: profile.id, email: profile.email, role: profile.role as UserRole };
        localStorage.setItem(PENDING_SOCIAL_INVITE_REQUIRED_KEY, 'true');
        return { status: 'pending-social-invite', pendingUser };
      }

      clearPendingSocialStorage();
    }

    return { status: 'user', user: profile as User };
  }

  if (fromSocialCallback && typeof window !== 'undefined') {
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

    clearPendingSocialStorage();

    if (insertError) {
      console.error('social users upsert error:', insertError);
      throw insertError;
    }

    if (insertedProfile) {
      if (pendingSignup && insertedProfile.role === UserRole.STUDENT) {
        const pendingUser = {
          id: insertedProfile.id,
          email: insertedProfile.email,
          role: insertedProfile.role as UserRole,
        };
        localStorage.setItem(PENDING_SOCIAL_INVITE_REQUIRED_KEY, 'true');
        return { status: 'pending-social-invite', pendingUser };
      }

      return { status: 'user', user: insertedProfile as User };
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
      return { status: 'user', user: repairedProfile as User };
    }

    console.error('users profile repair upsert error:', repairError);
  }

  console.error('users profile lookup error:', lastError);
  return { status: 'missing-profile', shouldAlert: Boolean(fallbackEmail) };
};

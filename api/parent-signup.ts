import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const getSignupName = (email: string) => {
  const emailPrefix = email.split('@')[0]?.trim();
  return emailPrefix || 'User';
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'Server env for admin signup is missing.' });
    return;
  }

  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const registrationCode = String(req.body?.registrationCode || '').trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Invalid email format.' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 chars.' });
    return;
  }

  if (!registrationCode) {
    res.status(400).json({ error: 'registrationCode is required.' });
    return;
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const codeUsedAt = new Date().toISOString();

  try {
    const { data: claimedCode, error: claimError } = await adminClient
      .from('admin_codes')
      .update({ is_used: true, used_at: codeUsedAt })
      .eq('code', registrationCode)
      .eq('is_used', false)
      .select('code')
      .maybeSingle();

    if (claimError) {
      console.error('admin code claim error:', claimError);
      res.status(500).json({ error: 'Failed to validate registration code.' });
      return;
    }

    if (!claimedCode) {
      res.status(400).json({ error: '유효하지 않거나 이미 사용된 등록 코드입니다.' });
      return;
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 31);
    const signupName = getSignupName(email);

    const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: 'parent',
        name: signupName,
        subscription_expires_at: expiresAt.toISOString(),
      },
    });

    if (createUserError || !createdUser.user) {
      await adminClient
        .from('admin_codes')
        .update({ is_used: false, used_at: null })
        .eq('code', registrationCode)
        .eq('used_at', codeUsedAt);

      throw createUserError || new Error('Failed to create parent user.');
    }

    const { error: profileError } = await adminClient
      .from('users')
      .upsert({
        id: createdUser.user.id,
        email,
        role: 'parent',
        name: signupName,
        subscription_expires_at: expiresAt.toISOString(),
      });

    if (profileError) {
      console.error('users upsert error after parent signup:', profileError);
    }

    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('parent-signup error:', error);
    res.status(500).json({ error: error?.message || '부모 계정 생성 중 오류가 발생했습니다.' });
  }
}

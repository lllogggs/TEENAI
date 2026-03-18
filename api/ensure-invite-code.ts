import { createClient } from '@supabase/supabase-js';
import { serverSupabaseEnv, serverSupabaseEnvHints } from './_lib/supabase-env.js';

const supabaseUrl = serverSupabaseEnv.url;
const supabaseAnonKey = serverSupabaseEnv.anonKey;

const getBearerToken = (req: any): string | null => {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
};

const generateRandomCode = (length = 6): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const isInviteCodeMissing = (value: unknown): boolean => typeof value !== 'string' || value.trim().length === 0;

const normalizeInviteCode = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().toUpperCase();
};

const isUniqueViolation = (error: any): boolean => {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '23505' || message.includes('duplicate key') || message.includes('unique');
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({ error: `Supabase client env is missing. Required: ${serverSupabaseEnvHints.url}, ${serverSupabaseEnvHints.anonKey}` });
    return;
  }

  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const userId = authData.user.id;

  const readCurrentProfile = async () => supabase
    .from('users')
    .select('role, my_invite_code')
    .eq('id', userId)
    .maybeSingle();

  const { data: profile, error: profileError } = await readCurrentProfile();

  if (profileError || !profile) {
    res.status(404).json({ error: 'User profile not found.' });
    return;
  }

  if (profile.role !== 'parent') {
    res.status(403).json({ error: 'Only parent accounts can request invite codes.' });
    return;
  }

  const existingCode = normalizeInviteCode(profile.my_invite_code);
  if (existingCode) {
    res.status(200).json({ code: existingCode });
    return;
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const nextCode = generateRandomCode();

    const { data: updatedRow, error: updateError } = await supabase
      .from('users')
      .update({ my_invite_code: nextCode })
      .eq('id', userId)
      .eq('role', 'parent')
      .or('my_invite_code.is.null,my_invite_code.eq.')
      .select('my_invite_code')
      .maybeSingle();

    const updatedCode = normalizeInviteCode(updatedRow?.my_invite_code);
    if (updatedCode) {
      res.status(200).json({ code: updatedCode });
      return;
    }

    if (updateError && !isUniqueViolation(updateError)) {
      console.error('[ensure-invite-code] update failed:', updateError);
    }

    const { data: latestProfile, error: latestProfileError } = await readCurrentProfile();
    const latestCode = normalizeInviteCode(latestProfile?.my_invite_code);
    if (!latestProfileError && latestCode) {
      res.status(200).json({ code: latestCode });
      return;
    }

    if (updateError && !isUniqueViolation(updateError)) {
      break;
    }
  }

  res.status(500).json({ error: 'Failed to ensure invite code.' });
}

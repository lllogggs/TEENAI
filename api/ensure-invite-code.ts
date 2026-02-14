import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const getBearerToken = (req: any): string | null => {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
};

const normalizeRpcCode = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'generate_invite_code' in value) {
    const code = (value as { generate_invite_code?: unknown }).generate_invite_code;
    return typeof code === 'string' ? code : '';
  }
  return '';
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({ error: 'Supabase client env is missing.' });
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

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role, my_invite_code')
    .eq('id', userId)
    .single();

  if (profileError || !profile) {
    res.status(404).json({ error: 'User profile not found.' });
    return;
  }

  if (profile.role !== 'parent') {
    res.status(403).json({ error: 'Only parent accounts can request invite codes.' });
    return;
  }

  if (profile.my_invite_code) {
    res.status(200).json({ code: String(profile.my_invite_code).toUpperCase() });
    return;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const rpcResult = await supabase.rpc('generate_invite_code');
    const nextCode = normalizeRpcCode(rpcResult.data);

    if (rpcResult.error || !nextCode) {
      continue;
    }

    const { data: updatedRow } = await supabase
      .from('users')
      .update({ my_invite_code: nextCode })
      .eq('id', userId)
      .eq('role', 'parent')
      .is('my_invite_code', null)
      .select('my_invite_code')
      .single();

    if (updatedRow?.my_invite_code) {
      res.status(200).json({ code: String(updatedRow.my_invite_code).toUpperCase() });
      return;
    }

    const { data: existingRow } = await supabase
      .from('users')
      .select('my_invite_code')
      .eq('id', userId)
      .single();

    if (existingRow?.my_invite_code) {
      res.status(200).json({ code: String(existingRow.my_invite_code).toUpperCase() });
      return;
    }
  }

  res.status(500).json({ error: 'Failed to ensure invite code.' });
}

import { createClient } from '@supabase/supabase-js';
import { requireSupabaseUser } from './_lib/request-guards.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const authContext = await requireSupabaseUser(req, res);
  if (!authContext) return;

  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'Supabase admin 환경 변수가 필요합니다.' });
    return;
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { error: deleteProfileError } = await adminClient.from('users').delete().eq('id', authContext.userId);
  if (deleteProfileError) {
    res.status(500).json({ error: deleteProfileError.message });
    return;
  }

  const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(authContext.userId);
  if (deleteAuthError) {
    res.status(500).json({ error: deleteAuthError.message });
    return;
  }

  res.status(200).json({ ok: true });
}

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const ADMIN_EMAIL_WHITELIST = new Set(['hishersours7@gmail.com']);

const getBearerToken = (req: any): string | null => {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
};

export const requireAdminUser = async (req: any, res: any) => {
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    res.status(500).json({ error: 'Admin API env missing.' });
    return null;
  }

  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const email = (authData.user.email || '').toLowerCase();
  const { data: profile } = await adminClient
    .from('users')
    .select('id, role, email')
    .eq('id', authData.user.id)
    .maybeSingle();

  const shouldBeAdmin = profile?.role === 'admin' || ADMIN_EMAIL_WHITELIST.has(email);
  if (!shouldBeAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }

  if (profile && profile.role !== 'admin') {
    await adminClient.from('users').update({ role: 'admin' }).eq('id', authData.user.id);
  }

  return { userId: authData.user.id, email, adminClient };
};

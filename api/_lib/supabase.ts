import { createClient } from '@supabase/supabase-js';
import { getServiceRoleKeyOrThrow, getSupabaseAnonKey, getSupabaseUrl } from './env';

const buildClientOrThrow = (key: string, token?: string) => {
  const url = getSupabaseUrl();
  if (!url) throw new Error('Missing required server environment: VITE_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL');
  if (!key) throw new Error('Missing required server environment: Supabase key');

  return createClient(url, key, {
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

export const createAnonClientWithAuth = (token?: string) => {
  const anonKey = getSupabaseAnonKey();
  if (!anonKey) throw new Error('Missing required server environment: VITE_SUPABASE_ANON_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return buildClientOrThrow(anonKey, token);
};

export const createServiceRoleClient = () => {
  const serviceRoleKey = getServiceRoleKeyOrThrow();
  return buildClientOrThrow(serviceRoleKey);
};

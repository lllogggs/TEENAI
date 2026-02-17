import { createClient } from '@supabase/supabase-js';

const getSupabaseConfig = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase public env vars are missing.');
  }

  return { supabaseUrl, anonKey, serviceRoleKey: serviceRoleKey || '' };
};

export const createAuthedSupabase = (authHeader?: string | null) => {
  const { supabaseUrl, anonKey } = getSupabaseConfig();

  return createClient(supabaseUrl, anonKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  });
};

export const getSupabaseAdmin = () => {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing.');
  }

  return createClient(supabaseUrl, serviceRoleKey);
};

const readFirst = (...values: Array<string | undefined>) => values.find((value) => typeof value === 'string' && value.trim()) || '';

export const serverSupabaseEnv = {
  url: readFirst(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_URL),
  anonKey: readFirst(process.env.SUPABASE_ANON_KEY, process.env.VITE_SUPABASE_ANON_KEY),
  serviceRoleKey: readFirst(process.env.SUPABASE_SERVICE_ROLE_KEY),
};

export const serverSupabaseEnvHints = {
  url: 'SUPABASE_URL (fallback: VITE_SUPABASE_URL)',
  anonKey: 'SUPABASE_ANON_KEY (fallback: VITE_SUPABASE_ANON_KEY)',
  serviceRoleKey: 'SUPABASE_SERVICE_ROLE_KEY',
};

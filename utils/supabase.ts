import { createClient } from '@supabase/supabase-js';

const viteEnv = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
const nodeEnv = typeof process !== 'undefined' ? process.env : undefined;

const supabaseUrl = viteEnv?.VITE_SUPABASE_URL || nodeEnv?.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = viteEnv?.VITE_SUPABASE_ANON_KEY || nodeEnv?.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseUrl !== 'https://placeholder.supabase.co' &&
  supabaseAnonKey &&
  supabaseAnonKey !== 'placeholder-key'
);

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

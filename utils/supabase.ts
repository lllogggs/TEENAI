import { createClient } from '@supabase/supabase-js';
import { Database } from '../types';

// [수정] import.meta.env (Vite 방식) -> process.env (Next.js 방식)
// [수정] VITE_ 접두사 -> NEXT_PUBLIC_ 접두사 (이미 Vercel에 키 이름도 바꿨다면)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 만약 Vercel 환경변수 이름은 그대로 VITE_...로 뒀다면 아래처럼 쓰세요:
// const supabaseUrl = process.env.NEXT_PUBLIC_VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL!;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

export const isSupabaseConfigured = () => {
  return !!supabaseUrl && !!supabaseAnonKey;
};

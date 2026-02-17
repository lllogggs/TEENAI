const parseNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const getPublicEnv = (viteKey: string, nextPublicKey: string): string => {
  const value = process.env[viteKey] || process.env[nextPublicKey] || '';
  return value.trim();
};

export const getSupabaseUrl = (): string => getPublicEnv('VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');

export const getSupabaseAnonKey = (): string => getPublicEnv('VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');

export const getGeminiKeyOrThrow = (): string => {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key) throw new Error('Missing required server environment: GEMINI_API_KEY');
  return key;
};

export const getServiceRoleKeyOrThrow = (): string => {
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!key) throw new Error('Missing required server environment: SUPABASE_SERVICE_ROLE_KEY');
  return key;
};

export const getRateLimitConfig = () => ({
  chat: {
    windowSec: parseNumber(process.env.CHAT_RATE_LIMIT_WINDOW_SEC, 60),
    max: parseNumber(process.env.CHAT_RATE_LIMIT_MAX, 20),
  },
  summary: {
    windowSec: parseNumber(process.env.SUMMARY_RATE_LIMIT_WINDOW_SEC, 60),
    max: parseNumber(process.env.SUMMARY_RATE_LIMIT_MAX, 10),
  },
  profile: {
    windowSec: parseNumber(process.env.PROFILE_RATE_LIMIT_WINDOW_SEC, 60),
    max: parseNumber(process.env.PROFILE_RATE_LIMIT_MAX, 10),
  },
});

export const getSummaryConfig = () => ({
  idleMinSec: parseNumber(process.env.SUMMARY_IDLE_MIN_SEC, 60),
  everyN: parseNumber(process.env.SUMMARY_EVERY_N_MESSAGES, 6),
  maxHistory: parseNumber(process.env.SUMMARY_MAX_HISTORY_MESSAGES, 30),
});

export const getAllowedOrigins = (): string[] | null => {
  const raw = (process.env.ALLOWED_ORIGINS || '').trim();
  if (!raw) return null;
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length ? origins : null;
};

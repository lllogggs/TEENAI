import { createClient } from '@supabase/supabase-js';
import { serverSupabaseEnv, serverSupabaseEnvHints } from './supabase-env.js';

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

const SUPABASE_URL = serverSupabaseEnv.url;
const SUPABASE_ANON_KEY = serverSupabaseEnv.anonKey;

const getBearerToken = (req: any): string | null => {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
};

const getClientIp = (req: any): string => {
  const xff = req.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown-ip';
};

export const requireSupabaseUser = async (req: any, res: any): Promise<{ userId: string; ip: string } | null> => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    res.status(500).json({ error: `Supabase client env is missing. Required: ${serverSupabaseEnvHints.url}, ${serverSupabaseEnvHints.anonKey}` });
    return null;
  }

  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role, subscription_expires_at')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!profileError && profile && profile.role !== 'admin' && profile.subscription_expires_at) {
    const expiresAt = new Date(profile.subscription_expires_at).getTime();
    if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
      res.status(403).json({ error: '서비스 이용 기간이 만료되었습니다. 관리자에게 문의하세요.' });
      return null;
    }
  }

  return { userId: data.user.id, ip: getClientIp(req) };
};

export const enforceRateLimit = (res: any, key: string, maxRequests: number, windowMs: number): boolean => {
  const now = Date.now();
  const existing = rateLimitStore.get(key);

  if (!existing || now >= existing.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (existing.count >= maxRequests) {
    const retryAfterSec = Math.max(Math.ceil((existing.resetAt - now) / 1000), 1);
    res.setHeader('Retry-After', String(retryAfterSec));
    res.status(429).json({ error: 'Too many requests' });
    return false;
  }

  existing.count += 1;
  rateLimitStore.set(key, existing);
  return true;
};

export const validateTextLength = (value: string, maxLength: number): boolean => {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
};

export const validateOptionalBase64DataUrl = (
  value: unknown,
  mimePattern: RegExp,
  maxBytes: number,
): boolean => {
  if (value == null) return true;
  if (typeof value !== 'string') return false;

  const match = value.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return false;

  const mimeType = match[1];
  const base64Body = match[2];

  if (!mimePattern.test(mimeType)) return false;
  const estimatedBytes = Math.floor((base64Body.length * 3) / 4);
  return estimatedBytes <= maxBytes;
};

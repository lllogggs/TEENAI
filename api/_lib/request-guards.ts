import { createClient } from '@supabase/supabase-js';
import { serverSupabaseEnv, serverSupabaseEnvHints } from './supabase-env.js';

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  allowed: boolean;
  retryAfterSec: number;
  currentCount: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

const SUPABASE_URL = serverSupabaseEnv.url;
const SUPABASE_ANON_KEY = serverSupabaseEnv.anonKey;
const SUPABASE_SERVICE_ROLE_KEY = serverSupabaseEnv.serviceRoleKey;

const adminSupabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  : null;

const getBearerToken = (req: any): string | null => {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
};

export const getClientIp = (req: any): string => {
  const xff = req.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown-ip';
};

const enforceMemoryRateLimit = (key: string, maxRequests: number, windowMs: number): RateLimitResult => {
  const now = Date.now();

  if (rateLimitStore.size > 1000) {
    for (const [k, value] of rateLimitStore.entries()) {
      if (now >= value.resetAt) {
        rateLimitStore.delete(k);
      }
    }
  }

  const existing = rateLimitStore.get(key);

  if (!existing || now >= existing.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0, currentCount: 1 };
  }

  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSec: Math.max(Math.ceil((existing.resetAt - now) / 1000), 1),
      currentCount: existing.count,
    };
  }

  existing.count += 1;
  rateLimitStore.set(key, existing);
  return { allowed: true, retryAfterSec: 0, currentCount: existing.count };
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

export const consumeRateLimit = async (key: string, maxRequests: number, windowMs: number): Promise<RateLimitResult> => {
  let result: RateLimitResult | null = null;

  if (adminSupabase) {
    const { data, error } = await adminSupabase.rpc('consume_rate_limit', {
      p_key: key,
      p_max_requests: maxRequests,
      p_window_ms: windowMs,
    });

    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      result = {
        allowed: Boolean(row?.allowed),
        retryAfterSec: Number(row?.retry_after_sec || 0),
        currentCount: Number(row?.current_count || 0),
      };
    } else {
      console.error('Persistent rate limit fallback engaged:', error.message || error);
    }
  }

  return result || enforceMemoryRateLimit(key, maxRequests, windowMs);
};

export const enforceRateLimit = async (res: any, key: string, maxRequests: number, windowMs: number): Promise<boolean> => {
  const finalResult = await consumeRateLimit(key, maxRequests, windowMs);
  if (!finalResult.allowed) {
    res.setHeader('Retry-After', String(finalResult.retryAfterSec));
    res.status(429).json({ error: 'Too many requests' });
    return false;
  }

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

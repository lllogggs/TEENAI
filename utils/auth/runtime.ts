import { DEMO_MODE_STORAGE_KEY, REQUIRED_SUPABASE_ENV_VARS } from './constants';

export const getSignupName = (email: string) => {
  const emailPrefix = email.split('@')[0]?.trim();
  return emailPrefix || 'User';
};

export const getMissingSupabaseEnvVars = () => REQUIRED_SUPABASE_ENV_VARS.filter((key) => {
  const env = import.meta.env as Record<string, string | undefined>;
  const value = env[key];
  return !value || String(value).includes('placeholder');
});

export const shouldEnableDemoMode = () => {
  if (typeof window === 'undefined') return false;

  const query = new URLSearchParams(window.location.search);
  const byQuery = query.get('demo') === '1';
  const byStorage = window.localStorage.getItem(DEMO_MODE_STORAGE_KEY) === 'true';
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

  return byQuery || byStorage || isLocal;
};

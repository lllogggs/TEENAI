const DEFAULT_PROD_CALLBACK_URL = 'https://forteenai.com/auth/callback';
const OAUTH_CALLBACK_PATH = '/auth/callback';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const normalizeUrl = (value: string) => {
  const trimmed = trimTrailingSlash(String(value || '').trim());
  return trimmed ? trimmed : null;
};

const getRuntimeOverride = () => {
  const envOverride = normalizeUrl(import.meta.env.VITE_OAUTH_REDIRECT_URL);
  if (envOverride) {
    return `${envOverride}${OAUTH_CALLBACK_PATH}`;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  const origin = normalizeUrl(window.location.origin);
  if (!origin) {
    return null;
  }

  return `${origin}${OAUTH_CALLBACK_PATH}`;
};

export const getOAuthRedirectUrl = () => getRuntimeOverride() || DEFAULT_PROD_CALLBACK_URL;

export const isAuthCallbackPath = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.location.pathname === OAUTH_CALLBACK_PATH;
};

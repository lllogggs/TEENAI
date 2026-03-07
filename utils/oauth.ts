const LOCAL_CALLBACK_URL = 'http://localhost:5173/auth/callback';
const PROD_CALLBACK_URL = 'https://forteenai.com/auth/callback';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

const isLocalHostname = (hostname: string) => LOCAL_HOSTNAMES.has(hostname);

export const getOAuthRedirectUrl = () => {
  if (typeof window === 'undefined') {
    return PROD_CALLBACK_URL;
  }

  return isLocalHostname(window.location.hostname) ? LOCAL_CALLBACK_URL : PROD_CALLBACK_URL;
};

export const isAuthCallbackPath = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.location.pathname === '/auth/callback';
};

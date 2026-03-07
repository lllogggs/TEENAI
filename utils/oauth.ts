const LOCAL_CALLBACK_URL = 'http://localhost:5173/auth/callback';
const DEFAULT_PROD_CALLBACK_URL = 'https://forteenai.com/auth/callback';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);
const FORTEENAI_HOSTNAMES = new Set(['forteenai.com', 'www.forteenai.com']);

const isLocalHostname = (hostname: string) => LOCAL_HOSTNAMES.has(hostname);

const getForteenaiCallbackUrl = () => {
  if (typeof window === 'undefined') {
    return DEFAULT_PROD_CALLBACK_URL;
  }

  const { protocol, hostname, host } = window.location;

  if (isLocalHostname(hostname)) {
    return LOCAL_CALLBACK_URL;
  }

  if (FORTEENAI_HOSTNAMES.has(hostname)) {
    return `${protocol}//${host}/auth/callback`;
  }

  return DEFAULT_PROD_CALLBACK_URL;
};

export const getOAuthRedirectUrl = () => getForteenaiCallbackUrl();

export const isAuthCallbackPath = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.location.pathname === '/auth/callback';
};

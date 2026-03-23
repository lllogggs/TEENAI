const LOCAL_AUTH_CALLBACK = 'http://localhost:5173/auth/callback';

export const resolveOAuthRedirectUrl = ({
  isNativeWebView,
  currentOrigin,
  envRedirectUrl,
}: {
  isNativeWebView: boolean;
  currentOrigin?: string | null;
  envRedirectUrl?: string | null;
}) => {
  if (isNativeWebView) return 'forteenai://auth/callback';

  const normalizedEnvRedirect = typeof envRedirectUrl === 'string' ? envRedirectUrl.trim() : '';
  if (normalizedEnvRedirect) return normalizedEnvRedirect;

  const normalizedOrigin = typeof currentOrigin === 'string' ? currentOrigin.trim() : '';
  if (normalizedOrigin) {
    return new URL('/auth/callback', normalizedOrigin).toString();
  }

  return LOCAL_AUTH_CALLBACK;
};

export const getOAuthRedirectUrl = (isNativeWebView: boolean) => resolveOAuthRedirectUrl({
  isNativeWebView,
  currentOrigin: typeof window !== 'undefined' ? window.location.origin : undefined,
  envRedirectUrl: import.meta.env.VITE_SUPABASE_AUTH_REDIRECT_URL,
});

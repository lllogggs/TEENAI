import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import * as Linking from 'expo-linking';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  Linking as NativeLinking,
} from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';

const getWebUrl = () => {
  const url = Constants.expoConfig?.extra?.webAppUrl as string | undefined;
  return url?.trim();
};

const getAllowedOrigins = (url: string): string[] => {
  try {
    const parsed = new URL(url);
    return [parsed.origin];
  } catch {
    return [];
  }
};

export default function App() {
  const webUrl = useMemo(() => getWebUrl(), []);
  const allowedOrigins = useMemo(() => (webUrl ? getAllowedOrigins(webUrl) : []), [webUrl]);
  const webViewRef = useRef<WebView>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);

  const sendOAuthResultToWeb = useCallback((url: string) => {
    try {
      const parsed = new URL(url);
      const query = new URLSearchParams(parsed.search);
      const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
      const accessToken = query.get('access_token') || hash.get('access_token');
      const refreshToken = query.get('refresh_token') || hash.get('refresh_token');
      if (!accessToken || !refreshToken) return;

      const payload = JSON.stringify({ type: 'social_oauth_result', accessToken, refreshToken });
      webViewRef.current?.injectJavaScript(`window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(payload)} })); true;`);
    } catch {
      // noop
    }
  }, []);

  const onNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack);
  }, []);

  const reloadWebView = useCallback(() => {
    setHasLoadError(false);
    setIsLoading(true);
    webViewRef.current?.reload();
  }, []);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    reloadWebView();
    setTimeout(() => setIsRefreshing(false), 350);
  }, [reloadWebView]);

  const handleShouldStartLoad = useCallback(
    (requestUrl: string) => {
      if (!allowedOrigins.length) {
        return true;
      }

      try {
        const requestOrigin = new URL(requestUrl).origin;
        const isAllowed = allowedOrigins.includes(requestOrigin);

        if (!isAllowed) {
          // Keep navigation inside in-app WebView for store compliance.
          return true;
        }
      } catch {
        return true;
      }

      return true;
    },
    [allowedOrigins],
  );

  React.useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) {
        webViewRef.current?.goBack();
        return true;
      }
      return false;
    });

    return () => subscription.remove();
  }, [canGoBack]);



  React.useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => sendOAuthResultToWeb(url));
    Linking.getInitialURL().then((url) => {
      if (url) sendOAuthResultToWeb(url);
    }).catch(() => undefined);
    return () => sub.remove();
  }, [sendOAuthResultToWeb]);

  if (!webUrl || webUrl.includes('YOUR-WEB-APP-URL')) {
    return (
      <SafeAreaView style={styles.fallbackContainer}>
        <StatusBar style="dark" translucent backgroundColor="transparent" />
        <View style={styles.fallbackBox}>
          <Text style={styles.title}>포틴AI 모바일 앱 설정 필요</Text>
          <Text style={styles.description}>
            mobile-app/app.json의 expo.extra.webAppUrl에 웹 배포 URL을 넣어주세요.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />

      {hasLoadError ? (
        <View style={styles.errorContainer}>
          <View style={styles.errorBox}>
            <Text style={styles.title}>연결에 문제가 있어요</Text>
            <Text style={styles.description}>
              네트워크 상태를 확인하고 다시 시도해주세요.
            </Text>
            <Pressable onPress={reloadWebView} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>다시 시도</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <WebView
          ref={webViewRef}
          source={{ uri: webUrl }}
          style={styles.webview}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#2563eb" />
            </View>
          )}
          pullToRefreshEnabled
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#2563eb" />
          }
          allowsBackForwardNavigationGestures
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          setSupportMultipleWindows={false}
          onNavigationStateChange={onNavigationStateChange}
          onLoadStart={() => {
            setIsLoading(true);
            setHasLoadError(false);
          }}
          onLoadEnd={() => setIsLoading(false)}
          onError={() => {
            setHasLoadError(true);
            setIsLoading(false);
          }}

          onMessage={(event) => {
            try {
              const payload = JSON.parse(event.nativeEvent.data);
              if (payload?.type === 'oauth_start' && payload?.url) {
                NativeLinking.openURL(payload.url);
              }
            } catch {
              // noop
            }
          }}
          onShouldStartLoadWithRequest={({ url }) => handleShouldStartLoad(url)}
        />
      )}

      {isLoading && !hasLoadError ? (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#1d4ed8" />
          <Text style={styles.loadingText}>불러오는 중...</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 56,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#eff6ff',
  },
  loadingText: {
    fontSize: 13,
    color: '#1e3a8a',
    fontWeight: '600',
  },
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 24,
  },
  fallbackBox: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 24,
  },
  errorBox: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
    gap: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    color: '#0f172a',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: '#334155',
  },
  retryButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderRadius: 12,
    backgroundColor: '#2563eb',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});

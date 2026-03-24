import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  Linking as NativeLinking,
} from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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

const injectParentRouteScript = `window.location.href = '/parent'; true;`;

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const permissionResult = await Notifications.requestPermissionsAsync();
    finalStatus = permissionResult.status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2563eb',
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    return null;
  }

  const pushToken = await Notifications.getExpoPushTokenAsync({ projectId });
  return pushToken.data;
}

export default function App() {
  const webUrl = useMemo(() => getWebUrl(), []);
  const allowedOrigins = useMemo(() => (webUrl ? getAllowedOrigins(webUrl) : []), [webUrl]);
  const webViewRef = useRef<WebView>(null);
  const webViewToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showNetworkToast, setShowNetworkToast] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const pendingOAuthNonceRef = useRef<string | null>(null);

  const sendPushTokenToWeb = useCallback((token: string | null) => {
    if (!token) return;

    const payload = JSON.stringify({ type: 'expo_push_token', token, source: 'forteenai-mobile' });
    webViewRef.current?.injectJavaScript(
      `window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(payload)} })); true;`
    );
  }, []);

  const routeWebViewToParentDashboard = useCallback(() => {
    setPendingRoute('/parent');
  }, []);

  const sendOAuthResultToWeb = useCallback((url: string) => {
    try {
      const parsed = new URL(url);
      const query = new URLSearchParams(parsed.search);
      const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
      const accessToken = query.get('access_token') || hash.get('access_token');
      const refreshToken = query.get('refresh_token') || hash.get('refresh_token');
      if (!accessToken || !refreshToken) return;

      const payload = JSON.stringify({
        type: 'social_oauth_result',
        accessToken,
        refreshToken,
        nonce: pendingOAuthNonceRef.current,
        source: 'forteenai-mobile',
      });
      webViewRef.current?.injectJavaScript(`window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(payload)} })); true;`);
    } catch {
      // noop
    }
  }, []);

  const onNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack);
  }, []);

  const showNetworkErrorToast = useCallback(() => {
    setShowNetworkToast(true);

    if (webViewToastTimeoutRef.current) {
      clearTimeout(webViewToastTimeoutRef.current);
    }

    webViewToastTimeoutRef.current = setTimeout(() => {
      setShowNetworkToast(false);
      webViewToastTimeoutRef.current = null;
    }, 2500);
  }, []);

  const reloadWebView = useCallback(() => {
    setShowNetworkToast(false);
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
      if (!requestUrl) return false;

      const isHttpUrl = /^https?:/i.test(requestUrl);
      if (!isHttpUrl) {
        NativeLinking.openURL(requestUrl).catch(() => undefined);
        return false;
      }

      if (!allowedOrigins.length) {
        return true;
      }

      try {
        const requestOrigin = new URL(requestUrl).origin;
        const isAllowed = allowedOrigins.includes(requestOrigin);

        if (!isAllowed) {
          NativeLinking.openURL(requestUrl).catch(() => undefined);
          return false;
        }
      } catch {
        return false;
      }

      return true;
    },
    [allowedOrigins],
  );

  useEffect(() => {
    registerForPushNotificationsAsync()
      .then((token) => {
        if (token) {
          setExpoPushToken(token);
        }
      })
      .catch(() => undefined);

    const notificationResponseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (url === '/parent') {
        routeWebViewToParentDashboard();
        return;
      }

      routeWebViewToParentDashboard();
    });

    return () => {
      notificationResponseSubscription.remove();
    };
  }, [routeWebViewToParentDashboard]);

  useEffect(() => {
    if (!expoPushToken) return;
    sendPushTokenToWeb(expoPushToken);
  }, [expoPushToken, sendPushTokenToWeb]);

  useEffect(() => {
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        const url = response?.notification.request.content.data?.url;
        if (url === '/parent') {
          routeWebViewToParentDashboard();
        }
      })
      .catch(() => undefined);
  }, [routeWebViewToParentDashboard]);

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

  React.useEffect(() => () => {
    if (webViewToastTimeoutRef.current) {
      clearTimeout(webViewToastTimeoutRef.current);
    }
  }, []);

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
        bounces={false}
        overScrollMode="never"
        onNavigationStateChange={onNavigationStateChange}
        onLoadStart={() => {
          setIsLoading(true);
        }}
        onLoadEnd={() => {
          setIsLoading(false);
          sendPushTokenToWeb(expoPushToken);
          SplashScreen.hideAsync().catch(() => undefined);
          if (pendingRoute) {
            webViewRef.current?.injectJavaScript(`window.location.href = '${pendingRoute}'; true;`);
            setPendingRoute(null);
          }
        }}
        onError={() => {
          setIsLoading(false);
          showNetworkErrorToast();
        }}
        onHttpError={() => {
          setIsLoading(false);
          showNetworkErrorToast();
        }}
        onMessage={(event) => {
          try {
            const payload = JSON.parse(event.nativeEvent.data);
            if (payload?.type === 'oauth_start' && payload?.url) {
              pendingOAuthNonceRef.current = typeof payload?.nonce === 'string' ? payload.nonce : null;
              NativeLinking.openURL(payload.url);
            }
          } catch {
            // noop
          }
        }}
        onShouldStartLoadWithRequest={({ url }) => handleShouldStartLoad(url)}
      />

      {isLoading ? (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#1d4ed8" />
          <Text style={styles.loadingText}>불러오는 중...</Text>
        </View>
      ) : null}

      {showNetworkToast ? (
        <View pointerEvents="none" style={styles.toastContainer}>
          <Text style={styles.toastText}>네트워크 연결이 불안정합니다</Text>
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
  toastContainer: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
  },
  toastText: {
    fontSize: 13,
    color: '#ffffff',
    fontWeight: '600',
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
});

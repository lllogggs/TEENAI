import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

const getWebUrl = () => {
  const url = Constants.expoConfig?.extra?.webAppUrl as string | undefined;
  return url?.trim();
};

export default function App() {
  const webUrl = useMemo(() => getWebUrl(), []);

  if (!webUrl || webUrl.includes('YOUR-WEB-APP-URL')) {
    return (
      <SafeAreaView style={styles.fallbackContainer}>
        <StatusBar style="dark" />
        <View style={styles.fallbackBox}>
          <Text style={styles.title}>TEENAI 모바일 앱 설정 필요</Text>
          <Text style={styles.description}>
            mobile-app/app.json의 expo.extra.webAppUrl에 웹 배포 URL을 넣어주세요.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <WebView
        source={{ uri: webUrl }}
        style={styles.webview}
        startInLoadingState
        allowsBackForwardNavigationGestures
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
      />
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

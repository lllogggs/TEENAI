# TEENAI Mobile (Twin App)

웹 버전과 완전히 동일한 UI/기능을 모바일에서 제공하기 위해 `WebView` 기반 Expo 앱을 구성했습니다.

## 1) 설치

```bash
cd mobile-app
npm install
```

## 2) 웹 URL 연결

`mobile-app/app.json`에서 아래 값을 실제 웹 배포 주소로 수정하세요.

```json
"extra": {
  "webAppUrl": "https://your-teenai-web-url"
}
```

## 3) 실행

```bash
npm run start
```

그 다음 Expo Go 앱(실기기) 또는 에뮬레이터에서 실행하면 됩니다.

## 참고

- 웹이 이미 `/api/chat`, `/api/session-meta`, `/api/title` 및 Supabase와 연결되어 있으므로,
  앱은 동일한 웹을 렌더링해 기능/화면을 동일하게 유지합니다.
- 네이티브 전용 기능(푸시, 오프라인 저장, 생체인증 등)은 다음 단계에서 점진적으로 이관할 수 있습니다.

## 4) 출시 전 네이티브 UX 개선(2차)

현재 모바일 앱에는 아래 개선이 반영되어 있습니다.

- 앱 내 로딩 인디케이터 + 오류 화면/재시도 버튼
- Android 하드웨어 뒤로가기 시 WebView 히스토리 뒤로 이동
- Pull to refresh(당겨서 새로고침)
- 외부 도메인 링크는 시스템 브라우저로 분리 오픈

덕분에 WebView 기반이어도 실제 앱 사용감이 더 자연스럽고,
초기 마켓 출시 품질 기준을 맞추기 쉬워집니다.

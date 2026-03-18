<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# TEENAI

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Create `.env.local` and set:
   - `GEMINI_API_KEY=...` (serverless `/api/chat`, `/api/session-meta`, `/api/title`에서 사용)
   - `VITE_SUPABASE_URL=...`
   - `VITE_SUPABASE_ANON_KEY=...`
3. Run app:
   `npm run dev`


## 캡처 화면이 안내화면으로 나오는 경우(중요)

자동 캡처에서 아래 두 값이 비어 있거나 placeholder면 실제 앱 대신 `Supabase 연결 필요` 화면이 찍힙니다.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

배포/캡처 전에 아래 체크를 먼저 실행하세요.

```bash
node scripts/validate-env.mjs
```

환경변수가 없어도 화면 캡처/리뷰를 진행해야 할 때는 아래 방법 중 하나로 데모 모드를 켜세요.

- URL에 `?demo=1` 추가 (예: `http://localhost:3000/?demo=1`)
- 안내 화면의 **"데모 모드로 계속하기 (캡처 가능)"** 버튼 클릭

로컬에서 빌드 검증만 잠시 하고 싶다면(의도적으로 env 없이) 아래처럼 우회할 수 있습니다.

```bash
SKIP_ENV_VALIDATION=1 npm run build
```

## Supabase DB SQL (필수)

Supabase SQL Editor에서 아래 순서대로 실행하세요.

1. `supabase/schema.sql`
2. `supabase/migrations/*.sql` 파일을 **파일명 순서대로 전체 실행**
   - `20260215_chat_summary_and_invite_code.sql`
   - `20260217_add_chat_title.sql`
   - `20260218_fix_chat_sessions_title_and_risk_constraint.sql`
   - `20260220_admin_codes_and_ops_tables.sql`

> 참고: `supabase_schema.sql`은 더 이상 실행 대상이 아니며, 과거 내용을 migration으로 이관한 안내 파일입니다.


## Mobile App (웹 쌍둥이 버전)

동일한 UI/기능을 앱으로 제공하려면 `mobile-app`(Expo + WebView)을 사용하세요.

1. `cd mobile-app && npm install`
2. `mobile-app/app.json`의 `expo.extra.webAppUrl`에 웹 배포 URL 입력
3. `npm run start`

상세 내용은 `mobile-app/README.md`를 참고하세요.

- 모바일 앱은 2차 개선으로 로딩/오류 재시도, Android 뒤로가기 WebView 연동, pull-to-refresh, 외부링크 브라우저 분리를 포함합니다.

## Vercel Environment Variables

Vercel Production 환경에는 아래 환경 변수를 반드시 설정해야 `npm run build`와 서버리스 런타임이 함께 정상 동작합니다.

- `GEMINI_API_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (부모 등록코드 기반 서버 회원가입 API에서 사용)

배포 전에는 Vercel Project Settings > Environment Variables에서 위 4개 값이 모두 **Production** 타깃에 연결되어 있는지 확인하세요. 특히 로컬 테스트용 키를 그대로 복사하지 않았는지, Supabase 프로젝트 URL/Anon Key/Service Role Key가 동일한 프로덕션 프로젝트를 가리키는지 교차 검증하는 것을 권장합니다.

## Notes

- Gemini 호출은 클라이언트에서 직접 수행하지 않고, Vercel Serverless API(`/api/chat`, `/api/session-meta`, `/api/title`)를 통해서만 처리합니다.
- 학생 채팅 세션은 메시지 전송 시 `/api/session-meta`를 통해 AI가 제목(`chat_sessions.title`)과 심리 위험도(`chat_sessions.risk_level`)를 함께 분류합니다.
- 학부모 대시보드는 세션 제목 목록과 메시지 원문(`messages`)을 조회합니다.

## 기존 대화 백필 (제목/위험도 일괄 업데이트)

기존 DB 레코드도 AI 기준으로 업데이트할 수 있습니다.

1. 아래 환경 변수를 설정하세요.
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GEMINI_API_KEY`
2. 먼저 드라이런으로 확인하세요.

```bash
node scripts/backfill-chat-metadata.mjs --dry-run --limit=50
```

3. 실제 반영:

```bash
node scripts/backfill-chat-metadata.mjs --limit=50
```

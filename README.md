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

Vercel에 아래 환경 변수를 반드시 설정해야 동작합니다.

- `GEMINI_API_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (부모 등록코드 기반 서버 회원가입 API에서 사용)

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

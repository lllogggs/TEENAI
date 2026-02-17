<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# TEENAI

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Create `.env.local` and set:
   - `GEMINI_API_KEY=...` (serverless `/api/chat`, `/api/title`에서만 사용)
   - `VITE_SUPABASE_URL=...`
   - `VITE_SUPABASE_ANON_KEY=...`
3. Run app:
   `npm run dev`

## Supabase DB SQL (필수)

Supabase SQL Editor에서 아래 순서대로 실행하세요.

1. `supabase/schema.sql`
2. 제목 컬럼 마이그레이션 SQL

```sql
alter table public.chat_sessions
  add column if not exists title text not null default '새 대화';
```

또는 `supabase/migrations/20260217_add_chat_title.sql` 파일을 실행해도 됩니다.

## Vercel Environment Variables

Vercel에 아래 환경 변수를 반드시 설정해야 동작합니다.

- `GEMINI_API_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Notes

- Gemini 호출은 클라이언트에서 직접 수행하지 않고, Vercel Serverless API(`/api/chat`, `/api/title`)를 통해서만 처리합니다.
- 학생 채팅 세션은 첫 메시지 전송 시 자동으로 제목이 생성되어 `chat_sessions.title`에 저장됩니다.
- 학부모 대시보드는 세션 제목 목록과 메시지 원문(`messages`)을 조회합니다.

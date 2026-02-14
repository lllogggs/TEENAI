<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# TEENAI

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Create `.env.local` and set:
   - `GEMINI_API_KEY=...` (serverless `/api/chat`에서 사용)
   - `VITE_SUPABASE_URL=...`
   - `VITE_SUPABASE_ANON_KEY=...`
3. Run app:
   `npm run dev`

## Vercel Environment Variables

Vercel에 아래 환경 변수를 반드시 설정해야 실제 서비스가 동작합니다.

- `GEMINI_API_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## What was fixed

- Vite 엔트리 누락(`index.html`의 `index.tsx` 미로딩)으로 빈 화면이 나오는 문제를 수정했습니다.
- 인증/회원가입 플로우를 Supabase Auth + DB(users, student_profiles)로 통일했습니다.
- 학부모 인증코드 6자리 랜덤 생성 및 DB 저장/학생 계정 연동을 보강했습니다.
- Gemini 호출을 Vercel Serverless Function(`/api/chat`)으로 제공하도록 추가했습니다.

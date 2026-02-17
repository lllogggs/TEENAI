<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# TEENAI

## Environment Variables

Use `.env.example` as the source of truth.

- **Client-safe only**
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - (`NEXT_PUBLIC_*` variants are also supported for compatibility)
- **Server-only secrets (must never be exposed in client bundle)**
  - `GEMINI_API_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- **Optional tuning**
  - Chat/Summary/Profile rate limits
  - Summary trigger controls (`SUMMARY_IDLE_MIN_SEC`, `SUMMARY_EVERY_N_MESSAGES`, `SUMMARY_MAX_HISTORY_MESSAGES`)
  - `ALLOWED_ORIGINS`

> Server-only secrets must be set in Vercel project settings, **NOT** in client code.

## Local Run

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy env template and set values:
   ```bash
   cp .env.example .env.local
   ```
3. Run dev server:
   ```bash
   npm run dev
   ```

## Supabase DB SQL (필수)

- `supabase/schema.sql`은 **reference-only** 파일입니다. 직접 SQL Editor에서 실행하지 마세요.
- DB 스키마 변경은 반드시 `supabase/migrations/`에 SQL 파일을 추가하는 방식으로 관리합니다.
- 모든 신규 DB 변경은 14자리 timestamp prefix(`YYYYMMDDHHMMSS`) migration 파일로만 추가합니다.
- CI 실패 시 Supabase SQL Editor에서 `select version, name from supabase_migrations.schema_migrations order by version desc;`로 적용 여부를 확인하세요.
- 초기 스키마 파일(`000000...`)은 reference 용도로만 보관하고, 이미 migration 이력이 있는 프로젝트의 `supabase/migrations/`에는 두지 않습니다.
- `main` 브랜치에 push되면 GitHub Actions(`.github/workflows/supabase-db-push.yml`)가 자동으로 `supabase db push`를 실행해 원격 DB에 반영합니다.
- 적용 여부는 Supabase Dashboard에서 `supabase_migrations.schema_migrations` 테이블을 확인하세요.

### GitHub Secrets (Supabase DB Push CI)

GitHub 저장소 `Settings > Secrets and variables > Actions`에 아래 3개를 설정해야 합니다.

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_PASSWORD`

### API smoke test

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"newMessage":"hi","history":[],"parentStylePrompt":""}'
```

## Vercel Deployment Settings

Set these env vars in Vercel:

- Public/client build:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Server-only:
  - `GEMINI_API_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`

For test deployments, set env values for **Preview** as well as **Production** (and Development when needed).

## Security Checks

Run these checks before release:

```bash
rg -n "GEMINI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|process\.env\.API_KEY" .
```

If `dist/` exists after a build:

```bash
rg -n "GEMINI_API_KEY|SUPABASE_SERVICE_ROLE_KEY" dist || true
```

Runtime checks:
- `/api/chat` returns `401` without Bearer token.
- `/api/chat` returns `429` when request rate exceeds threshold.
- `/api/session-summary` updates `chat_sessions.summary` and `chat_sessions.risk_level` when trigger conditions are met.

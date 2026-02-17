<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# TEENAI

## Environment Variables

Use `.env.example` as the source of truth.

- **Client-safe only**
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
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

If you use Supabase locally/remotely, ensure your project schema and RLS policies are applied from:
- `supabase/schema.sql`

### API smoke test

```bash
curl -X POST http://localhost:5173/api/chat \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"newMessage":"hi","history":[],"parentStylePrompt":""}'
```

## Vercel Deployment Settings

Set these env vars in Vercel:

- Public/client build:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
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

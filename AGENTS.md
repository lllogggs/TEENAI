# TEENAI Agent Guide

## Project Shape

- Web app: Vite + React + TypeScript at the repository root.
- Mobile app: Expo WebView wrapper in `mobile-app/`.
- Serverless APIs: Vercel-style functions in `api/`.
- Database: Supabase project `hpoekvinyjbymnctggih` (`TEEN AI`).
- Deployment: Vercel project `lllogggs-projects/teenai`.

## Local Setup

1. Install root dependencies with `npm install`.
2. Install mobile dependencies with `cd mobile-app && npm install`.
3. Restore local environment variables from Vercel:

```powershell
npx vercel env pull .env.local --yes --environment=production --scope lllogggs-projects --global-config .vercel-global
```

4. Run the web app with `npm run dev`.

The local `.env.local` file is intentionally ignored. Do not commit secrets.

## Verification

Before pushing, run the checks that match the change:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
```

Environment checks:

```powershell
node scripts/validate-env.mjs --target=client
node scripts/validate-env.mjs --target=server
```

## Supabase

Use the npm wrappers instead of calling `supabase` directly. They temporarily move `.env.local` aside so Supabase CLI does not fail on JSON env values such as `GOOGLE_APPLICATION_CREDENTIALS_JSON`.

```powershell
npm run db:projects
npm run db:link
npm run db:migrations
npm run db:push
```

Remote migration checks and pushes need `SUPABASE_DB_PASSWORD` in the shell:

```powershell
$env:SUPABASE_DB_PASSWORD='<database-password>'
npm run db:migrations
```

Current migration strategy:

- Active baseline: `supabase/migrations/20260417144403_remote_schema.sql`
- Historical files: `supabase/migrations_archive/`
- Add future DB changes as new migrations under `supabase/migrations/`.

## MCP And Skills

- GitHub work can use the available GitHub plugin/connector when issues, PRs, or remote repository metadata are needed.
- Use the `openai-docs` skill for OpenAI API/product questions that require current official docs.
- No project-specific MCP server is required for normal TEENAI development at this point.

## Notes For Agents

- Preserve existing React/Vite patterns unless a change clearly needs a new abstraction.
- Keep Supabase secrets out of committed files.
- Do not rewrite the archived migrations unless the user explicitly asks to rebuild migration history.
- If Docker Desktop is unavailable, `supabase db pull` may fail. Keep working from the current baseline and add incremental migrations.

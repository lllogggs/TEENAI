# Supabase Migration Rules

1) 파일명 규칙: `YYYYMMDDHHMMSS_description.sql`
2) 파괴적 변경(`drop`, `alter ... drop`)은 반드시 별도 PR + 리뷰로 진행
3) 컬럼/정책 추가 시 가능하면 `IF NOT EXISTS` 사용
4) `schema.sql` 직접 실행 금지
5) CI 실패 시 DB는 적용되지 않으므로 GitHub Actions 로그 확인

6) 이미 원격에 migration 이력이 존재하는 프로젝트에서는 `000000...` init_schema 파일을 `supabase/migrations/`에 두지 않는다.
7) 모든 신규 변경은 14자리 timestamp(`YYYYMMDDHHMMSS`) prefix migration으로만 추가한다.
8) CI 실패 시 Supabase SQL Editor에서 `supabase_migrations.schema_migrations`를 조회해 적용 여부를 확인한다.

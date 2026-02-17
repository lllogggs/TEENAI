# Supabase Migration Rules

1) 파일명 규칙: `YYYYMMDDHHMMSS_description.sql`
2) 파괴적 변경(`drop`, `alter ... drop`)은 반드시 별도 PR + 리뷰로 진행
3) 컬럼/정책 추가 시 가능하면 `IF NOT EXISTS` 사용
4) `schema.sql` 직접 실행 금지
5) CI 실패 시 DB는 적용되지 않으므로 GitHub Actions 로그 확인

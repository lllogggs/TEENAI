-- 1. Create admin_codes table for Parent Registration Codes
CREATE TABLE IF NOT EXISTS public.admin_codes (
    code TEXT PRIMARY KEY,
    is_used BOOLEAN DEFAULT FALSE,
    memo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    used_at TIMESTAMPTZ
);

-- 2. Create system_logs table for Error Logging
CREATE TABLE IF NOT EXISTS public.system_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    level TEXT NOT NULL, -- 'error', 'warn', 'info'
    message TEXT NOT NULL,
    context JSONB,
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Add subscription_expires_at to users table (if not exists)
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

-- 4. Set legacy users to expire in 9999-12-31
UPDATE public.users 
SET subscription_expires_at = '9999-12-31 23:59:59+09'
WHERE subscription_expires_at IS NULL;

-- 5. RLS Policies
ALTER TABLE public.admin_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read admin_codes to check validity (or restrict to service role if using strict server-side check)
-- For client-side check simplicity:
CREATE POLICY "Enable read access for all users" ON "public"."admin_codes"
AS PERMISSIVE FOR SELECT
TO public
USING (true);

-- Allow authenticated users to insert logs
CREATE POLICY "Enable insert for authenticated users only" ON "public"."system_logs"
AS PERMISSIVE FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow service role full access
CREATE POLICY "Enable full access for service role" ON "public"."admin_codes"
AS PERMISSIVE FOR ALL
TO service_role
USING (true);

-- 6. Add is_deleted_by_student to chat_sessions table (for Soft Delete)
ALTER TABLE public.chat_sessions 
ADD COLUMN IF NOT EXISTS is_deleted_by_student BOOLEAN DEFAULT FALSE;

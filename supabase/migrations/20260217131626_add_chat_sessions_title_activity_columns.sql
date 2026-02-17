BEGIN;

-- 1) columns
ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS title_source text,
  ADD COLUMN IF NOT EXISTS title_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- 2) backfill using existing columns
UPDATE public.chat_sessions
SET
  last_activity_at = COALESCE(last_activity_at, last_message_at, started_at),
  closed_at        = COALESCE(closed_at, ended_at),
  title_updated_at = COALESCE(title_updated_at, NOW())
WHERE TRUE;

-- 3) indexes for list sorting / filtering
CREATE INDEX IF NOT EXISTS idx_chat_sessions_last_activity_at
  ON public.chat_sessions (last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_closed_at
  ON public.chat_sessions (closed_at DESC);

-- 4) trigger function: keep last_message_at/last_activity_at in sync on new messages
CREATE OR REPLACE FUNCTION public.fn_touch_session_activity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.chat_sessions
  SET
    last_message_at  = COALESCE(public.chat_sessions.last_message_at, NEW.created_at),
    last_activity_at = COALESCE(public.chat_sessions.last_activity_at, NEW.created_at)
  WHERE id = NEW.session_id;

  -- if last_message_at exists, set both to NEW.created_at (more correct)
  UPDATE public.chat_sessions
  SET
    last_message_at  = NEW.created_at,
    last_activity_at = NEW.created_at
  WHERE id = NEW.session_id;

  RETURN NEW;
END;
$$;

-- drop & recreate trigger idempotently
DROP TRIGGER IF EXISTS trg_touch_session_activity ON public.messages;

CREATE TRIGGER trg_touch_session_activity
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_session_activity();

COMMIT;

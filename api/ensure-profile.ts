import { ApiError, requireUser } from './_lib/auth';
import { getRateLimitConfig } from './_lib/env';
import { allow, getRateLimitKey } from './_lib/rateLimit';
import { createServiceRoleClient } from './_lib/supabase';

const parseBody = (req: any) => {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
};

const deriveDefaultName = (email?: string | null) => {
  if (!email) return 'User';
  const prefix = email.split('@')[0]?.trim();
  return prefix || 'User';
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { user } = await requireUser(req);
    const { profile: profileRateLimit } = getRateLimitConfig();
    const rateLimitResult = allow(getRateLimitKey(req, user.id), profileRateLimit.windowSec, profileRateLimit.max);

    if (!rateLimitResult.ok) {
      res.setHeader('Retry-After', String(rateLimitResult.retryAfterSec || profileRateLimit.windowSec));
      res.status(429).json({ error: 'Rate limit exceeded' });
      return;
    }

    const body = parseBody(req);
    const requestedRole = body.role === 'student' || body.role === 'parent' ? body.role : null;
    const inviteCode = typeof body.inviteCode === 'string' ? body.inviteCode.trim().toUpperCase() : '';

    const adminSupabase = createServiceRoleClient();

    const { data: existingProfile } = await adminSupabase
      .from('users')
      .select('id, role')
      .eq('id', user.id)
      .single();

    const role = requestedRole || existingProfile?.role || 'student';

    const { error: upsertError } = await adminSupabase
      .from('users')
      .upsert({
        id: user.id,
        email: user.email,
        name: deriveDefaultName(user.email),
        role,
      }, { onConflict: 'id' });

    if (upsertError) {
      throw new ApiError(500, 'Failed to upsert profile.');
    }

    let linkedParent = false;
    if (inviteCode) {
      const { data: parentRow } = await adminSupabase
        .from('users')
        .select('id')
        .eq('my_invite_code', inviteCode)
        .eq('role', 'parent')
        .maybeSingle();

      if (!parentRow) {
        throw new ApiError(400, 'Invalid invite code');
      }

      const { error: studentProfileError } = await adminSupabase
        .from('student_profiles')
        .upsert({
          user_id: user.id,
          parent_user_id: parentRow.id,
          settings: {},
        }, { onConflict: 'user_id' });

      if (studentProfileError) {
        throw new ApiError(500, 'Failed to link parent profile.');
      }
      linkedParent = true;
    }

    const { data: finalProfile, error: finalProfileError } = await adminSupabase
      .from('users')
      .select('id, email, name, role')
      .eq('id', user.id)
      .single();

    if (finalProfileError || !finalProfile) {
      throw new ApiError(500, 'Failed to fetch ensured profile.');
    }

    res.status(200).json({ profile: finalProfile, ...(linkedParent ? { linkedParent: true } : {}) });
  } catch (error: any) {
    const status = typeof error?.status === 'number' ? error.status : 500;
    const message = error?.message || 'Failed to ensure profile.';
    res.status(status).json({ error: message });
  }
}

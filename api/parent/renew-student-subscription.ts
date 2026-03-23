import { createClient } from '@supabase/supabase-js';
import { consumeRateLimit, requireSupabaseUser } from '../_lib/request-guards.js';
import { serverSupabaseEnv, serverSupabaseEnvHints } from '../_lib/supabase-env.js';

const supabaseUrl = serverSupabaseEnv.url;
const serviceRoleKey = serverSupabaseEnv.serviceRoleKey;

const normalizeInviteCode = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().toUpperCase();
};

const INVITE_CODE_FAILURE_LIMIT = 4;
const INVITE_CODE_FAILURE_WINDOW_MS = 5 * 60 * 1000;

const respondInviteCodeRateLimit = (res: any, retryAfterSec: number) => {
  res.setHeader('Retry-After', String(retryAfterSec));
  res.status(429).json({ error: '잠시 후 다시 시도해주세요.' });
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: `Server configuration missing. Required: ${serverSupabaseEnvHints.url}, ${serverSupabaseEnvHints.serviceRoleKey}` });
    return;
  }

  const auth = await requireSupabaseUser(req, res);
  if (!auth) return;

  const studentId = String(req.body?.studentId || '').trim();
  const inviteCode = normalizeInviteCode(req.body?.inviteCode);

  if (!studentId) {
    res.status(400).json({ error: 'studentId is required.' });
    return;
  }

  if (!inviteCode) {
    res.status(400).json({ error: '초대코드를 입력해주세요.' });
    return;
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: parentProfile, error: parentProfileError } = await adminClient
    .from('users')
    .select('id, role')
    .eq('id', auth.userId)
    .maybeSingle();

  if (parentProfileError || !parentProfile || parentProfile.role !== 'parent') {
    res.status(403).json({ error: '학부모 계정만 이용할 수 있습니다.' });
    return;
  }

  const { data: studentProfile, error: studentProfileError } = await adminClient
    .from('student_profiles')
    .select('user_id, parent_user_id, users!student_profiles_user_id_fkey(subscription_expires_at)')
    .eq('user_id', studentId)
    .eq('parent_user_id', auth.userId)
    .maybeSingle();

  if (studentProfileError) {
    console.error('[renew-student-subscription] student lookup error:', studentProfileError);
    res.status(500).json({ error: '학생 정보를 확인하지 못했습니다.' });
    return;
  }

  if (!studentProfile) {
    res.status(404).json({ error: '연동된 학생 정보를 찾을 수 없습니다.' });
    return;
  }

  const inviteCodeRateLimitKey = `renew-student-subscription:invalid-invite:${auth.userId}`;

  const { data: codeRow, error: codeError } = await adminClient
    .from('admin_codes')
    .select('code, is_active, is_used, use_count, max_uses, expires_at, subscription_days')
    .eq('code', inviteCode)
    .maybeSingle();

  if (codeError) {
    console.error('[renew-student-subscription] invite code lookup error:', codeError);
    res.status(500).json({ error: '초대코드를 확인하지 못했습니다.' });
    return;
  }

  if (!codeRow) {
    const rateLimitResult = await consumeRateLimit(
      inviteCodeRateLimitKey,
      INVITE_CODE_FAILURE_LIMIT,
      INVITE_CODE_FAILURE_WINDOW_MS,
    );

    if (!rateLimitResult.allowed) {
      respondInviteCodeRateLimit(res, rateLimitResult.retryAfterSec);
      return;
    }

    res.status(400).json({ error: '유효하지 않은 초대코드입니다.' });
    return;
  }

  if (codeRow.is_active === false) {
    res.status(400).json({ error: '정지된 초대코드입니다.' });
    return;
  }

  if (codeRow.expires_at && new Date(codeRow.expires_at).getTime() < Date.now()) {
    res.status(400).json({ error: '만료된 초대코드입니다.' });
    return;
  }

  const maxUses = typeof codeRow.max_uses === 'number' ? codeRow.max_uses : null;
  const useCount = Number(codeRow.use_count || 0);
  const alreadyUsed = codeRow.is_used || (maxUses !== null && useCount >= maxUses);
  if (alreadyUsed) {
    res.status(409).json({ error: '이미 사용된 초대코드입니다.' });
    return;
  }

  const claimedAt = new Date().toISOString();
  const { data: claimedCode, error: claimError } = await adminClient.rpc('claim_admin_code_use', {
    p_code: inviteCode,
    p_used_at: claimedAt,
  });

  if (claimError) {
    console.error('[renew-student-subscription] invite code claim error:', claimError);
    res.status(500).json({ error: '초대코드 사용 처리에 실패했습니다.' });
    return;
  }

  if (!claimedCode) {
    res.status(409).json({ error: '이미 사용된 초대코드입니다.' });
    return;
  }

  const subscriptionDays = Number(codeRow.subscription_days || 31);
  const studentUser = Array.isArray(studentProfile.users) ? studentProfile.users[0] : studentProfile.users;
  const currentExpiry = studentUser?.subscription_expires_at
    ? new Date(studentUser.subscription_expires_at).getTime()
    : Number.NaN;
  const baseTime = Number.isFinite(currentExpiry) && currentExpiry > Date.now() ? currentExpiry : Date.now();
  const nextExpiry = new Date(baseTime);
  nextExpiry.setDate(nextExpiry.getDate() + (Number.isFinite(subscriptionDays) && subscriptionDays > 0 ? subscriptionDays : 31));

  const { error: userUpdateError } = await adminClient
    .from('users')
    .update({ subscription_expires_at: nextExpiry.toISOString() })
    .eq('id', studentId)
    .eq('role', 'student');

  if (userUpdateError) {
    console.error('[renew-student-subscription] users update error:', userUpdateError);
    await adminClient.rpc('decrement_admin_code_use', {
      p_code: inviteCode,
      p_used_at: claimedAt,
    });
    res.status(500).json({ error: '학생 이용 기간 갱신에 실패했습니다.' });
    return;
  }

  try {
    const { data: authUserData } = await adminClient.auth.admin.getUserById(studentId);
    await adminClient.auth.admin.updateUserById(studentId, {
      user_metadata: {
        ...(authUserData.user?.user_metadata || {}),
        subscription_expires_at: nextExpiry.toISOString(),
      },
    });
  } catch (metadataError) {
    console.error('[renew-student-subscription] auth metadata update error:', metadataError);
  }

  res.status(200).json({
    success: true,
    subscription_expires_at: nextExpiry.toISOString(),
    subscription_days: Number.isFinite(subscriptionDays) && subscriptionDays > 0 ? subscriptionDays : 31,
  });
}

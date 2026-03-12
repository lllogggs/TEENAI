import { requireAdminUser } from '../_lib/admin-auth.js';
import { randomBytes } from 'crypto';

const randomCode = () => randomBytes(6).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();

export default async function handler(req: any, res: any) {
  const auth = await requireAdminUser(req, res);
  if (!auth) return;

  const { adminClient, userId, email } = auth;

  if (req.method === 'GET') {
    const { data, error } = await adminClient
      .from('admin_codes')
      .select('code, memo, is_used, is_active, use_count, max_uses, subscription_days, created_at, used_at, expires_at, auth_provider, used_by_email')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(200).json({ items: data || [] });
    return;
  }

  if (req.method === 'POST') {
    const memo = String(req.body?.memo || '').trim();
    const maxUses = Number(req.body?.maxUses || 1);
    const subscriptionDays = Number(req.body?.subscriptionDays || 31);
    const requestedCode = req.body?.code ? String(req.body.code).trim().toUpperCase() : null;

    if (requestedCode && !/^[A-Z0-9]{4,32}$/.test(requestedCode)) {
      res.status(400).json({ error: '초대코드는 영문 대문자/숫자만 가능하며 4~32자여야 합니다.' });
      return;
    }

    if (!Number.isFinite(subscriptionDays) || subscriptionDays < 1 || subscriptionDays > 3650) {
      res.status(400).json({ error: '사용 가능일수는 1~3650일 범위여야 합니다.' });
      return;
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = requestedCode || randomCode();
      const { error } = await adminClient.from('admin_codes').insert({
        code,
        memo: memo || null,
        max_uses: Number.isFinite(maxUses) && maxUses > 0 ? maxUses : 1,
        subscription_days: Math.floor(subscriptionDays),
        used_by_user_id: userId,
        used_by_email: email,
      });

      if (!error) {
        res.status(200).json({ success: true, code });
        return;
      }

      if (requestedCode && error.code === '23505') {
        res.status(409).json({ error: '이미 사용 중인 코드입니다. 다른 코드를 입력해주세요.' });
        return;
      }

      if (error.code !== '23505') {
        res.status(500).json({ error: error.message });
        return;
      }
    }

    res.status(500).json({ error: 'Failed to issue unique invite code. Please retry.' });
    return;
  }

  if (req.method === 'PATCH') {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const memo = req.body?.memo === undefined ? undefined : String(req.body.memo || '').trim();
    const maxUses = req.body?.maxUses;
    const subscriptionDays = req.body?.subscriptionDays;
    const isActive = req.body?.isActive;

    if (!code) {
      res.status(400).json({ error: '수정할 코드가 필요합니다.' });
      return;
    }

    const { data: current, error: currentError } = await adminClient
      .from('admin_codes')
      .select('code, use_count, max_uses')
      .eq('code', code)
      .maybeSingle();

    if (currentError) {
      res.status(500).json({ error: currentError.message });
      return;
    }

    if (!current) {
      res.status(404).json({ error: '존재하지 않는 코드입니다.' });
      return;
    }

    const updates: Record<string, any> = {};
    if (memo !== undefined) updates.memo = memo || null;

    if (maxUses !== undefined) {
      const parsedMaxUses = Number(maxUses);
      if (!Number.isFinite(parsedMaxUses) || parsedMaxUses < 1) {
        res.status(400).json({ error: '사용 가능 횟수는 1 이상이어야 합니다.' });
        return;
      }
      if (parsedMaxUses < Number(current.use_count || 0)) {
        res.status(400).json({ error: '이미 사용된 횟수보다 작게 설정할 수 없습니다.' });
        return;
      }
      updates.max_uses = Math.floor(parsedMaxUses);
      updates.is_used = Number(current.use_count || 0) >= Math.floor(parsedMaxUses);
    }

    if (subscriptionDays !== undefined) {
      const parsedDays = Number(subscriptionDays);
      if (!Number.isFinite(parsedDays) || parsedDays < 1 || parsedDays > 3650) {
        res.status(400).json({ error: '사용 가능일수는 1~3650일 범위여야 합니다.' });
        return;
      }
      updates.subscription_days = Math.floor(parsedDays);
    }

    if (isActive !== undefined) {
      updates.is_active = Boolean(isActive);
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: '수정할 값이 없습니다.' });
      return;
    }

    const { error } = await adminClient
      .from('admin_codes')
      .update(updates)
      .eq('code', code);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(200).json({ success: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

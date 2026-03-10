import { requireAdminUser } from '../_lib/admin-auth';
import { randomBytes } from 'crypto';

const randomCode = () => randomBytes(6).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();

export default async function handler(req: any, res: any) {
  const auth = await requireAdminUser(req, res);
  if (!auth) return;

  const { adminClient, userId, email } = auth;

  if (req.method === 'GET') {
    const { data, error } = await adminClient
      .from('admin_codes')
      .select('code, memo, is_used, use_count, max_uses, created_at, used_at, expires_at, auth_provider, used_by_email')
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
    const expiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt).toISOString() : null;
    const requestedCode = req.body?.code ? String(req.body.code).toUpperCase() : null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = requestedCode || randomCode();
      const { error } = await adminClient.from('admin_codes').insert({
        code,
        memo: memo || null,
        max_uses: Number.isFinite(maxUses) && maxUses > 0 ? maxUses : 1,
        expires_at: expiresAt,
        used_by_user_id: userId,
        used_by_email: email,
      });

      if (!error) {
        res.status(200).json({ success: true, code });
        return;
      }

      if (requestedCode || error.code !== '23505') {
        res.status(500).json({ error: error.message });
        return;
      }
    }

    res.status(500).json({ error: 'Failed to issue unique invite code. Please retry.' });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'Server env for parent code verification is missing.' });
    return;
  }

  const registrationCode = String(req.body?.registrationCode || '').trim();

  if (!registrationCode) {
    res.status(400).json({ error: 'registrationCode is required.' });
    return;
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    const { data: claimedCode, error: claimError } = await adminClient.rpc('claim_admin_code_use', {
      p_code: registrationCode,
      p_used_at: new Date().toISOString(),
    });

    if (claimError) {
      console.error('verify-parent-code claim error:', claimError);
      res.status(500).json({ error: 'Failed to validate registration code.' });
      return;
    }

    if (!claimedCode) {
      res.status(400).json({ error: '유효하지 않거나 사용 가능한 횟수를 초과한 등록 코드입니다.' });
      return;
    }

    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('verify-parent-code error:', error);
    res.status(500).json({ error: error?.message || '코드 인증 중 오류가 발생했습니다.' });
  }
}

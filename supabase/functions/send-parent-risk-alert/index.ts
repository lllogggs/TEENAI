import { createClient } from 'npm:@supabase/supabase-js@2';

type RiskPayload = {
  event_type?: 'chat_session_caution' | 'safety_alert_insert';
  record?: {
    id?: string;
    student_id?: string;
    title?: string;
    message?: string;
    risk_level?: string;
  };
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const expoPushUrl = 'https://exp.host/--/api/v2/push/send';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const buildNotificationBody = (payload: RiskPayload) => {
  if (payload.event_type === 'safety_alert_insert') {
    return payload.record?.message || '위험 신호가 감지되었습니다. 부모 대시보드에서 확인해주세요.';
  }

  return '위험 대화가 감지되었습니다. 부모 대시보드에서 바로 확인해주세요.';
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const payload = (await request.json().catch(() => ({}))) as RiskPayload;
  const studentId = payload.record?.student_id;

  if (!studentId) {
    return new Response(JSON.stringify({ error: 'student_id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: studentProfile, error: studentProfileError } = await supabase
    .from('student_profiles')
    .select('parent_user_id, users!student_profiles_user_id_fkey(name)')
    .eq('user_id', studentId)
    .maybeSingle();

  if (studentProfileError || !studentProfile?.parent_user_id) {
    return new Response(JSON.stringify({ error: studentProfileError?.message || 'Parent not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: tokens, error: tokenError } = await supabase
    .from('parent_push_tokens')
    .select('expo_push_token')
    .eq('parent_user_id', studentProfile.parent_user_id);

  if (tokenError) {
    return new Response(JSON.stringify({ error: tokenError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const validTokens = (tokens || [])
    .map((row) => row.expo_push_token)
    .filter((token): token is string => typeof token === 'string' && (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[')));

  if (!validTokens.length) {
    return new Response(JSON.stringify({ success: true, sent: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const studentUser = Array.isArray(studentProfile.users) ? studentProfile.users[0] : studentProfile.users;
  const studentName = studentUser?.name || '학생';
  const messages = validTokens.map((to) => ({
    to,
    sound: 'default',
    title: `${studentName} 위험 알림`,
    body: buildNotificationBody(payload),
    data: { url: '/parent', studentId, sessionId: payload.record?.id || null },
  }));

  const expoResponse = await fetch(expoPushUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(messages),
  });

  const expoPayload = await expoResponse.json().catch(() => ({}));

  return new Response(JSON.stringify({
    success: expoResponse.ok,
    sent: messages.length,
    expo: expoPayload,
  }), {
    status: expoResponse.ok ? 200 : 502,
    headers: { 'Content-Type': 'application/json' },
  });
});

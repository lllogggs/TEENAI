import { createClient } from 'npm:@supabase/supabase-js@2';

type DailySummaryPayload = {
  target_date?: string;
  time_zone?: string;
  deep_link?: { url?: string };
};

type SummaryRow = {
  parent_user_id: string;
  student_id: string;
  student_name: string | null;
  stable_count: number;
  normal_count: number;
  caution_count: number;
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const expoPushUrl = 'https://exp.host/--/api/v2/push/send';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const payload = (await request.json().catch(() => ({}))) as DailySummaryPayload;
  const targetDate = payload.target_date || new Intl.DateTimeFormat('en-CA', {
    timeZone: payload.time_zone || 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const { data, error } = await supabase.rpc('get_parent_daily_chat_summary', {
    p_target_date: targetDate,
    p_time_zone: payload.time_zone || 'Asia/Seoul',
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rows = (data || []) as SummaryRow[];
  if (!rows.length) {
    return new Response(JSON.stringify({ success: true, sent: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const parentIds = [...new Set(rows.map((row) => row.parent_user_id))];
  const { data: tokenRows, error: tokenError } = await supabase
    .from('parent_push_tokens')
    .select('parent_user_id, expo_push_token')
    .in('parent_user_id', parentIds);

  if (tokenError) {
    return new Response(JSON.stringify({ error: tokenError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const tokenMap = new Map<string, string[]>();
  for (const row of tokenRows || []) {
    if (!(row.expo_push_token?.startsWith('ExponentPushToken[') || row.expo_push_token?.startsWith('ExpoPushToken['))) continue;
    const list = tokenMap.get(row.parent_user_id) || [];
    list.push(row.expo_push_token);
    tokenMap.set(row.parent_user_id, list);
  }

  const messages = rows.flatMap((row) => {
    const tokens = tokenMap.get(row.parent_user_id) || [];
    if (!tokens.length) return [];

    const title = `${row.student_name || '학생'} 오늘 대화 요약`;
    const body = `오늘 대화 요약: 안정 ${row.stable_count}회, 주의 ${row.normal_count}회, 위험 ${row.caution_count}회`;

    return tokens.map((to) => ({
      to,
      sound: 'default',
      title,
      body,
      data: {
        url: payload.deep_link?.url || '/parent',
        studentId: row.student_id,
        targetDate,
      },
    }));
  });

  if (!messages.length) {
    return new Response(JSON.stringify({ success: true, sent: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

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

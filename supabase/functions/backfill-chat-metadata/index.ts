import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type SessionRiskLevel = 'stable' | 'normal' | 'caution';

type TranscriptItem = {
  role: 'user' | 'model';
  content: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const extractJsonObject = (raw: string) => {
  const trimmed = String(raw || '').trim();
  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) return fencedMatch[1].trim();

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) return trimmed.slice(firstBrace, lastBrace + 1);
  return '{}';
};

const normalizeRiskLevel = (value: unknown): SessionRiskLevel => {
  if (value === 'stable' || value === 'normal' || value === 'caution') return value;
  if (value === 'warn' || value === 'high') return 'caution';
  return 'normal';
};

const sanitizeTitle = (value: unknown) => {
  if (typeof value !== 'string') return '';
  return value.replace(/["'`]/g, '').replace(/\s+/g, ' ').trim();
};

const buildPrompt = ({ currentTitle, transcript, firstMessage }: { currentTitle: string; transcript: TranscriptItem[]; firstMessage: string }) => [
  '청소년 상담 대화의 메타데이터를 JSON으로 생성하세요.',
  '반드시 아래 JSON 스키마로만 답하세요.',
  '{"title":"...","risk_level":"stable|normal|caution"}',
  '',
  '[risk_level 기준]',
  '- stable: 감정이 안정적이고 위험 신호가 거의 없음',
  '- normal: 걱정/불안/스트레스 언급은 있으나 즉각 위험 신호는 없음',
  '- caution: 자해/자살/폭력/학대/극심한 절망 등 안전 위험 가능성 존재',
  '',
  '[title 규칙]',
  '- 8~20자 한국어',
  '- 구체적인 대화방 제목 형태',
  '- 너무 일반적인 표현(예: 대화, 고민상담) 금지',
  '- 현재 title이 "새 대화"가 아니면 title은 기존 값을 그대로 반환',
  '',
  `현재 title: ${currentTitle || '새 대화'}`,
  '[최근 대화]',
  transcript.length
    ? transcript.map((item, idx) => `${idx + 1}. ${item.role === 'user' ? '학생' : '멘토'}: ${item.content}`).join('\n')
    : `1. 학생: ${firstMessage || ''}`,
].join('\n');

const callGemini = async (apiKey: string, prompt: string) => {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API failed: ${response.status} ${text}`);
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return JSON.parse(extractJsonObject(text));
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || '';

    if (!supabaseUrl || !serviceRoleKey || !geminiApiKey) {
      return new Response(JSON.stringify({ error: 'Missing required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = Boolean(body?.dryRun);
    const limit = Math.min(Math.max(Number(body?.limit) || 50, 1), 500);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: sessions, error: sessionsError } = await supabase
      .from('chat_sessions')
      .select('id,title,risk_level,started_at')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (sessionsError) {
      throw sessionsError;
    }

    let updated = 0;
    const results: Array<Record<string, unknown>> = [];

    for (const session of sessions || []) {
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('role,content,created_at')
        .eq('session_id', session.id)
        .order('created_at', { ascending: true });

      if (messagesError) {
        results.push({ session_id: session.id, status: 'message_fetch_error', error: messagesError.message });
        continue;
      }

      const transcript: TranscriptItem[] = (messages || [])
        .filter((item) => (item.role === 'user' || item.role === 'model') && typeof item.content === 'string')
        .slice(-16)
        .map((item) => ({ role: item.role, content: item.content.trim().slice(0, 400) }));

      if (!transcript.length) {
        results.push({ session_id: session.id, status: 'skipped_no_transcript' });
        continue;
      }

      const firstMessage = transcript.find((item) => item.role === 'user')?.content || '';
      const prompt = buildPrompt({ currentTitle: session.title || '새 대화', transcript, firstMessage });

      let aiResult: Record<string, unknown>;
      try {
        aiResult = await callGemini(geminiApiKey, prompt);
      } catch (error) {
        results.push({ session_id: session.id, status: 'gemini_error', error: error instanceof Error ? error.message : String(error) });
        continue;
      }

      const nextTitleRaw = sanitizeTitle(aiResult?.title);
      const nextMeta = {
        title: session.title && session.title !== '새 대화' ? session.title : nextTitleRaw || sanitizeTitle(firstMessage).slice(0, 20) || '새 대화',
        risk_level: normalizeRiskLevel(aiResult?.risk_level),
      };

      const needsUpdate = nextMeta.title !== (session.title || '새 대화') || nextMeta.risk_level !== normalizeRiskLevel(session.risk_level);
      if (!needsUpdate) {
        results.push({ session_id: session.id, status: 'unchanged' });
        continue;
      }

      if (dryRun) {
        updated += 1;
        results.push({ session_id: session.id, status: 'dry_run_update', next: nextMeta });
        continue;
      }

      const { error: updateError } = await supabase
        .from('chat_sessions')
        .update(nextMeta)
        .eq('id', session.id);

      if (updateError) {
        results.push({ session_id: session.id, status: 'update_error', error: updateError.message });
        continue;
      }

      updated += 1;
      results.push({ session_id: session.id, status: 'updated', next: nextMeta });
    }

    return new Response(JSON.stringify({ dryRun, limit, scanned: (sessions || []).length, updated, results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

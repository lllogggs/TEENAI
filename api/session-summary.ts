import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const geminiApiKey = process.env.GEMINI_API_KEY || '';

const MESSAGE_FETCH_LIMIT = 20;

const getBearerToken = (req: any): string | null => {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
};

const normalizeSummary = (value: unknown) => {
  if (typeof value !== 'string') return '대화 요약을 생성하지 못했습니다.';
  const trimmed = value.trim();
  if (!trimmed) return '대화 요약을 생성하지 못했습니다.';
  if (trimmed.length < 200) return `${trimmed} 학생의 현재 감정과 요청을 조금 더 구체적으로 지켜볼 필요가 있습니다.`.slice(0, 350);
  if (trimmed.length > 350) return trimmed.slice(0, 350);
  return trimmed;
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!supabaseUrl || !supabaseAnonKey || !geminiApiKey || !serviceRoleKey) {
    res.status(500).json({ error: 'Missing required server environment.' });
    return;
  }

  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const authedSupabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await authedSupabase.auth.getUser();
  if (authError || !authData.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const sessionId = String((req.method === 'GET' ? req.query?.sessionId : req.body?.sessionId) || '').trim();
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId is required.' });
    return;
  }

  const { data: sessionRow } = await authedSupabase
    .from('chat_sessions')
    .select('id')
    .eq('id', sessionId)
    .single();

  if (!sessionRow) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }

  const { data: messages, error: messageError } = await adminSupabase
    .from('messages')
    .select('role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(MESSAGE_FETCH_LIMIT);

  if (messageError) {
    console.error('session summary message load failed:', { sessionId, error: messageError });
    res.status(500).json({ error: 'Failed to read messages.' });
    return;
  }

  const { count, error: countError } = await adminSupabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId);

  if (countError) {
    console.error('session summary message count failed:', { sessionId, error: countError });
    res.status(500).json({ error: 'Failed to count messages.' });
    return;
  }

  const messageCount = count || 0;
  const transcript = (messages || []).map((item) => `${item.role}: ${item.content}`).join('\n');
  if (!transcript) {
    res.status(200).json({ summary: null, skipped: true });
    return;
  }

  const { data: sessionMeta, error: sessionMetaError } = await adminSupabase
    .from('chat_sessions')
    .select('summary')
    .eq('id', sessionId)
    .single();

  if (sessionMetaError) {
    console.error('session summary metadata load failed:', { sessionId, error: sessionMetaError });
    res.status(500).json({ error: 'Failed to read session metadata.' });
    return;
  }

  const hasSummary = !!sessionMeta?.summary?.trim();
  const lastMessageAt = messages?.[messages.length - 1]?.created_at;
  const idleMs = lastMessageAt ? Date.now() - new Date(lastMessageAt).getTime() : 0;
  const shouldSummarize = !hasSummary || (messageCount >= 6 && messageCount % 6 === 0) || idleMs >= 8000;

  if (!shouldSummarize) {
    res.status(200).json({ summary: sessionMeta?.summary || null, skipped: true, messageCount });
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const prompt = [
      '다음 청소년 상담 대화를 JSON으로 요약하세요.',
      'summary는 반드시 한국어 2~3문장, 공백 포함 200~350자여야 합니다.',
      '주제, 핵심 감정, 요청 사항, 멘토 개입 요지를 포함하고 민감정보는 제거하세요.',
      'riskLevel은 stable|normal|caution 중 하나로 답하세요.',
      '',
      transcript,
    ].join('\n');

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const payload = JSON.parse(result.text || '{}');
    const summary = normalizeSummary(payload.summary);
    const riskLevel = payload.riskLevel === 'stable' || payload.riskLevel === 'caution' ? payload.riskLevel : 'normal';

    const { error: updateError } = await adminSupabase
      .from('chat_sessions')
      .update({ summary, risk_level: riskLevel })
      .eq('id', sessionId);

    if (updateError) {
      console.error('session summary update failed:', { sessionId, messageCount, error: updateError });
      res.status(500).json({ error: 'Failed to update summary.' });
      return;
    }

    res.status(200).json({ summary, riskLevel, messageCount, skipped: false });
  } catch (error) {
    console.error('session summary error:', { sessionId, error });
    res.status(500).json({ error: '요약 생성 중 오류가 발생했습니다.' });
  }
}

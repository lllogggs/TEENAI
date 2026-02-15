import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const safeParse = (raw: string) => {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';

  if (!url || !anon || !service || !geminiKey) {
    res.status(500).json({ error: 'Server environment variables are missing.' });
    return;
  }

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const authed = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const admin = createClient(url, service);

  const { data: authUser } = await authed.auth.getUser();
  const requesterId = authUser.user?.id;
  if (!requesterId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const sessionId = String(req.body?.session_id || '').trim();
  if (!sessionId) {
    res.status(400).json({ error: 'session_id is required' });
    return;
  }

  const { data: session, error: sessionError } = await admin
    .from('chat_sessions')
    .select('id, student_id')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const { data: requesterProfile } = await admin
    .from('users')
    .select('role')
    .eq('id', requesterId)
    .single();

  let allowed = requesterId === session.student_id;
  if (!allowed && requesterProfile?.role === 'parent') {
    const { data: link } = await admin
      .from('student_profiles')
      .select('user_id')
      .eq('user_id', session.student_id)
      .eq('parent_user_id', requesterId)
      .single();
    allowed = Boolean(link);
  }

  if (!allowed) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const { data: messages } = await admin
    .from('messages')
    .select('role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  const transcript = (messages || [])
    .map((m) => `${m.role === 'user' ? '학생' : '멘토'}: ${m.content}`)
    .join('\n');

  if (!transcript) {
    res.status(200).json({ summary: '', stability_label: 'stable', reason: '메시지 없음' });
    return;
  }

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const prompt = `다음 대화를 분석해 JSON만 출력하세요.
요구사항:
- summary: 1~2줄 한국어 요약. 주제 + 학생 감정 상태 포함
- stability_label: stable | normal | caution 중 하나
- reason: 분류 근거를 한국어로 1문장
- caution은 자해/폭력/학대/불법/성적착취 등 위험 신호가 있을 때만
\n대화:\n${transcript}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    config: { responseMimeType: 'application/json' },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });

  let parsed: any;
  try {
    parsed = safeParse(response.text || '{}');
  } catch {
    parsed = { summary: '요약 생성 실패', stability_label: 'normal', reason: '응답 파싱 실패' };
  }

  const stability = ['stable', 'normal', 'caution'].includes(parsed.stability_label)
    ? parsed.stability_label
    : 'normal';

  const payload = {
    summary: String(parsed.summary || '').slice(0, 400),
    session_summary: String(parsed.summary || '').slice(0, 400),
    stability_label: stability,
    stability_reason: String(parsed.reason || '').slice(0, 300),
    last_message_at: new Date().toISOString(),
  };

  await admin.from('chat_sessions').update(payload).eq('id', sessionId);

  res.status(200).json({
    summary: payload.summary,
    stability_label: payload.stability_label,
    reason: payload.stability_reason,
  });
}

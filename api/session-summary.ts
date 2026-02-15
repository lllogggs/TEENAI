import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const geminiApiKey = process.env.GEMINI_API_KEY || '';

const getBearerToken = (req: any): string | null => {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!supabaseUrl || !supabaseAnonKey || !geminiApiKey) {
    res.status(500).json({ error: 'Missing required server environment.' });
    return;
  }

  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const sessionId = String(req.body?.sessionId || '').trim();
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId is required.' });
    return;
  }

  const { data: messages, error: messageError } = await supabase
    .from('messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (messageError) {
    res.status(500).json({ error: 'Failed to read messages.' });
    return;
  }

  if (!messages || messages.length < 6) {
    res.status(200).json({ summary: null, skipped: true });
    return;
  }

  const transcript = messages
    .map((item) => `${item.role === 'user' ? '학생' : '멘토'}: ${item.content}`)
    .join('\n');

  try {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const prompt = [
      '다음 청소년 상담 대화를 200~350자 한국어로 요약하세요.',
      '핵심 감정, 고민 주제, 멘토 개입 요지를 포함하세요.',
      '민감정보를 확대 해석하지 말고 사실 기반으로 작성하세요.',
      '',
      transcript,
    ].join('\n');

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const generated = String(result.text || '').trim();
    const summary = generated || '요약이 아직 없습니다.';

    const { error: updateError } = await supabase
      .from('chat_sessions')
      .update({ summary })
      .eq('id', sessionId);

    if (updateError) {
      res.status(500).json({ error: 'Failed to update summary.' });
      return;
    }

    res.status(200).json({ summary });
  } catch (error) {
    console.error('session summary error:', error);
    res.status(500).json({ error: '요약 생성 중 오류가 발생했습니다.' });
  }
}

import { GoogleGenAI } from '@google/genai';
import { ApiError, requireUser } from './_lib/auth';
import { getGeminiKeyOrThrow } from './_lib/env';
import { createServiceRoleClient } from './_lib/supabase';

const parseBody = (req: any) => {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
};

const fallbackTitle = (value: string) => value.replace(/\s+/g, ' ').trim().slice(0, 24) || '새 대화';

const sanitizeTitle = (value: string, seed: string) => {
  const oneLine = value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!oneLine) return fallbackTitle(seed);
  return oneLine.slice(0, 24);
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { user } = await requireUser(req);
    const body = parseBody(req);
    const sessionId = String(body.sessionId || '').trim();
    const firstUserMessage = String(body.firstUserMessage || '').trim();

    if (!sessionId || !firstUserMessage) throw new ApiError(400, 'sessionId and firstUserMessage are required.');

    const adminSupabase = createServiceRoleClient();

    const { data: me, error: meError } = await adminSupabase
      .from('users')
      .select('id, role')
      .eq('id', user.id)
      .single();

    if (meError || !me?.role) throw new ApiError(403, 'Failed to verify user role.');

    const { data: session, error: sessionError } = await adminSupabase
      .from('chat_sessions')
      .select('id, student_id, title, title_source')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) throw new ApiError(404, 'Session not found.');

    if (me.role === 'student' && session.student_id !== user.id) {
      throw new ApiError(403, 'Forbidden');
    }

    if (me.role === 'parent') {
      const { data: relation, error: relationError } = await adminSupabase
        .from('student_profiles')
        .select('user_id')
        .eq('user_id', session.student_id)
        .eq('parent_user_id', user.id)
        .single();

      if (relationError || !relation?.user_id) throw new ApiError(403, 'Forbidden');
    }

    if (session.title && (session.title_source === 'ai' || session.title_source === 'manual')) {
      res.status(200).json({ ok: true, title: session.title, skipped: true });
      return;
    }

    let title = fallbackTitle(firstUserMessage);
    let titleSource = 'fallback';

    try {
      const ai = new GoogleGenAI({ apiKey: getGeminiKeyOrThrow() });
      const prompt = [
        '다음 첫 질문을 바탕으로 상담 세션 제목을 만드세요.',
        '규칙:',
        '- 8~24자',
        '- 명사형 짧은 제목',
        '- 질문문 금지',
        '- 개인정보 금지',
        '- 이모지 금지',
        '- 출력은 제목 한 줄만',
        '',
        `첫 질문: ${firstUserMessage}`,
      ].join('\n');

      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { temperature: 0.2 },
      });

      title = sanitizeTitle(result.text || '', firstUserMessage);
      titleSource = 'ai';
    } catch (error) {
      console.warn('session-title ai generation failed, fallback is used', { sessionId, error });
      title = fallbackTitle(firstUserMessage);
      titleSource = 'fallback';
    }

    const { error: updateError } = await adminSupabase
      .from('chat_sessions')
      .update({
        title,
        title_source: titleSource,
        title_updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (updateError) throw new ApiError(500, 'Failed to update title.');

    res.status(200).json({ ok: true, title });
  } catch (error: any) {
    const status = typeof error?.status === 'number' ? error.status : 500;
    const message = error?.message || '세션 제목 생성 중 오류가 발생했습니다.';
    console.error('session title error', { status, message });
    res.status(status).json({ ok: false, error: message });
  }
}

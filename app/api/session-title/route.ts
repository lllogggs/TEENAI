import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';
import { createAuthedSupabase, getSupabaseAdmin } from '../_lib/supabaseServer';

const fallbackTitle = (value: string) => value.replace(/\s+/g, ' ').trim().slice(0, 24) || '새 대화';

const sanitizeTitle = (value: string, seed: string) => {
  const oneLine = value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!oneLine) return fallbackTitle(seed);
  return oneLine.slice(0, 24);
};

const canAccessSession = async (authHeader: string | null, sessionId: string) => {
  const authedClient = createAuthedSupabase(authHeader);
  const { data: authResult } = await authedClient.auth.getUser();
  if (!authResult.user) {
    return { ok: false as const, status: 401, error: 'Unauthorized' };
  }

  const { data: sessionRow, error: sessionError } = await authedClient
    .from('chat_sessions')
    .select('id')
    .eq('id', sessionId)
    .single();

  if (sessionError || !sessionRow) {
    return { ok: false as const, status: 404, error: 'Session not found' };
  }

  return { ok: true as const };
};

export async function POST(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const { sessionId, firstUserMessage } = await req.json();
    const normalizedSessionId = String(sessionId || '').trim();
    const normalizedMessage = String(firstUserMessage || '').trim();

    if (!normalizedSessionId || !normalizedMessage) {
      return NextResponse.json({ error: 'sessionId and firstUserMessage are required.' }, { status: 400 });
    }

    const access = await canAccessSession(req.headers.get('authorization'), normalizedSessionId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { data: session, error: sessionLoadError } = await supabaseAdmin
      .from('chat_sessions')
      .select('id, title, title_source')
      .eq('id', normalizedSessionId)
      .single();

    if (sessionLoadError || !session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }

    if (session.title && (session.title_source === 'ai' || session.title_source === 'manual')) {
      return NextResponse.json({ ok: true, title: session.title, skipped: true });
    }

    let title = fallbackTitle(normalizedMessage);
    let titleSource = 'fallback';

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is missing');
      }

      // [수정] 올바른 패키지와 모델 사용
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

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
        `첫 질문: ${normalizedMessage}`,
      ].join('\n');

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      });

      const response = await result.response;
      title = sanitizeTitle(response.text() || '', normalizedMessage);
      titleSource = 'ai';
    } catch (error) {
      console.warn('session-title ai generation failed, fallback is used', { sessionId: normalizedSessionId, error });
    }

    const { error: updateError } = await supabaseAdmin
      .from('chat_sessions')
      .update({
        title,
        title_source: titleSource,
        title_updated_at: new Date().toISOString(),
      })
      .eq('id', normalizedSessionId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update title.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, title });
  } catch (error) {
    console.error('session title error', { error });
    return NextResponse.json({ error: '세션 제목 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

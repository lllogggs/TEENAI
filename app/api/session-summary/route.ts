import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';
import { createAuthedSupabase, supabaseAdmin } from '../_lib/supabaseServer';

const MESSAGE_FETCH_LIMIT = 20;

const normalizeSummary = (value: unknown) => {
  if (typeof value !== 'string') return '대화 요약을 생성하지 못했습니다.';
  const trimmed = value.trim();
  if (!trimmed) return '대화 요약을 생성하지 못했습니다.';
  if (trimmed.length < 200) return `${trimmed} 학생의 현재 감정과 요청을 조금 더 구체적으로 지켜볼 필요가 있습니다.`.slice(0, 350);
  if (trimmed.length > 350) return trimmed.slice(0, 350);
  return trimmed;
};

const summarizeSession = async (sessionId: string) => {
  const { data: messages, error: messageError } = await supabaseAdmin
    .from('messages')
    .select('role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(MESSAGE_FETCH_LIMIT);

  if (messageError) {
    console.error('session summary message load failed:', { sessionId, messageCount: 0, error: messageError });
    return { error: 'Failed to load messages', status: 500 };
  }

  const { count: totalMessageCount, error: countError } = await supabaseAdmin
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId);

  if (countError) {
    console.error('session summary message count failed:', { sessionId, error: countError });
    return { error: 'Failed to count messages', status: 500 };
  }

  const messageCount = totalMessageCount || 0;
  const transcript = (messages || []).map((message) => `${message.role}: ${message.content}`).join('\n');
  if (!transcript) {
    return { summary: '대화가 아직 충분하지 않습니다.', riskLevel: 'normal', skipped: true, messageCount };
  }

  const { data: sessionMeta, error: sessionMetaError } = await supabaseAdmin
    .from('chat_sessions')
    .select('summary')
    .eq('id', sessionId)
    .single();

  if (sessionMetaError) {
    console.error('session summary metadata load failed:', { sessionId, error: sessionMetaError });
    return { error: 'Failed to load session metadata', status: 500 };
  }

  const hasSummary = !!sessionMeta?.summary?.trim();
  const lastMessageAt = messages?.[messages.length - 1]?.created_at;
  const idleMs = lastMessageAt ? Date.now() - new Date(lastMessageAt).getTime() : 0;

  const shouldSummarize = !hasSummary || (messageCount >= 6 && messageCount % 6 === 0) || idleMs >= 8000;
  if (!shouldSummarize) {
    return { skipped: true, reason: 'trigger-not-met', messageCount };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { error: 'GEMINI_API_KEY is missing.', status: 500 };
  }

  try {
    // [수정] 올바른 패키지 및 모델 초기화
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const prompt = `아래 청소년 대화를 보고 JSON으로만 답하세요.
필드:
- summary: 반드시 한국어 2~3문장, 공백 포함 200~350자. '주제 + 감정/상태 + 요청사항'을 포함하고 민감정보는 제거
- riskLevel: stable | normal | caution
판정 기준: 자해/자살 암시, 폭력, 성적 착취, 극단 우울은 caution

대화:
${transcript}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    const payload = JSON.parse(text || '{}');
    const summary = normalizeSummary(payload.summary);
    const riskLevel = payload.riskLevel === 'stable' || payload.riskLevel === 'caution' ? payload.riskLevel : 'normal';

    const { error: updateError } = await supabaseAdmin
      .from('chat_sessions')
      .update({ summary, risk_level: riskLevel })
      .eq('id', sessionId);

    if (updateError) {
      console.error('session summary update failed:', { sessionId, messageCount, error: updateError });
      return { error: 'Failed to update session summary', status: 500 };
    }

    return { summary, riskLevel, messageCount, skipped: false };
  } catch (error) {
    console.error('AI Summary generation failed:', error);
    return { error: 'AI generation failed', status: 500 };
  }
};

export async function POST(req: Request) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is missing.' }, { status: 500 });
    }

    const { sessionId } = await req.json();
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const authHeader = req.headers.get('authorization');
    const authedClient = createAuthedSupabase(authHeader);
    const { data: authResult } = await authedClient.auth.getUser();
    if (!authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: sessionRow, error: sessionError } = await authedClient
      .from('chat_sessions')
      .select('id, student_id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !sessionRow) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const result = await summarizeSession(sessionId);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status as number });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('session summary error:', { error });
    return NextResponse.json({ error: 'Failed to summarize session' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
  }

  const authHeader = req.headers.get('authorization');
  const authedClient = createAuthedSupabase(authHeader);
  const { data: authResult } = await authedClient.auth.getUser();
  if (!authResult.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: sessionRow } = await authedClient
    .from('chat_sessions')
    .select('id')
    .eq('id', sessionId)
    .single();

  if (!sessionRow) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const result = await summarizeSession(sessionId);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status as number });
  }
  return NextResponse.json(result);
}

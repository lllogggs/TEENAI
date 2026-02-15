import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';
import { createAuthedSupabase, supabaseAdmin } from '../_lib/supabaseServer';

export async function POST(req: Request) {
  try {
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

    const { data: messages, error: messageError } = await supabaseAdmin
      .from('messages')
      .select('role, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(20);

    if (messageError) {
      console.error('session summary message load failed:', { sessionId, messageCount: 0, error: messageError });
      return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 });
    }

    const messageCount = (messages || []).length;
    const transcript = (messages || []).map((message) => `${message.role}: ${message.content}`).join('\n');
    if (!transcript) {
      return NextResponse.json({ summary: '대화가 아직 충분하지 않습니다.', riskLevel: 'normal' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is missing.' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `아래 청소년 대화를 보고 JSON으로만 답하세요.\n필드:\n- summary: 1~2문장, '주제 + 감정/상태 + 요청사항' 구조, 민감정보 제거\n- riskLevel: stable | normal | caution\n판정에서 자해/자살 암시, 폭력, 성적 착취, 극단 우울은 caution\n\n대화:\n${transcript}`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const payload = JSON.parse(result.text || '{}');
    const summary = typeof payload.summary === 'string' ? payload.summary : '대화 요약을 생성하지 못했습니다.';
    const riskLevel = payload.riskLevel === 'stable' || payload.riskLevel === 'caution' ? payload.riskLevel : 'normal';

    const { error: updateError } = await supabaseAdmin
      .from('chat_sessions')
      .update({ summary: summary, risk_level: riskLevel })
      .eq('id', sessionId);

    if (updateError) {
      console.error('session summary update failed:', { sessionId, messageCount, error: updateError });
      return NextResponse.json({ error: 'Failed to update session summary' }, { status: 500 });
    }

    return NextResponse.json({ summary, riskLevel });
  } catch (error) {
    console.error('session summary error:', { error });
    return NextResponse.json({ error: 'Failed to summarize session' }, { status: 500 });
  }
}

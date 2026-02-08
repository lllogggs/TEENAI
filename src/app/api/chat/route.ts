import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

export const runtime = 'edge';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

const supabaseAdmin = supabaseUrl && serviceRole ? createClient(supabaseUrl, serviceRole) : null;

export async function POST(req: NextRequest) {
  try {
    if (!geminiApiKey) {
      return new Response('Missing Gemini API key', { status: 500 });
    }

    const { messages, sessionId, userId, studentName, accessCode } = await req.json();

    const result = await streamText({
      model: google('models/gemini-1.5-flash'),
      messages,
      system:
        '너는 10대 학생의 진로와 학습을 돕는 TEENAI 멘토야. 학생에게 친절하고 구체적인 단계별 조언을 한국어로 제공하고, 부모가 이해할 수 있는 맥락도 함께 남겨줘.',
      async onFinish({ text }) {
        if (!supabaseAdmin || !sessionId || !userId) return;
        try {
          await supabaseAdmin.from('messages').insert({
            session_id: sessionId,
            user_id: userId,
            role: 'assistant',
            content: text,
            notes: `학생: ${studentName ?? '이름없음'}`,
            access_code: accessCode,
          });
        } catch (error) {
          console.error('메시지 저장 에러:', error);
        }
      },
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('AI 응답 처리 에러:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

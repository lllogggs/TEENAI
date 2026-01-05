import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

export const runtime = 'edge';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = supabaseUrl && serviceRole ? createClient(supabaseUrl, serviceRole) : null;

export async function POST(req: NextRequest) {
  const { messages, sessionId, userId, studentName } = await req.json();

  const result = await streamText({
    model: google('models/gemini-1.5-flash'),
    messages,
    system: `너는 10대 학생의 진로와 학습을 돕는 TEENAI 멘토야. 학생에게 친절하고 구체적인 단계별 조언을 한국어로 제공하고, 부모가 이해할 수 있는 맥락도 함께 남겨줘.`,
  });

  return result.toAIStreamResponse({
    async onFinal(completion) {
      if (!supabaseAdmin || !sessionId || !userId) return;
      await supabaseAdmin.from('messages').insert({
        session_id: sessionId,
        user_id: userId,
        role: 'assistant',
        content: completion,
        notes: `학생: ${studentName ?? '이름없음'}`,
      });
    },
  });
}

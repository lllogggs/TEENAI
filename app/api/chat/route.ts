import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { history, newMessage, parentStylePrompt } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is missing.' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const baseInstruction = [
      "학생에게 답하는 기본 원칙: 당신은 청소년 전문 AI 멘토 '틴에이아이(TEENAI)'입니다.",
      '반드시 부드러운 존댓말(해요체)을 사용하고, 공감 -> 조언 -> 질문 구조로 답변하세요.',
      '유해/위험 요청은 안전하게 거절하고 보호자/전문가 도움을 권장하세요.',
    ].join('\n');

    const mergedInstruction = `${baseInstruction}\n\n[Parent Style Prompt]\n${String(parentStylePrompt || '')}`;

    const normalizedHistory = Array.isArray(history)
      ? history
          .map((item: any) => {
            if (!item || (item.role !== 'user' && item.role !== 'model')) return null;
            if (typeof item.content === 'string') {
              return { role: item.role, parts: [{ text: item.content }] };
            }
            if (Array.isArray(item.parts)) {
              return { role: item.role, parts: item.parts };
            }
            return null;
          })
          .filter(Boolean)
      : [];

    const chat = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: { systemInstruction: mergedInstruction, temperature: 0.7 },
      history: normalizedHistory as any,
    });

    const result = await chat.sendMessage({ message: String(newMessage || '') });
    return NextResponse.json({ text: result.text || '' });
  } catch (error) {
    console.error('Gemini API Error:', error);
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 });
  }
}

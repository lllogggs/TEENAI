import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';
import { getGeminiApiKeyOrThrow } from '../_lib/env';

const DETAIL_KEYWORDS = ['자세히', '설명', '근거', '예시', '정리', '단계별', '왜', '어떻게', '비교', '방법'];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const applyLengthPostProcess = (text: string, targetLength: number) => {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  if (trimmed.length > targetLength * 1.3) {
    const sentences = trimmed.split(/(?<=[.!?다요])\s+/).filter(Boolean);
    let compact = '';
    for (const sentence of sentences) {
      if ((compact + sentence).length > targetLength * 1.1) break;
      compact += `${sentence} `;
    }
    return compact.trim() || trimmed.slice(0, targetLength);
  }

  if (trimmed.length < targetLength * 0.7) {
    return `${trimmed}\n\n- 핵심 한 줄: 지금 감정과 상황을 한 문장으로 정리해 보세요.\n- 다음 한 걸음: 바로 할 수 있는 작은 행동 1가지를 정해 보세요.`;
  }

  return trimmed;
};

const normalizeHistory = (history: any) => {
  if (!Array.isArray(history)) return [];
  return history
    .map((item: any) => {
      if (!item || (item.role !== 'user' && item.role !== 'model')) return null;
      if (typeof item.content !== 'string') return null;
      const text = item.content.trim();
      if (!text) return null;
      return `${item.role === 'user' ? '학생' : '멘토'}: ${text}`;
    })
    .filter(Boolean)
    .slice(-20);
};

export async function POST(req: Request) {
  try {
    const { history, newMessage, parentStylePrompt } = await req.json();

    const userText = String(newMessage || '').trim();
    if (!userText) {
      return NextResponse.json({ error: 'newMessage is required.' }, { status: 400 });
    }

    const isDetailedRequest = DETAIL_KEYWORDS.some((keyword) => userText.includes(keyword));
    const minLength = isDetailedRequest ? 120 : 90;
    const randomRatio = 0.8 + Math.random() * 0.4;
    const targetLength = clamp(Math.round(userText.length * randomRatio), minLength, isDetailedRequest ? 1200 : 450);

    const systemInstruction = [
      "당신은 청소년 전문 AI 멘토 '틴에이아이(TEENAI)'입니다.",
      '안전 정책을 최우선으로 준수하고, 유해/위험 요청에는 차분하게 거절 후 보호자/전문가 도움을 권장하세요.',
      '한국어 존댓말(~요)로 답하고, 학생을 판단하거나 훈계하지 마세요.',
      '가독성 좋은 채팅 형식으로 답하세요: 2~4줄 단락, 필요 시 bullet/번호 목록, 짧은 소제목 가능, 이모지는 최대 1개.',
      isDetailedRequest
        ? `학생이 상세 설명을 요청했어요. 평소보다 길게 답해도 되지만 핵심을 유지해 주세요. 목표 길이 약 ${targetLength}자.`
        : `답변 길이를 학생 질문과 비슷하게 맞추세요. 목표 길이 약 ${targetLength}자(±20% 범위).`,
      '',
      '[Parent Custom Prompt]',
      String(parentStylePrompt || ''),
    ].join('\n');

    const transcript = normalizeHistory(history).join('\n');
    const prompt = [
      transcript ? `[대화 기록]\n${transcript}` : '',
      `[학생의 새 메시지]\n${userText}`,
      '위 정보를 바탕으로 멘토 답변을 작성하세요.',
    ]
      .filter(Boolean)
      .join('\n\n');

    const ai = new GoogleGenAI({ apiKey: getGeminiApiKeyOrThrow() });
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    const finalText = applyLengthPostProcess(result.text || '', targetLength);
    return NextResponse.json({ text: finalText, targetLength });
  } catch (error: any) {
    const message = typeof error?.message === 'string' ? error.message : 'AI 응답 생성 중 오류가 발생했습니다.';
    console.error('Gemini API Error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

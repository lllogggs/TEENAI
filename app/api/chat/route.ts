import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

// 간단한 후처리/유틸 함수들은 기존 로직 유지
const DETAIL_KEYWORDS = ['자세히', '설명', '근거', '예시', '정리', '단계별', '왜', '어떻게', '비교', '방법'];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const applyLengthPostProcess = (text: string, targetLength: number) => {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  // 너무 길 경우 문장 단위로 자르기 (단순화됨)
  if (trimmed.length > targetLength * 1.5) {
     return trimmed.slice(0, targetLength * 1.5) + '...';
  }
  return trimmed;
};

export async function POST(req: Request) {
  try {
    const { history, newMessage, parentStylePrompt } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is missing.' }, { status: 500 });
    }

    // 1. SDK 초기화 (올바른 패키지 사용)
    const genAI = new GoogleGenerativeAI(apiKey);

    // 2. 시스템 프롬프트 구성
    const userText = String(newMessage || '').trim();
    const isDetailedRequest = DETAIL_KEYWORDS.some((keyword) => userText.includes(keyword));
    // 목표 길이 계산 로직 유지
    const minLength = isDetailedRequest ? 120 : 90;
    const randomRatio = 0.8 + Math.random() * 0.4;
    const targetLength = clamp(Math.round(userText.length * randomRatio), minLength, isDetailedRequest ? 1200 : 450);

    const baseInstruction = [
      "당신은 청소년 전문 AI 멘토 '틴에이아이(TEENAI)'입니다.",
      '안전 정책을 최우선으로 준수하고, 유해/위험 요청에는 차분하게 거절 후 보호자/전문가 도움을 권장하세요.',
      '한국어 존댓말(~요)로 답하고, 학생을 판단하거나 훈계하지 마세요.',
      '가독성 좋은 채팅 형식으로 답하세요: 2~4줄 단락, 필요 시 bullet/번호 목록, 짧은 소제목 가능, 이모지는 최대 1개.',
      isDetailedRequest
        ? `학생이 상세 설명을 요청했어요. 평소보다 길게 답해도 되지만 핵심을 유지해 주세요.`
        : `답변 길이를 학생 질문과 비슷하게 맞추세요.`,
    ].join('\n');

    const systemInstruction = `${baseInstruction}\n\n[Parent Custom Prompt]\n${String(parentStylePrompt || '')}`;

    // 3. 모델 설정 (안정적인 1.5 flash 모델 사용)
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: systemInstruction,
    });

    // 4. 대화 기록 포맷 변환 (SDK에 맞는 형식으로)
    const normalizedHistory = Array.isArray(history)
      ? history.map((item: any) => ({
          role: item.role === 'user' ? 'user' : 'model',
          parts: [{ text: item.content || item.text || '' }],
        }))
      : [];

    // 5. 채팅 시작 및 메시지 전송
    const chat = model.startChat({
      history: normalizedHistory,
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7,
      },
    });

    const result = await chat.sendMessage(userText);
    const response = await result.response;
    const text = response.text();

    const finalText = applyLengthPostProcess(text || '', targetLength);

    return NextResponse.json({ text: finalText });

  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate response' },
      { status: 500 }
    );
  }
}

import { GoogleGenAI } from '@google/genai';

const getApiKey = () => process.env.GEMINI_API_KEY || '';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY is missing on server environment.' });
    return;
  }

  try {
    const { history, newMessage, parentStylePrompt } = req.body || {};

    const baseInstruction = [
      "학생에게 답하는 기본 원칙: 당신은 청소년 전문 AI 멘토 '틴에이아이(TEENAI)'입니다.",
      '반드시 부드러운 존댓말(해요체)을 사용하고, 공감 -> 조언 -> 질문의 구조로 답변해주세요.',
      '유해하거나 위험한 요청은 정중히 거절하고 안전한 대안을 제시하세요.',
    ].join('\n');

    const mergedInstruction = `${baseInstruction}\n\nPARENT_STYLE_PROMPT: ${parentStylePrompt || ''}`;

    const ai = new GoogleGenAI({ apiKey });
    const chat = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: { systemInstruction: mergedInstruction, temperature: 0.7 },
      history: Array.isArray(history) ? history : [],
    });

    const result = await chat.sendMessage({ message: String(newMessage || '') });
    res.status(200).json({ text: result.text || '' });
  } catch (error) {
    console.error('Gemini chat error:', error);
    res.status(500).json({ error: 'AI 응답 생성 중 오류가 발생했습니다.' });
  }
}

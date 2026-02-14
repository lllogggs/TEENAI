import { GoogleGenAI } from '@google/genai';

const getApiKey = () => process.env.GEMINI_API_KEY || process.env.API_KEY || '';

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
    const { history, newMessage, settings } = req.body || {};

    let instruction = "당신은 청소년의 성장을 진심으로 응원하고 인격적으로 존중하는 '전문 AI 멘토', 틴에이아이(TEENAI)입니다.";
    instruction += '\n반드시 부드러운 존댓말(해요체)을 사용하고, 공감 -> 조언 -> 질문의 구조로 답변해주세요.';

    if (settings?.parentDirectives?.length > 0) {
      instruction += `\n\n[학부모 요청사항]\n${settings.parentDirectives.join('\n')}`;
    }

    const ai = new GoogleGenAI({ apiKey });
    const chat = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: { systemInstruction: instruction, temperature: 0.7 },
      history: Array.isArray(history) ? history : [],
    });

    const result = await chat.sendMessage({ message: String(newMessage || '') });
    res.status(200).json({ text: result.text || '' });
  } catch (error) {
    console.error('Gemini chat error:', error);
    res.status(500).json({ error: 'AI 응답 생성 중 오류가 발생했습니다.' });
  }
}

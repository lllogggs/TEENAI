import { GoogleGenAI } from '@google/genai';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY is missing on server environment.' });
    return;
  }

  const firstMessage = String(req.body?.firstMessage || '').trim();
  if (!firstMessage) {
    res.status(400).json({ error: 'firstMessage is required' });
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = [
      '다음 학생의 첫 메시지를 보고 짧고 구체적인 한국어 대화 제목을 1개만 만들어 주세요.',
      '규칙:',
      '- 8~20자 내외',
      '- 따옴표, 괄호, 특수문자 남용 금지',
      '- 너무 일반적인 제목(예: 대화, 고민상담) 금지',
      '- 요약문이 아니라 대화방 제목 형태',
      '- JSON으로만 응답: {"title":"..."}',
      '',
      `학생 메시지: ${firstMessage}`,
    ].join('\n');

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    const parsed = JSON.parse(result.text || '{}');
    const rawTitle = typeof parsed.title === 'string' ? parsed.title : '';
    const normalizedTitle = rawTitle.replace(/["'`]/g, '').trim();
    const title = normalizedTitle || '새 대화';
    res.status(200).json({ title });
  } catch (error) {
    console.error('Gemini title error:', error);
    res.status(500).json({ error: '대화 제목 생성 중 오류가 발생했습니다.' });
  }
}

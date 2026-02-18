import { GoogleGenAI } from '@google/genai';

type SessionRiskLevel = 'stable' | 'normal' | 'caution';

const extractJsonObject = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return '{}';

  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) return fencedMatch[1].trim();

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return '{}';
};

const normalizeRiskLevel = (value: unknown): SessionRiskLevel => {
  if (value === 'stable' || value === 'normal' || value === 'caution') return value;
  if (value === 'warn' || value === 'high') return 'caution';
  return 'normal';
};

const sanitizeTitle = (value: unknown) => {
  if (typeof value !== 'string') return '';
  return value.replace(/["'`]/g, '').replace(/\s+/g, ' ').trim();
};

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

  const title = String(req.body?.title || '').trim();
  const firstMessage = String(req.body?.firstMessage || '').trim();
  const transcript = Array.isArray(req.body?.transcript)
    ? req.body.transcript
        .filter((item: any) => item && (item.role === 'user' || item.role === 'model') && typeof item.content === 'string')
        .slice(-16)
        .map((item: any) => ({ role: item.role, content: item.content.trim().slice(0, 400) }))
    : [];

  if (!firstMessage && transcript.length === 0) {
    res.status(400).json({ error: 'firstMessage or transcript is required' });
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const conversationBlock = transcript.length
      ? transcript.map((item: any, idx: number) => `${idx + 1}. ${item.role === 'user' ? '학생' : '멘토'}: ${item.content}`).join('\n')
      : `1. 학생: ${firstMessage}`;

    const prompt = [
      '청소년 상담 대화의 메타데이터를 JSON으로 생성하세요.',
      '반드시 아래 JSON 스키마로만 답하세요.',
      '{"title":"...","risk_level":"stable|normal|caution"}',
      '',
      '[risk_level 기준]',
      '- stable: 감정이 안정적이고 위험 신호가 거의 없음',
      '- normal: 걱정/불안/스트레스 언급은 있으나 즉각 위험 신호는 없음',
      '- caution: 자해/자살/폭력/학대/극심한 절망 등 안전 위험 가능성 존재',
      '',
      '[title 규칙]',
      '- 8~20자 한국어',
      '- 구체적인 대화방 제목 형태',
      '- 너무 일반적인 표현(예: 대화, 고민상담) 금지',
      '- 현재 title이 "새 대화"가 아니면 title은 기존 값을 그대로 반환',
      '',
      `현재 title: ${title || '새 대화'}`,
      '[최근 대화]',
      conversationBlock,
    ].join('\n');

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const raw = result.text || '{}';
    const parsed = JSON.parse(extractJsonObject(raw));
    const nextTitle = sanitizeTitle(parsed?.title);
    const fallbackTitle = title && title !== '새 대화' ? title : sanitizeTitle(firstMessage).slice(0, 20) || '새 대화';

    res.status(200).json({
      title: nextTitle || fallbackTitle,
      risk_level: normalizeRiskLevel(parsed?.risk_level),
    });
  } catch (error) {
    console.error('Gemini session-meta error:', error);
    res.status(500).json({ error: '세션 메타데이터 생성 중 오류가 발생했습니다.' });
  }
}

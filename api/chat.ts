import { GoogleGenAI } from '@google/genai';
import { enforceRateLimit, requireSupabaseUser, validateOptionalBase64DataUrl, validateTextLength } from './_lib/request-guards.js';

const getApiKey = () => process.env.GEMINI_API_KEY || '';

const countChars = (text: string) => text.replace(/\s+/g, '').length;

const shouldAllowLongAnswer = (text: string) => /자세히|설명|원리|예시|정리|분석/.test(text);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const authContext = await requireSupabaseUser(req, res);
  if (!authContext) return;

  const rateAllowed = enforceRateLimit(res, `chat:user:${authContext.userId}`, 20, 60_000)
    && enforceRateLimit(res, `chat:ip:${authContext.ip}`, 60, 60_000);
  if (!rateAllowed) return;

  const apiKey = getApiKey();
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY is missing on server environment.' });
    return;
  }

  try {
    const { history, newMessage, parentStylePrompt, imageData, audioData } = req.body || {};
    if (!validateTextLength(String(newMessage || ''), 2000)) {
      res.status(400).json({ error: 'newMessage is required and must be <= 2000 chars.' });
      return;
    }

    if (!validateOptionalBase64DataUrl(imageData, /^image\/(jpeg|jpg|png|webp)$/i, 3 * 1024 * 1024)) {
      res.status(400).json({ error: 'Invalid imageData format or image too large.' });
      return;
    }

    if (!validateOptionalBase64DataUrl(audioData, /^audio\/(webm|wav|mpeg|mp3|ogg|mp4)$/i, 5 * 1024 * 1024)) {
      res.status(400).json({ error: 'Invalid audioData format or audio too large.' });
      return;
    }
    const userMessage = String(newMessage || '');
    const userChars = Math.max(countChars(userMessage), 1);
    const minChars = Math.floor(userChars * 0.8);
    const maxChars = Math.ceil(userChars * 1.2);
    const allowLong = shouldAllowLongAnswer(userMessage);

    const baseInstruction = [
      "학생에게 답하는 기본 원칙: 당신은 청소년 전문 AI 멘토 '포틴 AI(Forteen AI)'입니다.",
      "[매우 중요] 절대 당신의 내부적인 생각 과정이나 '(생각)' 같은 텍스트를 화면에 출력하지 마세요. 학생에게 보여질 최종 대화 문장만 출력해야 합니다.",
      '반드시 부드러운 존댓말(해요체)을 사용하고, 공감 -> 조언 -> 질문의 구조로 답변해주세요.',
      '답변은 줄글만 길게 쓰지 말고, 문단/불릿/번호를 섞어 읽기 쉽게 구성해주세요.',
      allowLong
        ? '학생이 자세한 설명을 요청했으니 필요한 만큼 충분히 길고 구체적으로 답변해도 됩니다.'
        : `답변 길이는 학생 질문 글자 수(${userChars}자) 기준 약 ${minChars}~${maxChars}자 범위를 목표로 맞춰주세요.`,
      '유해하거나 위험한 요청은 정중히 거절하고 안전한 대안을 제시하세요.',
      "학생이 '부모님(엄마/아빠)이 이 대화를 보나요?' 또는 '비밀 보장 되나요?' 같은 질문을 하면, 직접적으로 '그렇다/아니다'를 답하지 말고, '부모님과 상의해보는 것이 좋겠어요' 또는 '가족과 함께 이용하는 서비스라 부모님께 여쭤보는 게 가장 정확할 거예요'라는 식으로 부드럽게 회피하며 답변해주세요.",
      "사용자가 사진을 올리고 누구인지 물어보면 단정 짓지 말고 'OOO 아닐까요?'처럼 부드럽게 추측성으로 대답하세요. 만약 사용자가 'OOO가 아니라 AAA야'라고 정정하거나 다른 정보를 강하게 주장할 경우, 절대 인공지능의 판단을 우기거나 고집하지 마세요. '아 제가 잘못 보았네요! AAA님이 맞습니다' 하고 즉각적으로 학생 측의 의견과 시각을 수용하고 맞장구쳐 주세요. 유연하고 친근한 태도가 가장 중요합니다.",
      (imageData || audioData) ? '이미지가 첨부된 경우, 이미지 속 글자, 수식, 표 등을 정확히 인식(OCR)하고 학생이 이해하기 쉽게 단계별로 친절하게 설명하세요.' : '',
    ].filter(Boolean).join('\n');

    const mergedInstruction = `${baseInstruction}\n\n[Parent Style Prompt]\n${String(parentStylePrompt || '')}`;

    const ai = new GoogleGenAI({ apiKey });

    // 1. 현재 턴의 사용자 메시지 및 미디어 데이터 세팅
    let userParts: any[] = [{ text: userMessage }];

    if (imageData) {
      userParts.push({
        inlineData: {
          data: imageData.replace(/^data:image\/\w+;base64,/, ''),
          mimeType: 'image/jpeg'
        }
      });
    }

    if (audioData) {
      const match = audioData.match(/^data:(audio\/\w+);base64,/);
      const mimeType = match ? match[1] : 'audio/webm';

      userParts.push({
        inlineData: {
          data: audioData.replace(/^data:audio\/\w+;base64,/, ''),
          mimeType: mimeType
        }
      });
    }

    // 2. 히스토리 파싱: [IMAGE] 태그를 실제 inlineData로 분리 변환
    let normalizedHistory = Array.isArray(history)
      ? history
        .map((item: any) => {
          if (!item || (item.role !== 'user' && item.role !== 'model')) return null;
          
          let parts: any[] = [];
          if (typeof item.content === 'string') {
            const imgRegex = /\[IMAGE\](.*?)\[\/IMAGE\]/;
            const match = item.content.match(imgRegex);
            
            if (match) {
              const base64Full = match[1];
              const pureText = item.content.replace(imgRegex, '').trim();
              
              const mimeMatch = base64Full.match(/^data:(image\/\w+);base64,/);
              const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
              const b64Data = base64Full.replace(/^data:image\/\w+;base64,/, '');
              
              if (b64Data) {
                parts.push({ inlineData: { data: b64Data, mimeType } });
              }
              if (pureText) {
                parts.push({ text: pureText });
              }
            } else {
              parts.push({ text: item.content });
            }
          } else if (Array.isArray(item.parts)) {
            parts = item.parts;
          }
          
          return parts.length > 0 ? { role: item.role, parts } : null;
        })
        .filter(Boolean)
      : [];

    // 3. Gemini 대화 규칙(user -> model 번갈아 등장) 준수 및 충돌 방지 로직
    const sanitizedHistory: any[] = [];
    for (const item of normalizedHistory) {
      if (!item) continue;
      const last = sanitizedHistory[sanitizedHistory.length - 1];
      if (last && last.role === item.role) {
        last.parts.push(...item.parts); // 연속된 동일 role이면 파트 병합
      } else {
        sanitizedHistory.push(item);
      }
    }
    
    // 마지막 히스토리가 'user'라면(직전 통신 실패 등), 현재 보내는 것도 'user'라 에러 발생. 빼서 현재 전송 데이터에 합침.
    if (sanitizedHistory.length > 0 && sanitizedHistory[sanitizedHistory.length - 1].role === 'user') {
      const poppedUser = sanitizedHistory.pop();
      userParts.unshift(...poppedUser.parts);
    }

    const chat = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: { systemInstruction: mergedInstruction, temperature: 0.7 },
      history: sanitizedHistory as any,
    });

    // 여기서 객체 래핑({ message: userParts })을 제거하고 배열 자체를 바로 전달
    const result = await chat.sendMessage(userParts);
    
    // SDK 버전에 따라 응답 객체 구조가 다를 수 있으므로 텍스트를 가장 확실하게 추출
    const aiText = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    res.status(200).json({ text: aiText });
  } catch (error) {
    console.error('Gemini chat error:', {
      error,
      userId: authContext.userId,
      inputLength: String(req.body?.newMessage || '').length,
      hasImage: Boolean(req.body?.imageData),
      hasAudio: Boolean(req.body?.audioData),
    });
    res.status(500).json({ error: 'AI 응답 생성 중 오류가 발생했습니다.' });
  }
}

import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, AISettings } from '../types';

const ai = new GoogleGenAI({ apiKey: '' });

export const GeminiService = {
  chat: async (history: { role: 'user' | 'model', parts: { text: string }[] }[], newMessage: string, settings?: AISettings) => {
    try {
      let instruction = `당신은 청소년의 성장을 진심으로 응원하고 인격적으로 존중하는 '전문 AI 멘토', 틴에이아이(TEENAI)입니다. 

[페르소나 가이드라인]
1. **정체성**: 학생의 고민을 경청하고 지지해주는 따뜻하고 품격 있는 멘토입니다. 권위적이지 않되, 선을 지키며 학생을 인격체로 대우하세요.
2. **말투 (필수)**: 
   - 반드시 **부드러운 존댓말(해요체)**을 사용하세요. (예: "~했어요", "~일까요?", "~군요")
   - 딱딱한 문어체보다는 대화하듯 다정한 구어체를 사용하세요.
   - 학생의 이름을 부르거나 "OO님"과 같이 존중이 담긴 호칭을 적절히 섞어주세요.
3. **대화 구조**:
   - [깊은 공감과 경청] -> [통찰력 있는 조언이나 지지] -> [생각을 열어주는 존중 섞인 질문]
   - 대화의 끝은 항상 학생이 자신의 생각을 편안하게 말할 수 있도록 따뜻한 질문으로 마무리하세요.
4. **금기사항**:
   - **반말을 절대 사용하지 마세요.**
   - 학생을 가르치려 들거나 훈계하는 조언은 피하세요. 대신 학생의 입장에서 함께 고민하는 태도를 취하세요.
   - "그건 틀렸어" 같은 부정적인 단정보다는 "그렇게 생각할 수도 있겠네요. 혹시 이런 관점은 어떨까요?" 식으로 제안하세요.`;

      // 학부모 지시사항 반영 (최우선순위)
      if (settings?.parentDirectives && settings.parentDirectives.length > 0) {
        const directivesStr = settings.parentDirectives.map((d, i) => `${i + 1}. ${d}`).join('\n');
        instruction += `\n\n[학부모의 특별 요청 사항 - 멘토의 품격을 유지하며 아래 내용을 대화에 반영하세요]\n${directivesStr}`;
      }
      
      if (settings) {
        // --- 성향별 미세 조정 (존댓말 기반) ---
        if (settings.toneType === 'gentle') {
          instruction += "\n- 훨씬 더 다정하고 세심하게 학생의 감정을 보살펴주는 멘토가 되어주세요.";
        } else if (settings.toneType === 'logical') {
          instruction += "\n- 차분하고 논리적으로 상황을 분석하며, 학생이 객관적으로 상황을 볼 수 있도록 도와주는 지적인 멘토가 되어주세요.";
        } else {
          instruction += "\n- 밝고 긍정적인 에너지를 주되, 예의를 갖춘 친근한 대화 스타일을 유지하세요.";
        }

        // --- 가드레일 작동 방식 ---
        if (settings.strictSafety) {
          instruction += "\n- 부적절한 대화 시에는 정중하지만 단호하게 '그 부분에 대해서는 제가 도움을 드리기 어렵습니다'라고 선을 그어주세요.";
        }
        if (settings.eduMode) {
          instruction += "\n- 답을 바로 알려주기보다 'OO님은 어떻게 생각하시나요?'라며 학생의 사고 과정을 존중하며 기다려주세요.";
        }
        if (settings.socialBalance) {
          instruction += "\n- 대화가 너무 길어지면 '열심히 대화하다 보니 시간이 훌쩍 지났네요. 잠시 쉬었다가 나중에 다시 이야기 나눌까요?'라고 부드럽게 권유하세요.";
        }
        if (settings.cleanLanguage) {
          instruction += "\n- 부적절한 언어 사용 시 '조금 더 예쁜 표현을 사용해보면 어떨까요? OO님의 고운 마음이 더 잘 전달될 것 같아요'라고 격려하며 교정하세요.";
        }

        // --- 추가 설정 ---
        if (settings.praiseIntensity === 'high') {
          instruction += "\n- 학생의 작은 성취에도 진심 어린 찬사와 격려를 보내주세요. 학생의 자존감을 높여주는 것이 중요합니다.";
        }
        if (settings.interestTopic) {
          instruction += `\n- 학생이 관심 있어 하는 '${settings.interestTopic}'에 대해 깊이 있는 관심을 보이며 대화를 풍성하게 만들어주세요.`;
        }
      }

      const chat = ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: { 
          systemInstruction: instruction,
          temperature: 0.7
        },
        history: history,
      });

      const result = await chat.sendMessage({ message: newMessage });
      return result.text;
    } catch (error) {
      console.error("Gemini Chat Error:", error);
      return "죄송합니다, 잠시 대화 연결에 문제가 생겼어요. 다시 한번 말씀해 주시겠어요?";
    }
  },

  analyzeSession: async (messages: { role: string, text: string }[], isShared: boolean): Promise<AnalysisResult> => {
    const transcript = messages.map(m => `${m.role}: ${m.text}`).join('\n');
    const prompt = `당신은 청소년 전문 심리 분석 전문가입니다. 다음 학생의 대화 기록을 정밀하게 분석하여 JSON으로 응답하세요.

[분석 기준 - tone_level]
1. high (주의/위험): 비속어, 욕설, 공격적인 말투, 반사회적 태도, 자해 징후, 무력감이 포함된 경우.
2. medium (보통): 약간의 짜증, 고민 상담 중인 상태.
3. low (안정): 긍정적이고 평온한 대화.

대화 기록:
${transcript}`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              topic_tags: { type: Type.ARRAY, items: { type: Type.STRING } },
              output_types: { type: Type.ARRAY, items: { type: Type.STRING } },
              tone_level: { type: Type.STRING, enum: ["low", "medium", "high"] },
              summary: { type: Type.STRING },
              student_intent: { type: Type.STRING },
              ai_intervention: { type: Type.STRING }
            },
            required: ["topic_tags", "output_types", "tone_level", "summary", "student_intent", "ai_intervention"],
          },
        },
      });
      return JSON.parse(response.text) as AnalysisResult;
    } catch (e) {
      return { 
        topic_tags: ['미분류'], 
        output_types: ['일반'], 
        tone_level: 'low',
        summary: '분석 오류',
        student_intent: '파악 불가',
        ai_intervention: '모니터링'
      };
    }
  }
};
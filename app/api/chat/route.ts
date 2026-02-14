
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function POST(req: Request) {
  try {
    const { history, newMessage, settings } = await req.json();

    let instruction = `당신은 청소년 전문 AI 멘토 '틴에이아이(TEENAI)'입니다.
    반드시 부드러운 존댓말(해요체)을 사용하세요. 학생을 존중하고 지지하는 태도를 유지하세요.`;

    if (settings?.parentDirectives?.length > 0) {
      instruction += `\n\n[학부모 요청사항]:\n${settings.parentDirectives.join('\n')}`;
    }

    // AI 설정에 따른 추가 지침 (생략 가능하나 기능 유지를 위해 포함)
    if (settings?.toneType === 'gentle') instruction += "\n- 매우 다정하고 세심하게 공감해주세요.";
    if (settings?.strictSafety) instruction += "\n- 부적절한 대화는 정중히 거절하세요.";

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { 
        parts: [
          { text: instruction },
          ...history.map((h: any) => ({ text: `${h.role}: ${h.parts[0].text}` })),
          { text: `user: ${newMessage}` }
        ] 
      },
    });

    return NextResponse.json({ text: response.text });
  } catch (error) {
    console.error("Gemini API Error:", error);
    return NextResponse.json({ error: "Failed to generate response" }, { status: 500 });
  }
}

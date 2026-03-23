import type { ChatMessage, ChatSessionMode, SessionRiskLevel, StudentSettings } from '../types.ts';

export type MentorTone = 'kind' | 'rational' | 'friendly';

export interface NormalizedSettings {
  guardrails: {
    sexual_block: boolean;
    self_directed_mode: boolean;
    overuse_prevent: boolean;
    clean_language: boolean;
  };
  mentor_tone: MentorTone;
  parent_instructions: string[];
  ai_style_prompt: string;
}

export const DEFAULT_SETTINGS: NormalizedSettings = {
  guardrails: {
    sexual_block: true,
    self_directed_mode: true,
    overuse_prevent: true,
    clean_language: true,
  },
  mentor_tone: 'kind',
  parent_instructions: [],
  ai_style_prompt: '',
};

export const riskLabelMap: Record<SessionRiskLevel, string> = {
  stable: '안정',
  normal: '주의',
  caution: '위험',
};

export const riskColorMap: Record<SessionRiskLevel, string> = {
  stable: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  normal: 'bg-amber-50 text-amber-700 border-amber-100',
  caution: 'bg-rose-50 text-rose-700 border-rose-100',
};

export const normalizeSettings = (settings?: StudentSettings | null): NormalizedSettings => {
  const guardrails = (settings?.guardrails as Record<string, unknown> | undefined) || {};
  const mentorTone = settings?.mentor_tone || settings?.mentor_style;

  return {
    guardrails: {
      sexual_block:
        typeof guardrails.sexual_block === 'boolean'
          ? guardrails.sexual_block
          : typeof guardrails.block_harmful === 'boolean'
            ? guardrails.block_harmful
            : DEFAULT_SETTINGS.guardrails.sexual_block,
      self_directed_mode:
        typeof guardrails.self_directed_mode === 'boolean'
          ? guardrails.self_directed_mode
          : typeof guardrails.self_directed === 'boolean'
            ? guardrails.self_directed
            : DEFAULT_SETTINGS.guardrails.self_directed_mode,
      overuse_prevent:
        typeof guardrails.overuse_prevent === 'boolean'
          ? guardrails.overuse_prevent
          : typeof guardrails.anti_overuse === 'boolean'
            ? guardrails.anti_overuse
            : DEFAULT_SETTINGS.guardrails.overuse_prevent,
      clean_language:
        typeof guardrails.clean_language === 'boolean'
          ? guardrails.clean_language
          : typeof guardrails.language_filter === 'boolean'
            ? guardrails.language_filter
            : DEFAULT_SETTINGS.guardrails.clean_language,
    },
    mentor_tone: mentorTone === 'kind' || mentorTone === 'rational' || mentorTone === 'friendly' ? mentorTone : DEFAULT_SETTINGS.mentor_tone,
    parent_instructions: Array.isArray(settings?.parent_instructions)
      ? settings.parent_instructions.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [],
    ai_style_prompt: typeof settings?.ai_style_prompt === 'string' ? settings.ai_style_prompt : '',
  };
};

export const buildSystemPromptFromSettings = (settings: NormalizedSettings) => {
  const guardrailLines: string[] = [];
  if (settings.guardrails.sexual_block) {
    guardrailLines.push('- 성범죄/부적절/착취 대화 요청은 안전하게 차단하고 도움 채널을 안내하세요.');
  }
  if (settings.guardrails.self_directed_mode) {
    guardrailLines.push('- 정답을 바로 제시하기보다 학생이 스스로 사고하도록 질문형 코칭을 섞어 주세요.');
  }
  if (settings.guardrails.overuse_prevent) {
    guardrailLines.push('- 과도한 사용이 감지되면 짧은 휴식을 권장하세요.');
  }
  if (settings.guardrails.clean_language) {
    guardrailLines.push('- 거친 표현은 정중하고 건강한 표현으로 교정해 주세요.');
  }

  const mentorStyleInstructionMap: Record<MentorTone, string> = {
    kind: '다정하고 따뜻한 톤',
    rational: '차분하고 구조적인 톤',
    friendly: '친근하고 편안한 톤',
  };

  return [
    '[Parent Guardrails]',
    guardrailLines.length ? guardrailLines.join('\n') : '- 별도 가드레일 없음',
    '',
    '[Mentor Tone]',
    `- ${mentorStyleInstructionMap[settings.mentor_tone]}`,
    '',
    '[Parent Instructions]',
    settings.parent_instructions.length
      ? settings.parent_instructions.map((instruction, index) => `${index + 1}. ${instruction}`).join('\n')
      : '- 없음',
    '',
    '[AI Style Prompt Override]',
    settings.ai_style_prompt || '- 없음',
  ].join('\n');
};

export const formatSessionTime = (iso: string | number) => {
  const date = new Date(iso);
  return date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const formatSessionRelative = (iso: string | number, nowDate: Date = new Date()) => {
  const date = new Date(iso);
  const diffMs = nowDate.getTime() - date.getTime();
  const diffMinutes = Math.max(Math.floor(diffMs / 60000), 0);

  if (diffMinutes < 1) return '방금 전';
  if (diffMinutes < 60) return `${diffMinutes}분 전`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return '어제';
  if (diffDays < 7) return `${diffDays}일 전`;

  return formatSessionTime(iso);
};

export const extractImageFromMessage = (text: string) => {
  const match = text.match(/\[IMAGE\](.*?)\[\/IMAGE\]/);
  return match?.[1] || null;
};

export const findLatestStudyImage = (chatMessages: ChatMessage[]) => {
  for (let i = chatMessages.length - 1; i >= 0; i -= 1) {
    const message = chatMessages[i];
    if (message.role !== 'user') continue;

    const embeddedImage = extractImageFromMessage(message.text);
    if (embeddedImage) return embeddedImage;
  }

  return null;
};

export const MODE_VALUE_MAP: Record<'대화' | '공부', ChatSessionMode> = {
  대화: 'conversation',
  공부: 'study',
};

export const MODE_LABEL_MAP: Record<ChatSessionMode, '대화' | '공부'> = {
  conversation: '대화',
  study: '공부',
};

export const MODE_CONFIG = {
  대화: {
    loadingText: '답변을 준비하고 있어요...',
    heroMessages: [
      '안녕하세요! 오늘은 어떤 이야기를 나눠볼까요?',
      '편하게 말을 걸어주세요. 같이 이야기해봐요.',
      '궁금한 것부터 가볍게 시작해봐도 좋아요.',
    ],
    placeholders: [
      '궁금한 걸 적어보세요.',
      '사진과 함께 물어보세요.',
      '고민을 짧게 적어보세요.',
    ],
  },
  공부: {
    loadingText: '힌트와 다음 질문을 정리하고 있어요...',
    heroMessages: [
      '문제를 같이 풀어볼까요?',
      '막힌 문제부터 하나씩 같이 정리해봐요.',
      '어려운 부분을 보내주면 함께 풀어볼게요.',
    ],
    placeholders: [
      '막힌 부분을 적어보세요.',
      '문제 사진을 올려보세요.',
      '힌트가 필요한 곳을 적어보세요.',
    ],
  },
} as const;

export const ENABLE_STUDY_IMAGE_PINNING = false;

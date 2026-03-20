import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User, ChatMessage, ChatSession, SessionRiskLevel, StudentSettings } from '../types';
import { supabase } from '../utils/supabase';
import { normalizeRiskLevel } from '../utils/common';
import { DANGER_KEYWORDS } from '../constants';
import PrivacyPolicyModal from './PrivacyPolicyModal';
import { ForteenLogo, AnimalIcons, ImageIcon, VoiceIcon, StopIcon } from './Icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface StudentChatProps {
  user: User;
  onLogout: () => void;
}

type MentorTone = 'kind' | 'rational' | 'friendly';

interface NormalizedSettings {
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

const DEFAULT_SETTINGS: NormalizedSettings = {
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

const riskLabelMap: Record<SessionRiskLevel, string> = {
  stable: '안정',
  normal: '주의',
  caution: '위험',
};

const riskColorMap: Record<SessionRiskLevel, string> = {
  stable: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  normal: 'bg-amber-50 text-amber-700 border-amber-100',
  caution: 'bg-rose-50 text-rose-700 border-rose-100',
};

const normalizeSettings = (settings?: StudentSettings | null): NormalizedSettings => {
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

const buildSystemPromptFromSettings = (settings: NormalizedSettings) => {
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

const formatSessionTime = (iso: string) => {
  const date = new Date(iso);
  return date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const formatSessionRelative = (iso: string) => {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
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

const extractImageFromMessage = (text: string) => {
  const match = text.match(/\[IMAGE\](.*?)\[\/IMAGE\]/);
  return match?.[1] || null;
};

const findLatestStudyImage = (chatMessages: ChatMessage[]) => {
  for (let i = chatMessages.length - 1; i >= 0; i -= 1) {
    const message = chatMessages[i];
    if (message.role !== 'user') continue;

    const embeddedImage = extractImageFromMessage(message.text);
    if (embeddedImage) return embeddedImage;
  }

  return null;
};

const MODE_CONFIG = {
  대화: {
    heroTitle: '편하게 물어보세요',
    loadingText: '답변을 준비하고 있어요...',
    placeholders: [
      '궁금한 걸 적어보세요.',
      '사진과 함께 물어보세요.',
      '고민을 짧게 적어보세요.',
    ],
  },
  공부: {
    heroTitle: '막힌 부분부터 풀어요',
    loadingText: '힌트와 다음 질문을 정리하고 있어요...',
    placeholders: [
      '막힌 부분을 적어보세요.',
      '문제 사진을 올려보세요.',
      '힌트가 필요한 곳을 적어보세요.',
    ],
  },
} as const;

const StudentChat: React.FC<StudentChatProps> = ({ user, onLogout }) => {
  const RandomAnimalIcon = useMemo(() => {
    const randomIndex = Math.floor(Math.random() * AnimalIcons.length);
    return AnimalIcons[randomIndex];
  }, []);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [input, setInput] = useState('');
  const [chatMode, setChatMode] = useState<'대화' | '공부'>('대화');
  const [loading, setLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState('');
  const [showMobileChat, setShowMobileChat] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Desktop sidebar toggle
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const settingsCacheRef = useRef<NormalizedSettings | null>(null);

  const latestInputRef = useRef(input);
  useEffect(() => {
    latestInputRef.current = input;
  }, [input]);
  const lastRecognizedRef = useRef<string>('');
  const isNewInstanceRef = useRef<boolean>(true);

  // Modal states
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);

  // Multimodal states
  const [imageThumbnail, setImageThumbnail] = useState<string | null>(null);
  const [lockedStudyImage, setLockedStudyImage] = useState<string | null>(null);
  const [isMicRecording, setIsMicRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const isIntentionalStopRef = useRef<boolean>(true);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1024;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        const base64 = canvas.toDataURL('image/jpeg', 0.8);
        setImageThumbnail(base64);
        if (chatMode === '공부') {
          setLockedStudyImage(base64);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const startMicRecord = () => {
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert('이 브라우저에서는 실시간 음성 인식을 지원하지 않습니다. (Safari의 경우 iOS 설정에서 음성 인식을 켜주시거나 Chrome 웹 브라우저를 사용해 주세요.)');
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = 'ko-KR';
      recognition.interimResults = true;
      recognition.continuous = true;

      const instanceStartTime = Date.now();
      isNewInstanceRef.current = true;
      let sessionBaseText = latestInputRef.current ? latestInputRef.current + (latestInputRef.current.endsWith(' ') ? '' : ' ') : '';

      recognition.onresult = (event: any) => {
        let currentFinal = '';
        let currentInterim = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            currentFinal += event.results[i][0].transcript;
          } else {
            currentInterim += event.results[i][0].transcript;
          }
        }

        if (isNewInstanceRef.current && (currentFinal || currentInterim)) {
          const combined = (currentFinal + currentInterim).trim();
          const isGhostTimeWindow = Date.now() - instanceStartTime < 1500;

          if (combined && isGhostTimeWindow && lastRecognizedRef.current && lastRecognizedRef.current.startsWith(combined)) {
            return;
          }
          if (combined) {
            isNewInstanceRef.current = false;
          }
        }

        if (currentFinal) {
          lastRecognizedRef.current = currentFinal.trim();
          sessionBaseText += currentFinal + ' ';
          setInput(sessionBaseText + currentInterim);
        } else {
          setInput(sessionBaseText + currentInterim);
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        if (event.error !== 'no-speech') {
          isIntentionalStopRef.current = true;
          stopMicRecord();
        }
      };

      recognition.onend = () => {
        if (!isIntentionalStopRef.current) {
          // Restart with a completely new instance to clear Safari's ghost history bugs (which causes word duplication)
          setTimeout(() => {
            if (!isIntentionalStopRef.current) startMicRecord();
          }, 50);
        } else {
          setIsMicRecording(false);
        }
      };

      speechRecognitionRef.current = recognition;
      isIntentionalStopRef.current = false;
      setIsMicRecording(true);
      recognition.start();
    } catch (err) {
      console.error('Mic access error:', err);
      alert('마이크 접근 권한이 필요합니다.');
      setIsMicRecording(false);
      isIntentionalStopRef.current = true;
    }
  };

  const stopMicRecord = () => {
    isIntentionalStopRef.current = true;
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch (e) { }
      speechRecognitionRef.current = null;
    }
    setIsMicRecording(false);
  };

  const toggleMicRecord = () => {
    if (isMicRecording) {
      stopMicRecord();
    } else {
      startMicRecord();
    }
  };



  useEffect(() => {
    if (user.subscription_expires_at) {
      const expires = new Date(user.subscription_expires_at);
      if (expires < new Date()) {
        alert('서비스 이용 기간이 만료되었습니다. 관리자에게 문의하세요.');
        onLogout();
      }
    }
  }, [user, onLogout]);

  const activeSession = useMemo(() => sessions.find((session) => session.id === currentSessionId) || null, [sessions, currentSessionId]);
  const pinnedStudyImage = useMemo(() => {
    if (imageThumbnail) return imageThumbnail;
    if (chatMode !== '공부') return null;
    return lockedStudyImage;
  }, [chatMode, imageThumbnail, lockedStudyImage]);
  const modeConfig = MODE_CONFIG[chatMode];
  const isEmptyState = messages.length === 0;
  const [placeholderSeed] = useState(() => Math.floor(Math.random() * 1000));
  const activePlaceholder = useMemo(() => {
    if (isMicRecording) return '음성을 듣고 있어요...';
    if (chatMode === '공부' && imageThumbnail) return '막힌 부분을 적어보세요.';
    if (chatMode === '공부' && pinnedStudyImage) return '이어서 질문해보세요.';
    const placeholders = modeConfig.placeholders;
    return placeholders[placeholderSeed % placeholders.length];
  }, [chatMode, imageThumbnail, isMicRecording, modeConfig.placeholders, pinnedStudyImage, placeholderSeed]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchSessions = async (forceSessionId?: string) => {
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('student_id', user.id)
      .eq('is_deleted_by_student', false) // Soft delete filter
      .order('started_at', { ascending: false });

    if (error) {
      console.error('chat_sessions fetch error:', error);
      return;
    }

    const nextSessions = (data || []) as ChatSession[];
    setSessions(nextSessions);

    const firstId = forceSessionId || null;
    if (!currentSessionId && firstId) {
      setCurrentSessionId(firstId);
      fetchMessages(firstId);
    }
  };

  const fetchMessages = async (sessionId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('messages fetch error:', error);
      setMessages([]);
      setLockedStudyImage(null);
      return;
    }

    const nextMessages = (data || []).map((item) => ({
      role: item.role,
      text: item.content,
      timestamp: new Date(item.created_at).getTime(),
    })) as ChatMessage[];

    setMessages(nextMessages);
    setLockedStudyImage(findLatestStudyImage(nextMessages));
  };

  useEffect(() => {
    fetchSessions();
  }, [user.id]);

  // useEffect on currentSessionId removed to avoid wiping optimistic messages on session creation

  const createSession = async () => {
    const { data, error } = await supabase
      .from('chat_sessions')
      .insert({
        student_id: user.id,
        tone_level: 'low',
        title: '새 대화',
      })
      .select('*')
      .single();

    if (error) {
      console.error('chat_sessions insert error:', error);
      setErrorNotice('대화 세션 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      return null;
    }

    const created = data as ChatSession;
    setSessions((prev) => [created, ...prev]);
    setCurrentSessionId(created.id);
    return created.id;
  };

  const ensureSession = async (): Promise<string | null> => {
    if (currentSessionId) return currentSessionId;
    return createSession();
  };

  const getAuthHeaders = async () => {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;

    return {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    };
  };

  const loadStudentSettings = async () => {
    if (settingsCacheRef.current) return settingsCacheRef.current;

    const { data, error } = await supabase
      .from('student_profiles')
      .select('settings')
      .eq('user_id', user.id)
      .single();

    if (error) {
      console.error('student_profiles settings fetch error:', error);
      settingsCacheRef.current = DEFAULT_SETTINGS;
      return settingsCacheRef.current;
    }

    settingsCacheRef.current = normalizeSettings(data?.settings as StudentSettings);
    return settingsCacheRef.current;
  };

  const persistMessage = async (sessionId: string, role: 'user' | 'model', content: string) => {
    const { error } = await supabase.from('messages').insert({
      session_id: sessionId,
      student_id: user.id,
      role,
      content,
    });

    if (error) {
      console.error('messages insert error:', error);
      setErrorNotice('일부 메시지 저장에 실패했습니다. 관리자에게 문의해 주세요.');
    }
  };

  const updateSessionMetaWithAI = async (sessionId: string, firstMessage: string, transcript: { role: 'user' | 'model'; content: string }[]) => {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return;

    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/session-meta', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          firstMessage,
          transcript,
          title: session.title || '새 대화',
        }),
      });

      if (!response.ok) {
        throw new Error('session-meta generation failed');
      }

      const payload = await response.json();
      const nextTitle = typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim() : '새 대화';
      // 충돌 해결: 전역 normalizeRiskLevel 함수를 사용하여 일관성 있게 값을 변환합니다.
      const nextRiskLevel = normalizeRiskLevel(payload.risk_level);

      const { error } = await supabase
        .from('chat_sessions')
        .update({
          title: session.title === '새 대화' ? nextTitle : session.title,
          risk_level: nextRiskLevel,
        })
        .eq('id', sessionId)
        .eq('student_id', user.id);

      if (error) {
        console.error('chat_sessions session-meta update error:', error);
        return;
      }

      setSessions((prev) =>
        prev.map((item) =>
          item.id === sessionId
            ? {
              ...item,
              title: item.title === '새 대화' ? nextTitle : item.title,
              risk_level: nextRiskLevel,
            }
            : item,
        ),
      );
    } catch (error) {
      console.error('session-meta generation error:', error);
    }
  };

  const handleSend = async (inlineAudioBase64?: string) => {
    if (!input.trim() && !imageThumbnail && !inlineAudioBase64) return;
    if (loading) return;

    setErrorNotice('');
    const userText = input.trim() || (inlineAudioBase64 ? '(음성 메시지)' : '(이미지 전송)');

    // Embed the image in text for DB storage
    const contentToPersist = imageThumbnail ? `[IMAGE]${imageThumbnail}[/IMAGE]\n${userText}` : userText;

    const userMsg: ChatMessage = { role: 'user', text: contentToPersist, timestamp: Date.now() };
    const nextHistory = messages.map((m) => ({ role: m.role, content: m.text }));

    const currentImage = imageThumbnail;

    setInput('');
    setImageThumbnail(null);
    if (chatMode === '공부' && currentImage) {
      setLockedStudyImage(currentImage);
    }
    setLoading(true);
    setMessages((prev) => [...prev, userMsg]);

    const sessionId = await ensureSession();
    if (!sessionId) {
      setLoading(false);
      return;
    }

    await persistMessage(sessionId, 'user', contentToPersist);

    // [최우선] API 호출 비용 최적화 로직
    const isDanger = DANGER_KEYWORDS.some((keyword) => userText.includes(keyword));
    const nextTotalLength = nextHistory.length + 1; // including new user message

    // 조건: 첫 3턴(메세지 6개) 이하이거나, 이후로는 메시지 10개 (5턴) 단위이거나, 위험 문구가 포함된 경우
    const shouldUpdateMeta =
      nextTotalLength <= 6 ||
      (nextTotalLength - 6) % 10 === 0 ||
      isDanger;

    if (shouldUpdateMeta) {
      // (불필요한 await 없이 비동기로 실행)
      updateSessionMetaWithAI(sessionId, userText, [...nextHistory, { role: 'user', content: userText }]);
    }

    if (isDanger) {
      const { error } = await supabase.from('safety_alerts').insert({
        student_id: user.id,
        message: '위험 키워드가 포함된 대화가 감지되었습니다.',
      });
      if (error) {
        console.error('safety_alerts insert error:', error);
      }
    }

    try {
      const settings = await loadStudentSettings();
      const parentStylePrompt = buildSystemPromptFromSettings(settings);

      const headers = await getAuthHeaders();
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mode: chatMode,
          newMessage: userText,
          history: nextHistory,
          parentStylePrompt,
          imageData: currentImage || undefined,
          audioData: inlineAudioBase64 || undefined
        }),
      });

      const data = await response.json();
      const aiText = data.text || '잠시 대화가 어려워요. 다시 시도해볼까요?';
      const aiMsg: ChatMessage = {
        role: 'model',
        text: aiText,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, aiMsg]);
      await persistMessage(sessionId, 'model', aiText);

    } catch (err) {
      console.error('chat response error:', err);
      setErrorNotice('AI 응답 생성 중 문제가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  const openSession = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    fetchMessages(sessionId);
    setShowMobileChat(true);
    setErrorNotice('');
  };

  const handleNewSession = () => {
    setErrorNotice('');
    settingsCacheRef.current = null;
    setCurrentSessionId(null);
    setMessages([]);
    setLockedStudyImage(null);
    setShowMobileChat(true);
  };

  const focusInput = () => {
    const inputField = document.querySelector<HTMLInputElement>('input[placeholder]');
    inputField?.focus();
  };

  const quickPrompts = useMemo(() => modeConfig.placeholders.slice(0, 3), [modeConfig.placeholders]);

  const renderMessageContent = (text: string) => {
    const imgRegex = /\[IMAGE\](.*?)\[\/IMAGE\]/;
    const match = text.match(imgRegex);
    if (match) {
      const base64 = match[1];
      const pureText = text.replace(imgRegex, '').trim();
      return (
        <div className="flex flex-col gap-2">
          <img src={base64} alt="attached view" className="max-w-[150px] md:max-w-[200px] max-h-[300px] object-contain rounded-xl shadow-sm border border-black/5 select-none" />
          <div className="markdown-body text-sm font-medium">
            {pureText && <ReactMarkdown remarkPlugins={[remarkGfm]}>{pureText}</ReactMarkdown>}
          </div>
        </div>
      );
    }
    return (
      <div className="markdown-body text-sm font-medium">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    );
  };

  return (
    <div className="flex h-[100dvh] bg-[radial-gradient(circle_at_top,#ffffff_0%,#f8fafc_48%,#eef4ff_100%)] flex-col overflow-hidden">
      <header className="sticky top-0 z-20 shrink-0 border-b border-white/70 bg-white/85 px-3 md:px-8 py-2 md:py-3.5 pt-[calc(env(safe-area-inset-top,0px)+0.55rem)] backdrop-blur-2xl shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 md:gap-5">
            <ForteenLogo className="w-11 h-11 md:w-12 md:h-12 shrink-0 shadow-lg shadow-brand-900/10 rounded-2xl ring-1 ring-slate-200/60" />
            <div>
              <h1 className="text-[1.65rem] md:text-[1.75rem] font-black text-brand-900 tracking-tight select-none">포틴AI</h1>
              <div className="mt-1 flex items-center gap-2 select-none">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[9px] md:text-[10px] font-black tracking-[0.2em] text-emerald-700 shadow-sm shadow-emerald-100/40">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  실시간 멘토링
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={onLogout}
              className="inline-flex h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-[11px] font-black tracking-tight text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-row min-h-0">
        {/* Sidebar */}
        <aside className={`${showMobileChat ? 'hidden' : 'block'} ${isSidebarOpen ? 'lg:w-[320px]' : 'lg:w-[84px]'} lg:block min-h-0 border-r border-white/60 bg-white/72 backdrop-blur-xl transition-[width] duration-300 ease-in-out overflow-hidden`}>
          <div className={`flex h-full min-h-0 flex-col transition-[width] duration-300 ease-in-out ${isSidebarOpen ? 'w-[320px]' : 'w-[84px]'}`}>
            <div className={`shrink-0 border-b border-slate-100/80 bg-white/90 transition-all duration-300 ${isSidebarOpen ? 'p-4 md:p-5' : 'px-3 py-4'}`}>
              <div className={`mb-3 flex items-center ${isSidebarOpen ? 'justify-between' : 'justify-center'}`}>
                {isSidebarOpen && (
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Conversations</p>
                    <p className="mt-1 text-sm font-bold text-slate-700">대화 목록</p>
                  </div>
                )}
                <span className={`${isSidebarOpen ? 'inline-flex' : 'hidden'} rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500`}>
                  {sessions.length}
                </span>
              </div>

              <div className={`flex items-center gap-2 ${isSidebarOpen ? '' : 'justify-center'}`}>
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen((prev) => !prev)}
                  aria-label={isSidebarOpen ? '대화 목록 접기' : '대화 목록 열기'}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7h16M4 12h16M4 17h16"></path></svg>
                </button>
                <button
                  type="button"
                  onClick={handleNewSession}
                  aria-label="새 대화 시작"
                  className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-black whitespace-nowrap transition-all duration-300 ease-in-out overflow-hidden ${
                    isSidebarOpen
                      ? 'flex-1 border-brand-100 bg-gradient-to-r from-brand-900 to-[#4338ca] px-4 text-white shadow-md shadow-brand-900/15 hover:-translate-y-0.5 hover:shadow-lg opacity-100 translate-x-0'
                      : 'w-0 border-transparent bg-transparent px-0 text-transparent opacity-0 -translate-x-2 pointer-events-none'
                  }`}
                >
                  <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v14M5 12h14" />
                  </svg>
                  <span>새 대화</span>
                </button>
              </div>
            </div>

              <div
              aria-hidden={!isSidebarOpen}
              className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 md:p-5 space-y-3 transition-all duration-200 ease-out ${
                isSidebarOpen
                  ? 'opacity-100 translate-x-0 delay-75 pointer-events-auto'
                  : 'opacity-0 -translate-x-2 pointer-events-none'
              }`}
            >
              {sessions.map((session) => {
                const isActive = session.id === currentSessionId;
                return (
                  <div key={session.id} className="relative group">
                    <button
                      onClick={() => openSession(session.id)}
                      className={`w-full text-left rounded-[1.35rem] border px-3.5 py-3 transition-all pr-10 shadow-sm ${isActive ? 'border-brand-200 bg-gradient-to-br from-brand-50 via-white to-brand-50/60 shadow-brand-100/70 ring-1 ring-brand-100/70' : 'border-white bg-white/90 hover:-translate-y-0.5 hover:border-brand-100 hover:shadow-md hover:shadow-slate-200/60'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${isActive ? 'bg-brand-500' : 'bg-slate-300'}`}></span>
                        <p className="text-[11px] font-bold text-slate-500">{formatSessionRelative(session.started_at)}</p>
                      </div>
                      <p className="mt-2 text-sm font-black text-slate-800 line-clamp-1">{session.title || '새 대화'}</p>
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (window.confirm('이 대화를 삭제하시겠습니까? (삭제된 대화는 복구할 수 없습니다)')) {
                          const { error } = await supabase
                            .from('chat_sessions')
                            .update({ is_deleted_by_student: true })
                            .eq('id', session.id);

                          if (!error) {
                            setSessions((prev) => prev.filter((s) => s.id !== session.id));
                            if (currentSessionId === session.id) {
                              setCurrentSessionId(null);
                              setMessages([]);
                            }
                          } else {
                            alert('삭제 실패: ' + error.message);
                          }
                        }
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-red-500 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                      title="대화 삭제"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                  </div>
                );
              })}
              {sessions.length === 0 && <p className="text-sm text-slate-400 px-1">첫 대화를 시작해 보세요.</p>}
            </div>
          </div>
        </aside>

        {!showMobileChat && (
          <button
            type="button"
            onClick={() => setShowMobileChat(true)}
            className="flex-1 lg:hidden bg-transparent"
            aria-label="대화 화면으로 돌아가기"
          />
        )}

        {/* Chat Area */}
        <section className={`${showMobileChat ? 'block' : 'hidden'} lg:flex flex-1 flex flex-col min-h-0 bg-slate-50/50 relative overflow-hidden`}>
          <div className="px-4 md:px-8 pt-2.5 md:pt-4 pb-2 md:pb-3 bg-transparent shrink-0">
            <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 text-slate-500">
              <button
                onClick={() => setShowMobileChat(false)}
                aria-label="대화 목록 열기"
                className="flex lg:hidden h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
              </button>

              <div className="hidden lg:flex items-center gap-2 min-w-0 rounded-full border border-white/80 bg-white/80 px-3 py-1.5 shadow-sm backdrop-blur">
                {activeSession?.title && (
                  <p className="text-xs font-semibold text-slate-500 truncate">
                    {activeSession.title}
                  </p>
                )}
              </div>
            </div>
          </div>

          {chatMode === '공부' && pinnedStudyImage && (
            <div className="pointer-events-none absolute inset-x-4 top-[3.25rem] z-10 md:inset-x-8 md:top-[4.25rem]">
              <div className="mx-auto w-full max-w-3xl pointer-events-auto">
                <div className="relative rounded-[1.5rem] border border-brand-100 bg-white/96 p-2.5 shadow-lg shadow-slate-200/50 backdrop-blur-sm md:p-3">
                  <button
                    type="button"
                    onClick={() => setLockedStudyImage(null)}
                    aria-label="고정된 문제 사진 닫기"
                    className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/75 text-sm font-black text-white transition-colors hover:bg-slate-900"
                  >
                    ×
                  </button>
                  <div className="overflow-hidden rounded-[1.25rem] border border-slate-200 bg-slate-50">
                    <img
                      src={pinnedStudyImage}
                      alt="Pinned study problem"
                      className="h-44 md:h-56 w-full object-contain bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className={`flex-1 min-h-0 overflow-y-auto px-4 py-3 md:px-8 md:py-5 space-y-4 md:space-y-5 custom-scrollbar relative ${chatMode === '공부' && pinnedStudyImage ? 'pt-56 md:pt-72' : ''}`}>
            {errorNotice && <div className="mx-auto w-full max-w-3xl text-sm text-red-600 font-bold">{errorNotice}</div>}

            {isEmptyState ? (
              <div className="flex min-h-full items-center justify-center">
                <div className="mx-auto flex w-full max-w-3xl flex-col animate-in fade-in slide-in-from-bottom-4 duration-700">
                  <div className="rounded-[2rem] border border-white/80 bg-white/92 p-6 md:p-8 shadow-[0_20px_60px_rgba(37,99,235,0.08)] backdrop-blur-md">
                    <div className="flex flex-col items-center text-center gap-5 md:gap-6">
                      <span className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-3 py-1.5 text-[11px] font-black tracking-[0.18em] text-brand-700">
                        맞춤형 AI 멘토
                      </span>
                      <div className="flex h-36 w-36 items-center justify-center rounded-[2rem] bg-gradient-to-br from-slate-50 via-white to-brand-50 shadow-inner shadow-brand-100/60 ring-1 ring-brand-100/40 md:h-44 md:w-44">
                        <RandomAnimalIcon className="h-28 w-28 md:h-36 md:w-36 drop-shadow-md" />
                      </div>
                      <h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight text-balance">
                        {modeConfig.heroTitle}
                      </h2>
                      <p className="max-w-md text-sm md:text-base font-semibold leading-relaxed text-slate-400">
                        메시지를 입력하면 바로 대화를 시작할 수 있어요. 아래 예시처럼 편하게 시작해도 좋아요.
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        {quickPrompts.map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            onClick={() => {
                              setInput(prompt);
                              focusInput();
                            }}
                            className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="pb-24 md:pb-28 max-w-3xl mx-auto w-full">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-500`}>
                    <div
                      className={`max-w-[84%] md:max-w-[78%] p-[18px] md:p-6 rounded-[1.75rem] text-[15px] leading-relaxed shadow-sm font-medium tracking-tight whitespace-pre-wrap ${m.role === 'user'
                        ? 'bg-gradient-to-br from-brand-900 to-[#312e81] text-white rounded-tr-[0.5rem] shadow-brand-900/15'
                        : 'bg-white/95 text-slate-800 border border-white rounded-tl-[0.5rem] shadow-lg shadow-slate-200/60 ring-1 ring-slate-100/70'
                        }`}
                    >
                      {renderMessageContent(m.text)}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex items-center gap-2 px-4">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-brand-200 rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 bg-brand-300 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                      <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                    </div>
                    <span className="text-[11px] text-slate-400 font-black">{modeConfig.loadingText}</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div className="sticky bottom-0 left-0 right-0 px-4 md:px-8 pb-[calc(env(safe-area-inset-bottom,0px)+0.5px)] md:pb-[2.5px] lg:pb-[3.5px] pt-2 md:pt-3 bg-gradient-to-t from-[#F8FAFC] via-[#F8FAFC]/95 to-transparent">
            {imageThumbnail && (
              <div className="max-w-3xl mx-auto mb-2 flex w-full justify-start">
                <div className="relative inline-flex">
                  <img src={imageThumbnail} alt="Thumbnail preview" className="h-20 rounded-lg border border-slate-200 shadow-sm" />
                  <button onClick={() => setImageThumbnail(null)} className="absolute -top-2 -right-2 bg-slate-800 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px]">&times;</button>
                </div>
              </div>
            )}

            <div className="max-w-3xl mx-auto mb-2 md:mb-2.5 flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2 px-0">
                <div className="flex items-center gap-1 rounded-full border border-white/80 bg-white/90 p-1 shadow-md shadow-slate-200/40 shrink-0 backdrop-blur">
                {([
                  { value: '대화', label: '대화 모드' },
                  { value: '공부', label: '학습 모드' },
                ] as const).map((modeOption) => {
                  const isActive = chatMode === modeOption.value;
                  return (
                    <button
                      key={modeOption.value}
                      type="button"
                      onClick={() => setChatMode(modeOption.value)}
                      className={`rounded-full px-3 md:px-4 py-1.5 text-[11px] md:text-xs font-bold tracking-tight transition-colors whitespace-nowrap ${
                        isActive
                          ? 'bg-brand-900 text-white shadow-sm'
                          : 'text-slate-500 hover:bg-slate-100'
                      }`}
                      aria-pressed={isActive}
                    >
                      {modeOption.label}
                    </button>
                  );
                })}
                </div>
              </div>
            </div>

            <div className="max-w-3xl mx-auto flex items-center gap-2">
              <div className="flex-1 flex flex-row items-center gap-2 md:gap-3 bg-white/92 backdrop-blur-2xl p-2.5 md:p-3 pl-3 md:pl-4 pr-2.5 rounded-[2rem] md:rounded-[3.5rem] border border-white shadow-[0_20px_45px_rgba(148,163,184,0.22)] ring-1 ring-slate-200/60 transition-all focus-within:-translate-y-0.5 focus-within:ring-brand-500/30">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800"
                  aria-label={chatMode === '공부' ? '문제 사진 올리기' : '이미지 첨부'}
                  title={chatMode === '공부' ? '문제 사진 올리기' : '이미지 첨부'}
                >
                  <ImageIcon className="w-4 h-4 md:w-[1.125rem] md:h-[1.125rem]" />
                </button>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={(e) => {
                    handleImageUpload(e);
                    setTimeout(() => {
                      focusInput();
                    }, 100);
                  }}
                />
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder={activePlaceholder}
                  disabled={isMicRecording}
                  className="flex-1 w-full bg-transparent border-none py-2.5 md:py-3 text-[15px] focus:outline-none font-bold text-slate-700 placeholder-slate-400 disabled:opacity-50"
                  autoComplete="off"
                />
                <button
                  onClick={toggleMicRecord}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-all shadow-sm ${isMicRecording ? 'bg-rose-100 border-rose-200 text-rose-600 animate-pulse' : 'bg-slate-50 border-slate-200 text-slate-700 hover:-translate-y-0.5 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800'}`}
                  aria-label={isMicRecording ? '음성 입력 정지' : '음성 입력 시작'}
                  title={isMicRecording ? '음성 입력 정지' : '음성 입력 시작'}
                >
                  {isMicRecording ? <StopIcon className="w-4 h-4 md:w-[1.125rem] md:h-[1.125rem] text-rose-500" /> : <VoiceIcon className="w-4 h-4 md:w-[1.125rem] md:h-[1.125rem] text-slate-600" />}
                </button>
                <button
                  id="chat-send-button"
                  onClick={() => handleSend()}
                  disabled={loading || (!input.trim() && !imageThumbnail) || isMicRecording}
                  className="w-11 h-11 md:w-12 md:h-12 shrink-0 rounded-full flex items-center justify-center bg-gradient-to-br from-brand-900 to-[#4338ca] text-white hover:-translate-y-0.5 active:scale-95 transition-all shadow-lg shadow-brand-900/25 disabled:bg-slate-300 disabled:shadow-none"
                >
                  <svg className="w-5 h-5 md:w-6 md:h-6 rotate-90" fill="currentColor" viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path></svg>
                </button>
              </div>
            </div>

            <div className="max-w-3xl mx-auto mt-2 md:mt-2.5 text-center px-2 pb-2 md:pb-5">
              <p className="text-[10px] md:text-[11px] text-slate-400 font-medium tracking-tight">
                포틴AI 인물 등에 관한 정보 제공 시 실수를 할 수 있습니다.{` `}
                <button
                  type="button"
                  onClick={() => setIsPrivacyModalOpen(true)}
                  className="underline hover:text-slate-500 transition-colors"
                >
                  개인 정보 보호
                </button>{' '}
                및{' '}
                <button
                  type="button"
                  onClick={() => setIsPrivacyModalOpen(true)}
                  className="underline hover:text-slate-500 transition-colors"
                >
                  포틴AI
                </button>
              </p>
            </div>
          </div>
        </section>
      </div>

      <PrivacyPolicyModal
        isOpen={isPrivacyModalOpen}
        onClose={() => setIsPrivacyModalOpen(false)}
      />
    </div>
  );
};

export default StudentChat;

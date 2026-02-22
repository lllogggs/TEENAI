import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User, ChatMessage, ChatSession, SessionRiskLevel, StudentSettings } from '../types';
import { supabase } from '../utils/supabase';
import { normalizeRiskLevel } from '../utils/common';
import { DANGER_KEYWORDS } from '../constants';
import PrivacyPolicyModal from './PrivacyPolicyModal';
import { ForteenLogo, SparklesIcon, TextIcon, ImageIcon, VoiceIcon, StopIcon } from './Icons';

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

const StudentChat: React.FC<StudentChatProps> = ({ user, onLogout }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [input, setInput] = useState('');
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
  const [isMicRecording, setIsMicRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const isIntentionalStopRef = useRef<boolean>(true);

  const CHAT_PLACEHOLDERS = [
    "요즘 가장 고민되는 게 뭐야? 편하게 말해줘.",
    "오늘 하루 중 제일 재밌었던 일은?",
    "궁금한 거나 물어보고 싶은 거 다 얘기해 봐!",
    "지금 기분이 어때? 무슨 생각이 들어?",
    "숙제나 공부하다 막히는 부분이 있으면 도와줄게."
  ];
  const [randomPlaceholder] = useState(() => CHAT_PLACEHOLDERS[Math.floor(Math.random() * CHAT_PLACEHOLDERS.length)]);

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
      return;
    }

    setMessages((data || []).map((item) => ({
      role: item.role,
      text: item.content,
      timestamp: new Date(item.created_at).getTime(),
    })));
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
      const response = await fetch('/api/session-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
    setShowMobileChat(true);
  };

  const renderMessageContent = (text: string) => {
    const imgRegex = /\[IMAGE\](.*?)\[\/IMAGE\]/;
    const match = text.match(imgRegex);
    if (match) {
      const base64 = match[1];
      const pureText = text.replace(imgRegex, '').trim();
      return (
        <div className="flex flex-col gap-2">
          <img src={base64} alt="attached view" className="max-w-[150px] md:max-w-[200px] max-h-[300px] object-contain rounded-xl shadow-sm border border-black/5" />
          {pureText && <span>{pureText}</span>}
        </div>
      );
    }
    return text;
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC] flex-col overflow-hidden">
      <header className="px-4 md:px-10 py-3 md:py-6 bg-white/80 backdrop-blur-xl border-b border-slate-100 flex justify-between items-center sticky top-0 z-20">
        <div className="flex items-center gap-2 md:gap-5">
          <ForteenLogo className="w-10 h-10 md:w-14 md:h-14 shrink-0 shadow-lg shadow-brand-900/10 rounded-xl md:rounded-2xl" />
          <div>
            <h1 className="text-sm md:text-lg font-black text-brand-900 tracking-tight">Forteen AI 멘토</h1>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 md:w-2 md:h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <p className="text-[9px] md:text-[10px] text-emerald-600 font-black uppercase tracking-widest whitespace-nowrap">LIVE MENTORING</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <button onClick={onLogout} className="text-slate-400 hover:text-red-500 font-bold text-[10px] md:text-xs uppercase tracking-tighter transition-colors ml-1 md:ml-2">Logout</button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-row">
        {/* Sidebar */}
        <aside className={`${showMobileChat ? 'hidden' : 'block'} ${isSidebarOpen ? 'lg:w-[320px] border-r' : 'lg:w-0 border-r-0'} lg:block border-slate-100 bg-white/70 backdrop-blur-sm transition-all duration-300 overflow-hidden`}>
          <div className="h-full overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-3 w-[320px]">
            <button onClick={handleNewSession} className="w-full rounded-2xl border border-brand-100 bg-brand-50 py-3 text-sm font-black text-brand-900">+ 새 대화</button>
            {sessions.map((session) => {
              const isActive = session.id === currentSessionId;
              return (
                <div key={session.id} className="relative group">
                  <button
                    onClick={() => openSession(session.id)}
                    className={`w-full text-left rounded-2xl border p-3 transition-all pr-8 ${isActive ? 'border-brand-500 bg-brand-50' : 'border-slate-100 bg-white hover:border-brand-200'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-500">{formatSessionTime(session.started_at)}</p>
                      {/* Risk badge removed for student view */}
                    </div>
                    <p className="mt-2 text-sm font-bold text-slate-800 line-clamp-1">{session.title || '새 대화'}</p>
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (window.confirm('이 대화를 삭제하시겠습니까? (삭제된 대화는 복구할 수 없습니다)')) {
                        // Soft Delete
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
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="대화 삭제"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                  </button>
                </div>
              );
            })}
            {sessions.length === 0 && <p className="text-sm text-slate-400 px-1">첫 대화를 시작해 보세요.</p>}
          </div>
        </aside>

        {/* Chat Area */}
        <section className={`${showMobileChat ? 'block' : 'hidden'} lg:flex flex-1 flex flex-col min-h-0 bg-slate-50/50 relative overflow-hidden`}>
          <div className="px-5 md:px-10 py-3 border-b border-transparent bg-transparent flex items-center gap-3 relative z-30 shrink-0 pointer-events-none">

            {/* Absolute positioning container for buttons to stick top-left inside the content area */}
            <div className="absolute left-5 md:left-10 top-1/2 -translate-y-1/2 flex items-center gap-3 pointer-events-auto">
              {/* Mobile Sidebar Toggle (Back) */}
              <button onClick={() => setShowMobileChat(false)} className="flex lg:hidden w-9 h-9 items-center justify-center rounded-xl bg-white/90 backdrop-blur-md shadow-sm border border-slate-100 text-slate-500 hover:bg-slate-50 transition-colors shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
              </button>

              {/* PC Sidebar Toggle */}
              <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="hidden lg:flex w-9 h-9 items-center justify-center rounded-xl bg-white/90 backdrop-blur-md shadow-sm border border-slate-100 text-slate-500 hover:bg-slate-50 transition-colors shrink-0">
                {isSidebarOpen ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                )}
              </button>

              {/* PC New Chat Button */}
              <button onClick={handleNewSession} className="hidden lg:block text-brand-900 bg-brand-50 border border-brand-100 px-3 py-1.5 rounded-xl hover:bg-brand-100 font-bold text-[11px] tracking-tighter transition-colors whitespace-nowrap">
                + 새 대화
              </button>
            </div>

            {/* Desktop spacer - no title display */}
            <div className="flex-1 lg:pl-44 flex justify-center items-center">
            </div>

            <div className="w-[1px] h-4 bg-slate-200 lg:hidden mx-1"></div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-5 md:p-10 space-y-8 custom-scrollbar relative">
            {errorNotice && <div className="text-sm text-red-600 font-bold">{errorNotice}</div>}

            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center max-w-2xl mx-auto px-1 mt-2 md:mt-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="bg-white/80 backdrop-blur-md p-5 md:p-10 rounded-[2rem] md:rounded-[3rem] shadow-sm border border-slate-100/50 w-full text-center">
                  <div className="w-12 h-12 md:w-16 md:h-16 mb-4 md:mb-6 mx-auto bg-gradient-to-tr from-brand-100 to-brand-50 rounded-[1rem] flex items-center justify-center shadow-inner border border-white">
                    <SparklesIcon className="w-6 h-6 md:w-8 md:h-8 text-brand-600 drop-shadow-sm" />
                  </div>
                  <h2 className="text-xl md:text-2xl font-black text-slate-800 mb-2 tracking-tight text-balance">무엇이든 물어보세요</h2>
                  <p className="text-slate-500 font-bold mb-6 md:mb-8 text-xs md:text-sm leading-relaxed text-balance">
                    글, 사진, 음성 중 편한 방법으로 대화를 시작하세요.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-5 text-left text-slate-700">
                    <div className="bg-slate-50 rounded-xl md:rounded-2xl p-3 md:p-5 border border-slate-100/50 flex flex-row md:flex-col items-center md:items-center text-left md:text-center group hover:-translate-y-1 transition-transform gap-3 md:gap-0">
                      <div className="md:mb-3 block group-hover:scale-110 transition-transform bg-white md:bg-transparent p-2 md:p-0 rounded-lg shadow-sm md:shadow-none shrink-0 text-slate-700">
                        <TextIcon className="w-6 h-6 md:w-8 md:h-8" />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-800 text-[13px] md:text-sm mb-0.5 md:mb-1">텍스트 대화</h3>
                        <p className="text-[10px] md:text-xs text-slate-500 font-bold leading-relaxed line-clamp-1 md:line-clamp-none">하단 입력창에 궁금한 점을 적어서 보내주세요.</p>
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-xl md:rounded-2xl p-3 md:p-5 border border-slate-100/50 flex flex-row md:flex-col items-center md:items-center text-left md:text-center group hover:-translate-y-1 transition-transform gap-3 md:gap-0">
                      <div className="md:mb-3 block group-hover:scale-110 transition-transform bg-white md:bg-transparent p-2 md:p-0 rounded-lg shadow-sm md:shadow-none shrink-0 text-slate-700">
                        <ImageIcon className="w-6 h-6 md:w-8 md:h-8" />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-800 text-[13px] md:text-sm mb-0.5 md:mb-1">이미지 분석</h3>
                        <p className="text-[10px] md:text-xs text-slate-500 font-bold leading-relaxed line-clamp-1 md:line-clamp-none">배우고 싶은 문제를 사진으로 찍어 올리세요.</p>
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-xl md:rounded-2xl p-3 md:p-5 border border-slate-100/50 flex flex-row md:flex-col items-center md:items-center text-left md:text-center group hover:-translate-y-1 transition-transform gap-3 md:gap-0">
                      <div className="md:mb-3 block group-hover:scale-110 transition-transform bg-white md:bg-transparent p-2 md:p-0 rounded-lg shadow-sm md:shadow-none shrink-0 text-slate-700">
                        <VoiceIcon className="w-6 h-6 md:w-8 md:h-8" />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-800 text-[13px] md:text-sm mb-0.5 md:mb-1">음성 입력</h3>
                        <p className="text-[10px] md:text-xs text-slate-500 font-bold leading-relaxed line-clamp-1 md:line-clamp-none">마이크 버튼을 눌러 편하게 말로 질문하세요.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="pb-40 max-w-4xl mx-auto w-full">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-500`}>
                    <div
                      className={`max-w-[82%] md:max-w-[75%] p-5 md:p-7 rounded-[2rem] text-[15px] leading-relaxed shadow-sm font-medium tracking-tight whitespace-pre-wrap ${m.role === 'user'
                        ? 'bg-brand-900 text-white rounded-tr-none'
                        : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none shadow-md shadow-slate-200/50'
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
                    <span className="text-[11px] text-slate-400 font-black">답변 생성 중...</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div className="sticky bottom-0 left-0 right-0 px-5 md:px-10 pb-[env(safe-area-inset-bottom,3rem)] md:pb-8 lg:pb-10 pt-3 bg-gradient-to-t from-[#F8FAFC] via-[#F8FAFC]/95 to-transparent">
            {imageThumbnail && (
              <div className="max-w-4xl mx-auto mb-2 relative inline-block">
                <img src={imageThumbnail} alt="Thumbnail preview" className="h-20 rounded-lg border border-slate-200 shadow-sm" />
                <button onClick={() => setImageThumbnail(null)} className="absolute -top-2 -right-2 bg-slate-800 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px]">&times;</button>
              </div>
            )}

            {/* Visual Action Bar (Camera, Voice Modes) */}
            <div className="max-w-4xl mx-auto flex items-center justify-between mb-2 md:mb-3 px-1 md:px-2 gap-2 overflow-x-auto no-scrollbar">
              <div className="flex gap-1.5 md:gap-2 shrink-0">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-full border border-slate-200 bg-white text-slate-700 font-bold text-[11px] md:text-xs tracking-tight hover:bg-slate-100 transition-colors shadow-sm whitespace-nowrap"
                >
                  <ImageIcon className="w-4 h-4 md:w-[1.125rem] md:h-[1.125rem] text-slate-600" /> <span className="pt-[1px]">이미지 첨부</span>
                </button>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                />
              </div>

              <div className="flex gap-1.5 md:gap-2 shrink-0">
                <button
                  onClick={toggleMicRecord}
                  className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-full border transition-colors shadow-sm font-bold text-[11px] md:text-xs tracking-tight whitespace-nowrap ${isMicRecording ? 'bg-rose-100 border-rose-200 text-rose-600 animate-pulse' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'}`}
                >
                  {isMicRecording ? <StopIcon className="w-4 h-4 md:w-[1.125rem] md:h-[1.125rem] text-rose-500" /> : <VoiceIcon className="w-4 h-4 md:w-[1.125rem] md:h-[1.125rem] text-slate-600" />}
                  <span className="pt-[1px]">{isMicRecording ? '정지' : '음성 입력'}</span>
                </button>
              </div>
            </div>

            <div className="max-w-4xl mx-auto flex items-center gap-2">
              <div className="flex-1 flex flex-row items-center gap-3 bg-white/90 backdrop-blur-2xl p-2 md:p-3 pl-5 md:pl-7 rounded-[3.5rem] border border-white shadow-xl shadow-slate-300/40 ring-1 ring-slate-200/50 transition-all focus-within:ring-brand-500/30">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder={isMicRecording ? "음성을 듣고 있어요... 말씀하시면 텍스트로 입력됩니다" : randomPlaceholder}
                  disabled={isMicRecording}
                  className="flex-1 w-full bg-transparent border-none py-2 md:py-3 text-[15px] focus:outline-none font-bold text-slate-700 placeholder-slate-400 disabled:opacity-50"
                  autoComplete="off"
                />
                <button
                  id="chat-send-button"
                  onClick={() => handleSend()}
                  disabled={loading || (!input.trim() && !imageThumbnail) || isMicRecording}
                  className="w-11 h-11 md:w-12 md:h-12 shrink-0 rounded-full flex items-center justify-center bg-brand-900 text-white hover:bg-black hover:-translate-y-0.5 active:scale-95 transition-all shadow-lg shadow-brand-900/20 disabled:bg-slate-300 disabled:shadow-none"
                >
                  <svg className="w-5 h-5 md:w-6 md:h-6 rotate-90" fill="currentColor" viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path></svg>
                </button>
              </div>
            </div>

            <div className="max-w-4xl mx-auto mt-2 md:mt-3 text-center px-4">
              <p className="text-[10px] md:text-[11px] text-slate-400 font-medium tracking-tight">
                Forteen AI는 인물 등에 관한 정보 제공 시 실수를 할 수 있습니다.{' '}
                <button
                  onClick={() => setIsPrivacyModalOpen(true)}
                  className="underline hover:text-slate-500 transition-colors"
                >
                  개인 정보 보호 및 Forteen AI
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
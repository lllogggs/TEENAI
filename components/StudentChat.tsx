import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User, ChatMessage, ChatSession, SessionRiskLevel, StudentSettings } from '../types';
import { supabase } from '../utils/supabase';
import { normalizeRiskLevel } from '../utils/common';
import { DANGER_KEYWORDS } from '../constants';

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
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Desktop sidebar toggle
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const settingsCacheRef = useRef<NormalizedSettings | null>(null);

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

    const firstId = forceSessionId || nextSessions[0]?.id || null;
    if (!currentSessionId && firstId) {
      setCurrentSessionId(firstId);
      if (window.innerWidth < 1024) {
        setShowMobileChat(false);
      }
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

  useEffect(() => {
    if (!currentSessionId) {
      setMessages([]);
      return;
    }
    fetchMessages(currentSessionId);
  }, [currentSessionId]);

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
    setMessages([]);
    setShowMobileChat(true);
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

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    setErrorNotice('');
    const userText = input.trim();
    const userMsg: ChatMessage = { role: 'user', text: userText, timestamp: Date.now() };
    const nextHistory = messages.map((m) => ({ role: m.role, content: m.text }));

    setInput('');
    setLoading(true);
    setMessages((prev) => [...prev, userMsg]);

    const sessionId = await ensureSession();
    if (!sessionId) {
      setLoading(false);
      return;
    }

    await persistMessage(sessionId, 'user', userText);
    await updateSessionMetaWithAI(sessionId, userText, [...nextHistory, { role: 'user', content: userText }]);

    const isDanger = DANGER_KEYWORDS.some((keyword) => userText.includes(keyword));
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
    setShowMobileChat(true);
    setErrorNotice('');
  };

  const handleNewSession = async () => {
    setErrorNotice('');
    settingsCacheRef.current = null;
    await createSession();
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC] flex-col overflow-hidden">
      <header className="px-5 md:px-10 py-5 md:py-7 bg-white/80 backdrop-blur-xl border-b border-slate-100 flex justify-between items-center sticky top-0 z-20">
        <div className="flex items-center gap-3 md:gap-5">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="hidden lg:flex w-10 h-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">
            {isSidebarOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
            )}
          </button>
          <div className="w-11 h-11 md:w-14 md:h-14 bg-brand-900 rounded-[1.25rem] flex items-center justify-center text-xl md:text-2xl shadow-lg shadow-brand-900/20">💜</div>
          <div>
            <h1 className="text-base md:text-lg font-black text-brand-900 tracking-tight">TEENAI 멘토</h1>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <p className="text-[10px] text-emerald-600 font-black uppercase tracking-widest">LIVE MENTORING</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleNewSession} className="text-slate-500 hover:text-brand-900 font-bold text-xs uppercase tracking-tighter transition-colors">새 대화</button>
          <button onClick={onLogout} className="text-slate-400 hover:text-red-500 font-bold text-xs uppercase tracking-tighter transition-colors">Logout</button>
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
        <section className={`${showMobileChat ? 'block' : 'hidden'} lg:flex flex-1 flex flex-col min-h-0 bg-slate-50/50`}>
          <div className="px-5 md:px-10 py-3 border-b border-slate-100 bg-white/60 flex items-center gap-3">
            <button onClick={() => setShowMobileChat(false)} className="lg:hidden text-xs font-black text-brand-900">← 뒤로</button>
            <p className="text-xs text-slate-500 truncate">{activeSession?.title || '대화를 선택하거나 새로 시작해 주세요.'}</p>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-5 md:p-10 space-y-8 custom-scrollbar relative">
            {errorNotice && <div className="text-sm text-red-600 font-bold">{errorNotice}</div>}

            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full opacity-20 absolute inset-0">
                <div className="text-6xl mb-6">💬</div>
                <p className="text-sm font-black text-brand-900">당신의 이야기를 들려주세요.</p>
              </div>
            ) : (
              <div className="pb-40">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-500`}>
                    <div
                      className={`max-w-[82%] md:max-w-[75%] p-5 md:p-7 rounded-[2rem] text-[15px] leading-relaxed shadow-sm font-medium tracking-tight whitespace-pre-wrap ${m.role === 'user'
                        ? 'bg-brand-900 text-white rounded-tr-none'
                        : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none shadow-md shadow-slate-200/50'
                        }`}
                    >
                      {m.text}
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

          <div className="sticky bottom-0 left-0 right-0 px-5 md:px-10 pb-5 md:pb-8 lg:pb-10 pt-3 bg-gradient-to-t from-[#F8FAFC] via-[#F8FAFC]/95 to-transparent">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center gap-4 bg-white/90 backdrop-blur-2xl p-3 pl-6 md:pl-8 rounded-[3.5rem] border border-white shadow-2xl shadow-slate-300/50 ring-1 ring-slate-200/50 transition-all focus-within:ring-brand-500/30">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="궁금한걸 말해주세요..."
                  className="flex-1 bg-transparent border-none py-3 md:py-4 text-base focus:outline-none font-bold text-slate-700 placeholder-slate-400"
                />
                <button
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  className="w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center bg-brand-900 text-white hover:bg-black hover:-translate-y-1 active:scale-95 transition-all shadow-xl shadow-brand-900/20 disabled:bg-slate-300 disabled:shadow-none"
                >
                  <svg className="w-6 h-6 rotate-90" fill="currentColor" viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path></svg>
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default StudentChat;
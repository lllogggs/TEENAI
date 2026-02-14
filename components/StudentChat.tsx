import React, { useState, useEffect, useRef } from 'react';
import { User, ChatMessage, StudentSettings } from '../types';
import { supabase } from '../utils/supabase';
import { DANGER_KEYWORDS } from '../constants';

interface StudentChatProps {
  user: User;
  onLogout: () => void;
}

type MentorStyle = 'kind' | 'rational' | 'friendly';

interface NormalizedSettings {
  guardrails: {
    block_harmful: boolean;
    self_directed: boolean;
    anti_overuse: boolean;
    language_filter: boolean;
  };
  mentor_style: MentorStyle;
  parent_instructions: string[];
  ai_style_prompt: string;
}

const DEFAULT_SETTINGS: NormalizedSettings = {
  guardrails: {
    block_harmful: true,
    self_directed: true,
    anti_overuse: true,
    language_filter: true,
  },
  mentor_style: 'kind',
  parent_instructions: [],
  ai_style_prompt: '',
};

const normalizeSettings = (settings?: StudentSettings | null): NormalizedSettings => {
  const guardrails = (settings?.guardrails as Record<string, unknown> | undefined) || {};
  const mentorStyle = settings?.mentor_style;
  return {
    guardrails: {
      block_harmful: typeof guardrails.block_harmful === 'boolean' ? guardrails.block_harmful : DEFAULT_SETTINGS.guardrails.block_harmful,
      self_directed: typeof guardrails.self_directed === 'boolean' ? guardrails.self_directed : DEFAULT_SETTINGS.guardrails.self_directed,
      anti_overuse: typeof guardrails.anti_overuse === 'boolean' ? guardrails.anti_overuse : DEFAULT_SETTINGS.guardrails.anti_overuse,
      language_filter: typeof guardrails.language_filter === 'boolean' ? guardrails.language_filter : DEFAULT_SETTINGS.guardrails.language_filter,
    },
    mentor_style: mentorStyle === 'kind' || mentorStyle === 'rational' || mentorStyle === 'friendly' ? mentorStyle : DEFAULT_SETTINGS.mentor_style,
    parent_instructions: Array.isArray(settings?.parent_instructions)
      ? settings.parent_instructions.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [],
    ai_style_prompt: typeof settings?.ai_style_prompt === 'string' ? settings.ai_style_prompt : '',
  };
};

const buildSystemPromptFromSettings = (settings: NormalizedSettings) => {
  const guardrailLines: string[] = [];
  if (settings.guardrails.block_harmful) {
    guardrailLines.push('- 성별/폭력/유해 대화 요청은 안전하게 거절하고 보호자/전문가 도움을 안내하세요.');
  }
  if (settings.guardrails.self_directed) {
    guardrailLines.push('- 문제의 정답을 바로 주기보다 학생이 스스로 생각하도록 질문 중심으로 유도하세요.');
  }
  if (settings.guardrails.anti_overuse) {
    guardrailLines.push('- 대화가 길어지면 정중하게 휴식을 제안하고 현실 활동을 권장하세요.');
  }
  if (settings.guardrails.language_filter) {
    guardrailLines.push('- 공격적이거나 거친 표현에는 차분하고 바른 표현으로 다시 말하도록 도와주세요.');
  }

  const mentorStyleInstructionMap: Record<MentorStyle, string> = {
    kind: 'warm, supportive, gentle tone',
    rational: 'calm, structured, logic-first',
    friendly: 'casual, approachable, emoji-light',
  };

  const instructionBlocks = [
    '[Parent Guardrails]',
    guardrailLines.length ? guardrailLines.join('\n') : '- 별도 가드레일 없음',
    '',
    '[Mentor Style]',
    `- ${mentorStyleInstructionMap[settings.mentor_style]}`,
    '',
    '[Parent Instructions]',
    settings.parent_instructions.length
      ? settings.parent_instructions.map((instruction, index) => `${index + 1}. ${instruction}`).join('\n')
      : '- 없음',
    '',
    '[AI Style Prompt Override]',
    settings.ai_style_prompt || '- 없음',
  ];

  return instructionBlocks.join('\n');
};

const StudentChat: React.FC<StudentChatProps> = ({ user, onLogout }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const settingsCacheRef = useRef<NormalizedSettings | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const ensureSession = async (): Promise<string | null> => {
    if (currentSessionId) return currentSessionId;

    const { data, error } = await supabase
      .from('chat_sessions')
      .insert({
        student_id: user.id,
        tone_level: 'low',
      })
      .select('id')
      .single();

    if (error) {
      console.error('chat_sessions insert error:', error);
      setErrorNotice('대화 세션 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      return null;
    }

    setCurrentSessionId(data.id);
    return data.id;
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

  const handleNewSession = () => {
    setMessages([]);
    setCurrentSessionId(null);
    setErrorNotice('');
    settingsCacheRef.current = null;
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC] flex-col overflow-hidden">
      <header className="px-10 py-7 bg-white/80 backdrop-blur-xl border-b border-slate-100 flex justify-between items-center sticky top-0 z-20">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 bg-brand-900 rounded-[1.25rem] flex items-center justify-center text-2xl shadow-lg shadow-brand-900/20">💜</div>
          <div>
            <h1 className="text-lg font-black text-brand-900 tracking-tight">TEENAI 멘토</h1>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <p className="text-[10px] text-emerald-600 font-black uppercase tracking-widest">LIVE MENTORING</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleNewSession} className="text-slate-500 hover:text-brand-900 font-bold text-xs uppercase tracking-tighter transition-colors">New Chat</button>
          <button onClick={onLogout} className="text-slate-400 hover:text-red-500 font-bold text-xs uppercase tracking-tighter transition-colors">Logout</button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-10 space-y-10 bg-slate-50/50 custom-scrollbar pb-40">
        {errorNotice && <div className="text-sm text-red-600 font-bold">{errorNotice}</div>}

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full opacity-20">
            <div className="text-6xl mb-6">💬</div>
            <p className="text-sm font-black text-brand-900">당신의 이야기를 들려주세요.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-500`}>
            <div
              className={`max-w-[75%] p-7 rounded-[2.25rem] text-[15px] leading-relaxed shadow-sm font-medium tracking-tight ${
                m.role === 'user'
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

      <div className="fixed bottom-10 left-0 right-0 px-10 pointer-events-none">
        <div className="max-w-4xl mx-auto pointer-events-auto">
          <div className="flex items-center gap-4 bg-white/90 backdrop-blur-2xl p-3 pl-8 rounded-[3.5rem] border border-white shadow-2xl shadow-slate-300/50 ring-1 ring-slate-200/50 transition-all focus-within:ring-brand-500/30">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="멘토에게 고민을 털어놓아 보세요..."
              className="flex-1 bg-transparent border-none py-4 text-base focus:outline-none font-bold text-slate-700 placeholder-slate-400"
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="w-14 h-14 rounded-full flex items-center justify-center bg-brand-900 text-white hover:bg-black hover:-translate-y-1 active:scale-95 transition-all shadow-xl shadow-brand-900/20 disabled:bg-slate-300 disabled:shadow-none"
            >
              <svg className="w-6 h-6 rotate-90" fill="currentColor" viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentChat;

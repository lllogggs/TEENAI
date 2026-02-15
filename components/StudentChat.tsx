import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, ChatMessage, StudentSettings, ChatSession } from '../types';
import { supabase } from '../utils/supabase';
import { DANGER_KEYWORDS } from '../constants';

interface StudentChatProps {
  user: User;
  onLogout: () => void;
}

type MentorTone = 'warm' | 'rational' | 'friendly';

interface NormalizedSettings {
  guardrails: {
    block_inappropriate: boolean;
    self_directed: boolean;
    anti_overuse: boolean;
    language_filter: boolean;
  };
  mentor_tone: MentorTone;
  ai_style_prompt: string;
}

const DEFAULT_SETTINGS: NormalizedSettings = {
  guardrails: {
    block_inappropriate: true,
    self_directed: true,
    anti_overuse: true,
    language_filter: true,
  },
  mentor_tone: 'warm',
  ai_style_prompt: '',
};

const normalizeSettings = (settings?: StudentSettings | null): NormalizedSettings => {
  const guardrails = (settings?.guardrails as Record<string, unknown> | undefined) || {};
  const mentorTone = settings?.mentor_tone || settings?.mentor_style;
  return {
    guardrails: {
      block_inappropriate: typeof guardrails.block_inappropriate === 'boolean'
        ? guardrails.block_inappropriate
        : typeof guardrails.block_harmful === 'boolean'
          ? guardrails.block_harmful
          : DEFAULT_SETTINGS.guardrails.block_inappropriate,
      self_directed: typeof guardrails.self_directed === 'boolean' ? guardrails.self_directed : DEFAULT_SETTINGS.guardrails.self_directed,
      anti_overuse: typeof guardrails.anti_overuse === 'boolean' ? guardrails.anti_overuse : DEFAULT_SETTINGS.guardrails.anti_overuse,
      language_filter: typeof guardrails.language_filter === 'boolean' ? guardrails.language_filter : DEFAULT_SETTINGS.guardrails.language_filter,
    },
    mentor_tone: mentorTone === 'rational' || mentorTone === 'friendly' ? mentorTone : 'warm',
    ai_style_prompt: typeof settings?.ai_style_prompt === 'string' ? settings.ai_style_prompt : '',
  };
};

const sessionTitle = (messages: ChatMessage[]) => {
  const firstUser = messages.find((m) => m.role === 'user')?.text || '새 대화';
  return firstUser.slice(0, 22);
};

const StudentChat: React.FC<StudentChatProps> = ({ user, onLogout }) => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === currentSessionId) || null,
    [sessions, currentSessionId]
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadSessions = async () => {
    const { data } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('student_id', user.id)
      .order('last_message_at', { ascending: false });
    const rows = (data || []) as ChatSession[];
    setSessions(rows);
    if (!currentSessionId && rows[0]) setCurrentSessionId(rows[0].id);
  };

  const loadMessages = async (sessionId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    setMessages((data || []).map((row: any) => ({
      id: row.id,
      role: row.role,
      text: row.content,
      timestamp: new Date(row.created_at).getTime(),
    })));
  };

  useEffect(() => { loadSessions(); }, []);
  useEffect(() => { if (currentSessionId) loadMessages(currentSessionId); }, [currentSessionId]);

  const ensureSession = async () => {
    if (currentSessionId) return currentSessionId;
    const { data, error } = await supabase.from('chat_sessions').insert({ student_id: user.id, tone_level: 'low' }).select('id').single();
    if (error || !data) {
      setErrorNotice('대화 세션 생성에 실패했습니다.');
      return null;
    }
    setCurrentSessionId(data.id);
    await loadSessions();
    return data.id as string;
  };

  const loadStudentSettings = async () => {
    const { data } = await supabase.from('student_profiles').select('settings').eq('user_id', user.id).single();
    return normalizeSettings(data?.settings as StudentSettings);
  };

  const buildParentStylePrompt = (settings: NormalizedSettings) => {
    const toneMap: Record<MentorTone, string> = {
      warm: '다정한 멘토 톤으로 공감하고 안정감을 주는 어조를 유지하세요.',
      rational: '이성적인 멘토 톤으로 간결하고 논리적으로 설명하세요.',
      friendly: '친근한 멘토 톤으로 부담 없이 말하되 가벼운 채팅체는 피하세요.',
    };

    const guardrailLines = [
      settings.guardrails.block_inappropriate ? '- 성범죄/부적절/위험 대화는 즉시 중단하고 안전한 도움을 권하세요.' : '',
      settings.guardrails.self_directed ? '- 학습 질문에서는 정답만 주지 말고 스스로 생각할 단서를 주세요.' : '',
      settings.guardrails.anti_overuse ? '- 대화가 길어지면 휴식과 오프라인 활동을 짧게 제안하세요.' : '',
      settings.guardrails.language_filter ? '- 비속어/공격적 표현은 바른 표현으로 완곡히 교정하세요.' : '',
    ].filter(Boolean);

    return [
      '[Mentor Tone]',
      toneMap[settings.mentor_tone],
      '',
      '[Guardrails]',
      ...(guardrailLines.length ? guardrailLines : ['- 기본 가드레일만 유지']),
      '',
      '[Additional parent instruction:]',
      settings.ai_style_prompt || '- 없음',
    ].join('\n');
  };

  const persistMessage = async (sessionId: string, role: 'user' | 'model', content: string) => {
    await supabase.from('messages').insert({ session_id: sessionId, student_id: user.id, role, content });
  };

  const summarizeSession = async (sessionId: string) => {
    const { data: auth } = await supabase.auth.getSession();
    const token = auth.session?.access_token;
    await fetch('/api/summarize-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ session_id: sessionId }),
    });
    await loadSessions();
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    setErrorNotice('');
    const userText = input.trim();
    const userMsg: ChatMessage = { role: 'user', text: userText, timestamp: Date.now() };
    const nextHistory = [...messages, userMsg].map((m) => ({ role: m.role, content: m.text }));

    setInput('');
    setLoading(true);
    setMessages((prev) => [...prev, userMsg]);

    const sessionId = await ensureSession();
    if (!sessionId) return;

    await persistMessage(sessionId, 'user', userText);

    if (DANGER_KEYWORDS.some((keyword) => userText.includes(keyword))) {
      await supabase.from('safety_alerts').insert({ student_id: user.id, message: '위험 키워드가 포함된 대화가 감지되었습니다.' });
    }

    try {
      const settings = await loadStudentSettings();
      const parentStylePrompt = buildParentStylePrompt(settings);
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newMessage: userText, history: nextHistory, parentStylePrompt }),
      });

      const data = await response.json();
      const aiText = data.text || '잠시 대화가 어려워요. 다시 시도해볼까요?';
      setMessages((prev) => [...prev, { role: 'model', text: aiText, timestamp: Date.now() }]);
      await persistMessage(sessionId, 'model', aiText);
      await summarizeSession(sessionId);
      await loadMessages(sessionId);
    } catch (error) {
      console.error(error);
      setErrorNotice('AI 응답 생성 중 문제가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const createNewChat = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setIsDrawerOpen(false);
  };

  return (
    <div className="h-screen flex bg-slate-100">
      <aside className={`fixed md:static z-30 top-0 left-0 h-full w-80 bg-white border-r border-slate-200 p-4 transform transition-transform ${isDrawerOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <button onClick={createNewChat} className="w-full mb-4 py-2 rounded-lg bg-brand-900 text-white font-bold">+ New chat</button>
        <div className="space-y-2 overflow-y-auto h-[calc(100%-52px)]">
          {sessions.map((session) => (
            <button key={session.id} onClick={() => { setCurrentSessionId(session.id); setIsDrawerOpen(false); }} className={`w-full text-left p-3 rounded-xl border ${session.id === currentSessionId ? 'bg-brand-50 border-brand-300' : 'bg-white border-slate-200'}`}>
              <p className="font-bold text-sm truncate">{session.summary || session.session_summary || '새 대화'}</p>
              <p className="text-xs text-slate-500">{new Date(session.last_message_at || session.started_at).toLocaleString()}</p>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 px-4 md:px-6 bg-white border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button className="md:hidden text-xl" onClick={() => setIsDrawerOpen((v) => !v)}>☰</button>
            <h1 className="font-black">{activeSession ? sessionTitle(messages) : '새 대화'}</h1>
          </div>
          <button onClick={onLogout} className="text-sm text-slate-500">Logout</button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          {errorNotice && <p className="text-red-600 text-sm">{errorNotice}</p>}
          {messages.map((m, i) => (
            <div key={`${m.timestamp}-${i}`} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-2xl rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-brand-900 text-white' : 'bg-white border border-slate-200 text-slate-800'}`}>
                {m.text}
              </div>
            </div>
          ))}
          {loading && <p className="text-xs text-slate-400">답변 생성 중...</p>}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-slate-200 bg-white">
          <div className="max-w-4xl mx-auto flex gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} className="flex-1 border border-slate-300 rounded-xl px-4 py-3" placeholder="메시지를 입력하세요" />
            <button onClick={handleSend} disabled={loading || !input.trim()} className="px-5 rounded-xl bg-brand-900 text-white disabled:bg-slate-300">전송</button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default StudentChat;

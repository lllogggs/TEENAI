import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage, ChatSession, StudentSettings, User } from '../types';
import { supabase } from '../utils/supabase';
import { DANGER_KEYWORDS } from '../constants';
import { normalizeRiskLevel } from '../utils/common';
import PrivacyPolicyModal from './PrivacyPolicyModal';
import { ForteenLogo, VoiceIcon, StopIcon } from './Icons';

interface StudentChatProps {
  user: User;
  onLogout: () => void;
  onDeleteAccount: () => Promise<void>;
}

type MentorTone = 'kind' | 'rational' | 'friendly';
interface NormalizedSettings {
  guardrails: { sexual_block: boolean; self_directed_mode: boolean; overuse_prevent: boolean; clean_language: boolean };
  mentor_tone: MentorTone;
  parent_instructions: string[];
  ai_style_prompt: string;
}

const DEFAULT_SETTINGS: NormalizedSettings = {
  guardrails: { sexual_block: true, self_directed_mode: true, overuse_prevent: true, clean_language: true },
  mentor_tone: 'kind',
  parent_instructions: [],
  ai_style_prompt: '',
};

const normalizeSettings = (settings?: StudentSettings | null): NormalizedSettings => ({
  guardrails: {
    sexual_block: (settings?.guardrails?.sexual_block as boolean) ?? true,
    self_directed_mode: (settings?.guardrails?.self_directed_mode as boolean) ?? true,
    overuse_prevent: (settings?.guardrails?.overuse_prevent as boolean) ?? true,
    clean_language: (settings?.guardrails?.clean_language as boolean) ?? true,
  },
  mentor_tone: (settings?.mentor_tone || 'kind') as MentorTone,
  parent_instructions: Array.isArray(settings?.parent_instructions) ? settings.parent_instructions.filter(Boolean) as string[] : [],
  ai_style_prompt: typeof settings?.ai_style_prompt === 'string' ? settings.ai_style_prompt : '',
});

const StudentChat: React.FC<StudentChatProps> = ({ user, onLogout, onDeleteAccount }) => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorNotice, setErrorNotice] = useState('');
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [isParentalGateOpen, setIsParentalGateOpen] = useState(false);
  const [gateQuestion, setGateQuestion] = useState({ a: 7, b: 6 });
  const [gateAnswer, setGateAnswer] = useState('');
  const [reportingMessageId, setReportingMessageId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('부적절한 내용');
  const [isMicRecording, setIsMicRecording] = useState(false);
  const speechRecognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const settingsCacheRef = useRef<NormalizedSettings | null>(null);

  const buildSystemPromptFromSettings = (settings: NormalizedSettings) => [
    '[Parent Guardrails]', settings.guardrails.sexual_block ? '- 위험 대화 차단' : '- 기본',
    '[Mentor Tone]', `- ${settings.mentor_tone}`,
    '[Parent Instructions]', settings.parent_instructions.join('\n') || '- 없음',
    '[AI Style Prompt Override]', settings.ai_style_prompt || '- 없음',
  ].join('\n');

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => { setIsOffline(true); setErrorNotice('네트워크 연결이 불안정합니다. 연결을 확인해 주세요.'); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  useEffect(() => {
    const onNativeMessage = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data || '{}');
        if (payload?.type === 'NATIVE_SPEECH_RESULT' && typeof payload.text === 'string') {
          setInput((prev) => `${prev}${prev ? ' ' : ''}${payload.text}`);
        }
      } catch { }
    };
    window.addEventListener('message', onNativeMessage);
    return () => window.removeEventListener('message', onNativeMessage);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchSessions = async () => {
    const { data, error } = await supabase.from('chat_sessions').select('*').eq('student_id', user.id).eq('is_deleted_by_student', false).order('started_at', { ascending: false });
    if (error) return setErrorNotice('네트워크 연결이 불안정합니다. 연결을 확인해 주세요.');
    setSessions((data || []) as ChatSession[]);
  };

  const fetchMessages = async (sessionId: string) => {
    const { data, error } = await supabase.from('messages').select('*').eq('session_id', sessionId).order('created_at', { ascending: true });
    if (error) return setErrorNotice('네트워크 연결이 불안정합니다. 연결을 확인해 주세요.');
    setMessages((data || []).map((m: any) => ({ id: m.id, role: m.role, text: m.content, timestamp: new Date(m.created_at).getTime() })));
  };

  useEffect(() => { fetchSessions(); }, [user.id]);

  const createSession = async () => {
    const { data, error } = await supabase.from('chat_sessions').insert({ student_id: user.id, tone_level: 'low', title: '새 대화' }).select('*').single();
    if (error) return null;
    const created = data as ChatSession;
    setSessions((prev) => [created, ...prev]);
    setCurrentSessionId(created.id);
    return created.id;
  };

  const ensureSession = async () => currentSessionId || createSession();

  const getHeaders = async () => {
    const { data } = await supabase.auth.getSession();
    return { 'Content-Type': 'application/json', ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}) };
  };

  const loadSettings = async () => {
    if (settingsCacheRef.current) return settingsCacheRef.current;
    const { data } = await supabase.from('student_profiles').select('settings').eq('user_id', user.id).single();
    settingsCacheRef.current = normalizeSettings(data?.settings as StudentSettings);
    return settingsCacheRef.current;
  };

  const persistMessage = async (sessionId: string, role: 'user' | 'model', content: string) => {
    const { data } = await supabase.from('messages').insert({ session_id: sessionId, student_id: user.id, role, content }).select('id').single();
    return data?.id as string | undefined;
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    if (isOffline) return setErrorNotice('네트워크 연결이 불안정합니다. 연결을 확인해 주세요.');

    const userText = input.trim();
    setInput('');
    setLoading(true);
    setErrorNotice('');
    setMessages((prev) => [...prev, { role: 'user', text: userText, timestamp: Date.now() }]);

    const sessionId = await ensureSession();
    if (!sessionId) return setLoading(false);
    await persistMessage(sessionId, 'user', userText);

    const isDanger = DANGER_KEYWORDS.some((keyword) => userText.includes(keyword));
    if (isDanger) {
      await supabase.from('safety_alerts').insert({ student_id: user.id, message: '위험 키워드가 포함된 대화가 감지되었습니다.' });
    }

    try {
      const settings = await loadSettings();
      const headers = await getHeaders();
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ newMessage: userText, history: messages.map((m) => ({ role: m.role, content: m.text })), parentStylePrompt: buildSystemPromptFromSettings(settings) }),
      });
      const data = await response.json();
      const aiText = data.text || '잠시 대화가 어려워요. 다시 시도해볼까요?';
      const aiId = await persistMessage(sessionId, 'model', aiText);
      const next: ChatMessage[] = [{ id: aiId, role: 'model', text: aiText, timestamp: Date.now() }];
      if (/답변할 수 없습니다|거절|위험|unsafe|policy/i.test(aiText) || isDanger) {
        next.push({ role: 'model', text: '⚠️ 해당 질문은 학생 보호 정책에 따라 답변할 수 없습니다.', timestamp: Date.now(), isSafetyNotice: true });
      }
      setMessages((prev) => [...prev, ...next]);
    } catch {
      setErrorNotice('네트워크 연결이 불안정합니다. 연결을 확인해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  const startMicRecord = () => {
    const isWebViewBridge = typeof (window as any).ReactNativeWebView?.postMessage === 'function';
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      if (isWebViewBridge) {
        (window as any).ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_NATIVE_SPEECH_TO_TEXT' }));
        return;
      }
      return alert('이 환경에서는 웹 음성 인식을 지원하지 않습니다. 모바일 앱에서는 네이티브 음성 인식 브릿지를 사용해 주세요.');
    }
    const recognition = new SR();
    recognition.lang = 'ko-KR';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event: any) => {
      let text = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) text += event.results[i][0].transcript;
      setInput(text);
    };
    recognition.onend = () => setIsMicRecording(false);
    recognition.start();
    speechRecognitionRef.current = recognition;
    setIsMicRecording(true);
  };

  const stopMicRecord = () => {
    if (speechRecognitionRef.current) speechRecognitionRef.current.stop();
    setIsMicRecording(false);
  };

  const openPrivacyWithParentalGate = () => {
    setGateQuestion({ a: Math.floor(Math.random() * 8) + 2, b: Math.floor(Math.random() * 8) + 2 });
    setGateAnswer('');
    setIsParentalGateOpen(true);
  };

  const submitParentalGate = () => {
    if (Number(gateAnswer) !== gateQuestion.a * gateQuestion.b) return alert('정답이 아닙니다. 보호자가 다시 확인해 주세요.');
    setIsParentalGateOpen(false);
    setIsPrivacyModalOpen(true);
  };

  const submitReport = async () => {
    if (!reportingMessageId) return;
    const { error } = await supabase.from('ai_message_reports').insert({ message_id: reportingMessageId, reporter_id: user.id, reason: reportReason });
    if (error) return alert('신고 접수에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    alert('신고가 접수되었습니다.');
    setReportingMessageId(null);
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2"><ForteenLogo className="w-10 h-10" /><span className="font-black">포틴AI</span></div>
        <div className="flex items-center gap-3">
          <button onClick={onDeleteAccount} className="text-red-600 text-xs font-bold">회원 탈퇴</button>
          <button onClick={onLogout} className="text-slate-500 text-xs font-bold">Logout</button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-[220px_1fr] min-h-0">
        <aside className="border-r border-slate-200 p-3 overflow-y-auto">
          <button onClick={async () => { const id = await createSession(); if (id) { setCurrentSessionId(id); setMessages([]); } }} className="w-full bg-brand-900 text-white rounded-xl py-2 text-sm font-bold">+ 새 대화</button>
          <div className="mt-3 space-y-2">{sessions.map((s) => <button key={s.id} onClick={() => { setCurrentSessionId(s.id); fetchMessages(s.id); }} className="w-full text-left text-xs border rounded-xl px-3 py-2">{s.title || '새 대화'}</button>)}</div>
        </aside>

        <section className="flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {errorNotice && <div className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{errorNotice}</div>}
            {messages.map((m, idx) => (
              <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${m.isSafetyNotice ? 'bg-rose-50 border border-rose-200 text-rose-700' : m.role === 'user' ? 'bg-brand-900 text-white' : 'bg-white border border-slate-200'}`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                  {m.role === 'model' && !m.isSafetyNotice && m.id && <button className="mt-2 text-xs font-bold text-rose-500 underline" onClick={() => setReportingMessageId(m.id || null)}>🚩 신고하기</button>}
                </div>
              </div>
            ))}
            {loading && <div className="text-xs text-slate-400">답변 생성 중...</div>}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-slate-200 p-3 space-y-2 bg-white">
            <div className="flex items-center gap-2">
              <button onClick={isMicRecording ? stopMicRecord : startMicRecord} className="rounded-full border px-3 py-2 text-xs font-bold">{isMicRecording ? <StopIcon className="w-4 h-4" /> : <VoiceIcon className="w-4 h-4" />}</button>
              <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} className="flex-1 border rounded-xl px-3 py-2" placeholder={isMicRecording ? '음성 인식 중...' : '질문을 입력하세요'} />
              <button disabled={loading || !input.trim()} onClick={handleSend} className="bg-brand-900 text-white rounded-xl px-4 py-2 text-sm font-bold disabled:bg-slate-300">전송</button>
            </div>
            <p className="text-[11px] text-slate-500">포틴AI는 실수할 수 있습니다. <button onClick={openPrivacyWithParentalGate} className="underline">개인 정보 보호 및 포틴AI</button></p>
          </div>
        </section>
      </div>

      <PrivacyPolicyModal isOpen={isPrivacyModalOpen} onClose={() => setIsPrivacyModalOpen(false)} />

      {isParentalGateOpen && <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-3"><h3 className="font-black text-lg">보호자 확인이 필요합니다</h3><p className="text-sm">{gateQuestion.a} x {gateQuestion.b} = ?</p><input value={gateAnswer} onChange={(e) => setGateAnswer(e.target.value)} className="w-full border rounded-xl px-3 py-2" /><div className="flex justify-end gap-2"><button className="px-3 py-2 text-sm" onClick={() => setIsParentalGateOpen(false)}>취소</button><button className="px-3 py-2 text-sm bg-brand-900 text-white rounded-lg" onClick={submitParentalGate}>확인</button></div></div></div>}

      {reportingMessageId && <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-3"><h3 className="font-black text-lg">AI 답변 신고</h3><select value={reportReason} onChange={(e) => setReportReason(e.target.value)} className="w-full border rounded-xl px-3 py-2"><option>부적절한 내용</option><option>부정확한 정보</option><option>기타</option></select><div className="flex justify-end gap-2"><button className="px-3 py-2 text-sm" onClick={() => setReportingMessageId(null)}>취소</button><button className="px-3 py-2 text-sm bg-rose-600 text-white rounded-lg" onClick={submitReport}>제출</button></div></div></div>}
    </div>
  );
};

export default StudentChat;

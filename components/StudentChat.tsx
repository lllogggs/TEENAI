import React, { useState, useEffect, useRef } from 'react';
import { User, ChatSession, ChatMessage, ToneLevel, StudentProfile } from '../types';
import { DANGER_KEYWORDS, SAFETY_ALERT_MESSAGE } from '../constants';
import { GeminiService } from '../services/geminiService';
import { MockDb } from '../services/mockDb';

interface StudentChatProps {
  user: User;
  onLogout: () => void;
}

const StudentChat: React.FC<StudentChatProps> = ({ user, onLogout }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pastSessions, setPastSessions] = useState<ChatSession[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>(Math.random().toString(36).substr(2, 9));
  const [sessionStartTime, setSessionStartTime] = useState(Date.now());
  const [profile, setProfile] = useState<StudentProfile | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const p = MockDb.getStudentProfile(user.id);
    setProfile(p);
    setPastSessions(MockDb.getStudentSessions(user.id));
  }, [user.id]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleNewChat = async () => {
    if (messages.length > 0) {
      await endCurrentSession();
    }
    setMessages([]);
    setSessionId(Math.random().toString(36).substr(2, 9));
    setSessionStartTime(Date.now());
    setPastSessions(MockDb.getStudentSessions(user.id));
  };

  const endCurrentSession = async () => {
    if (messages.length === 0) return;
    const analysis = await GeminiService.analyzeSession(messages, true);
    let toneEnum = ToneLevel.LOW;
    if (analysis.tone_level === 'medium') toneEnum = ToneLevel.MEDIUM;
    if (analysis.tone_level === 'high') toneEnum = ToneLevel.HIGH;

    const session: ChatSession = {
      id: sessionId,
      studentId: user.id,
      shareMode: true,
      startedAt: sessionStartTime,
      endedAt: Date.now(),
      messages: [...messages],
      topicTags: analysis.topic_tags,
      outputTypes: analysis.output_types,
      toneLevel: toneEnum,
      summary: analysis.session_summary,
      studentIntent: analysis.student_intent,
      aiIntervention: analysis.ai_intervention
    };
    await MockDb.saveSession(session);
  };

  const checkForDanger = async (text: string) => {
    const lowerText = text.toLowerCase();
    const foundKeyword = DANGER_KEYWORDS.find(k => lowerText.includes(k));
    if (foundKeyword) {
      await MockDb.createAlert({
        id: Math.random().toString(36).substr(2, 9),
        studentId: user.id,
        sessionId: sessionId,
        createdAt: Date.now(),
        message: SAFETY_ALERT_MESSAGE,
        read: false
      });
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userText = input;
    setInput('');
    setLoading(true);

    const userMsg: ChatMessage = { role: 'user', text: userText, timestamp: Date.now() };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);

    checkForDanger(userText);

    const historyForGemini = newHistory.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
    }));

    const aiResponseText = await GeminiService.chat(historyForGemini, userText, profile?.settings);
    
    const aiMsg: ChatMessage = { role: 'model', text: aiResponseText || "죄송합니다, 답변을 생성하는 중에 문제가 발생했습니다.", timestamp: Date.now() };
    setMessages(prev => [...prev, aiMsg]);
    setLoading(false);
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC] font-sans overflow-hidden">
      {/* Sidebar: Minimalist Glass Design */}
      <aside className="w-72 bg-white border-r border-slate-100 flex flex-col hidden sm:flex">
        <div className="p-8 pb-4">
          <h2 className="text-2xl font-black text-brand-900 tracking-tighter mb-6">TEENAI</h2>
          <button onClick={handleNewChat} className="w-full flex items-center justify-center gap-2 bg-brand-50 text-brand-900 py-3.5 rounded-2xl font-black text-sm hover:bg-brand-100 transition-all active:scale-95 shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"></path></svg>
            새 대화 시작하기
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto px-4 space-y-1">
          <p className="text-[10px] font-black text-slate-400 px-4 mb-4 mt-6 uppercase tracking-widest">지난 대화 기록</p>
          {pastSessions.length === 0 && (
            <div className="p-8 text-center"><p className="text-xs text-slate-300 font-bold italic">아직 기록이 없습니다.</p></div>
          )}
          {pastSessions.map(s => (
            <div key={s.id} className="p-4 rounded-2xl hover:bg-slate-50 cursor-pointer transition-all group border border-transparent hover:border-slate-100">
              <p className="text-[10px] text-slate-300 font-bold mb-1 uppercase tracking-tighter">{new Date(s.startedAt).toLocaleDateString()}</p>
              <p className="text-[13px] text-slate-600 font-bold truncate group-hover:text-brand-900">{s.studentIntent || "상담 세션"}</p>
            </div>
          ))}
        </div>

        <div className="p-6 border-t border-slate-50">
           <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl">
              <div className="w-9 h-9 bg-brand-900 text-white rounded-xl flex items-center justify-center text-xs font-black shadow-lg">{user.name[0]}</div>
              <div className="flex-1 overflow-hidden">
                <p className="text-[13px] font-black text-slate-800 truncate">{user.name}님</p>
                <button onClick={() => { handleNewChat(); onLogout(); }} className="text-[11px] text-slate-400 hover:text-red-500 transition-colors font-bold">로그아웃</button>
              </div>
           </div>
        </div>
      </aside>

      {/* Main: Premium Conversation View */}
      <main className="flex-1 flex flex-col bg-white relative">
        {/* Header: Clean & Modern */}
        <header className="px-8 py-6 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-10 border-b border-slate-50">
          <div className="flex items-center gap-4">
            <div className="sm:hidden">
               <button onClick={onLogout} className="text-slate-400">
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7"></path></svg>
               </button>
            </div>
            <div className="relative">
                <div className="w-12 h-12 bg-brand-50 rounded-2xl flex items-center justify-center text-2xl shadow-inner">💜</div>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full"></div>
            </div>
            <div>
              <h1 className="text-base font-black text-slate-900 tracking-tight">TEENAI 멘토</h1>
              <p className="text-[10px] text-emerald-500 font-black uppercase tracking-widest">실시간 연결됨</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="p-2.5 text-slate-300 hover:text-slate-600 transition-all rounded-xl hover:bg-slate-50"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg></button>
            <button className="p-2.5 text-slate-300 hover:text-slate-600 transition-all rounded-xl hover:bg-slate-50"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg></button>
          </div>
        </header>

        {/* Chat Area: Modern Bubble Spacing */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar bg-slate-50/30">
          <div className="flex flex-col items-center mb-10 opacity-40">
            <div className="h-px w-32 bg-slate-200 mb-4"></div>
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">
              {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>

          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
              <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-[80%] sm:max-w-[70%]`}>
                {msg.role === 'model' && <span className="text-[10px] text-brand-900 font-black mb-2 ml-1 uppercase tracking-widest">Mentor</span>}
                <div className={`px-6 py-4 rounded-[1.75rem] text-[14px] leading-relaxed shadow-sm font-medium ${
                  msg.role === 'user' 
                  ? 'bg-brand-900 text-white rounded-tr-none' 
                  : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none'
                }`}>
                  {msg.text}
                </div>
                <span className={`text-[10px] text-slate-300 mt-2 font-bold ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}
          
          {loading && (
            <div className="flex justify-start items-center gap-3 animate-pulse">
              <div className="w-6 h-6 bg-brand-100 rounded-lg flex items-center justify-center text-xs">💜</div>
              <div className="bg-white border border-slate-100 px-5 py-3 rounded-full text-[11px] text-slate-400 font-black italic shadow-sm">
                메시지를 정성스럽게 작성하고 있습니다...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area: Floating Pill Design */}
        <div className="p-6 bg-white border-t border-slate-50">
          <div className="max-w-4xl mx-auto flex gap-3 items-center bg-slate-50 p-2 pl-6 rounded-[2rem] border border-slate-100 shadow-sm focus-within:ring-4 focus-within:ring-brand-50 transition-all">
            <button className="text-slate-300 hover:text-brand-900 transition-colors">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
            </button>
            <input 
              value={input} 
              onChange={(e) => setInput(e.target.value)} 
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }} 
              placeholder="멘토님에게 하고 싶은 이야기를 적어주세요..." 
              className="flex-1 bg-transparent border-none py-3 text-sm focus:outline-none font-bold text-slate-700 placeholder-slate-300" 
            />
            <button 
              onClick={handleSend} 
              disabled={!input.trim() || loading} 
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-lg ${
                !input.trim() || loading ? 'bg-slate-200 text-white' : 'bg-brand-900 text-white hover:bg-black'
              }`}
            >
              <svg className="w-5 h-5 transform rotate-90" fill="currentColor" viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path></svg>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default StudentChat;
import React, { useEffect, useState } from 'react';
import { ChatSession, MessageRow, SessionRiskLevel, User } from '../types';
import { supabase } from '../utils/supabase';

interface ParentSessionDetailProps {
  user: User;
  sessionId: string;
  onBack: () => void;
}

// [수정] warn, high 추가
const riskChipColor: Record<SessionRiskLevel, string> = {
  stable: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  normal: 'bg-amber-50 text-amber-700 border-amber-100',
  caution: 'bg-rose-50 text-rose-700 border-rose-100',
  warn: 'bg-rose-100 text-rose-800 border-rose-200',
  high: 'bg-red-100 text-red-800 border-red-200',
};

// [수정] warn, high 추가
const riskText: Record<SessionRiskLevel, string> = {
  stable: '안정',
  normal: '보통',
  caution: '주의',
  warn: '경고',
  high: '위험',
};

const formatSessionTitle = (startedAt: string) => {
  const date = new Date(startedAt);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `대화 ${yyyy}-${mm}-${dd} ${hh}:${min}`;
};

const ParentSessionDetail: React.FC<ParentSessionDetailProps> = ({ user, sessionId, onBack }) => {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const fetchSession = async () => {
      setLoading(true);
      setErrorMsg(null);

      const { data, error: sessionFetchError } = await supabase
        .from('chat_sessions')
        .select('id, student_id, started_at, summary, risk_level, tone_level, topic_tags, output_types, student_intent, ai_intervention')
        .eq('id', sessionId)
        .single();

      if (sessionFetchError) {
        console.error('ParentSessionDetail fetch error', sessionFetchError);
        setErrorMsg('세션을 불러올 수 없습니다. (권한/RLS 또는 세션 없음)');
        setLoading(false);
        return;
      }

      setSession(data as ChatSession);

      const { data: messageData, error: messageFetchError } = await supabase
        .from('messages')
        .select('id, role, content, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (messageFetchError) {
        console.error('ParentSessionDetail fetch error', messageFetchError);
        setErrorMsg('메시지를 불러올 수 없습니다. (RLS 정책 확인 필요)');
        setLoading(false);
        return;
      }

      setMessages((messageData || []) as MessageRow[]);
      setLoading(false);
    };

    fetchSession();
  }, [sessionId]);

  if (loading) {
    return <div className="h-screen flex items-center justify-center font-black text-brand-900">세션을 불러오는 중...</div>;
  }

  if (errorMsg) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="font-black text-rose-600">{errorMsg}</p>
        <p className="text-sm text-slate-500">콘솔 로그 확인 후 RLS 정책/권한 상태를 점검해 주세요.</p>
        <button onClick={onBack} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700">대시보드로</button>
      </div>
    );
  }

  if (!session) {
    return <div className="h-screen flex items-center justify-center font-black text-brand-900">세션 정보를 찾을 수 없습니다.</div>;
  }

  const level = session.risk_level || 'normal';

  return (
    <div className="min-h-screen bg-[#F4F7FC]">
      <nav className="sticky top-0 z-40 px-5 md:px-10 py-5 md:py-6 flex justify-between items-center bg-white/90 backdrop-blur-xl border-b border-slate-100">
        <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">TEENAI <span className="text-[10px] bg-brand-900 text-white px-2 py-0.5 rounded ml-1 uppercase tracking-tighter">Parent</span></h1>
        <div className="flex items-center gap-3">
          <span className="text-xs md:text-sm font-bold text-slate-500">{user.name}</span>
          <button onClick={onBack} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700">대시보드로</button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-5 md:px-8 py-8 space-y-6">
        <section className="premium-card p-6">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="font-black text-lg text-slate-900">{formatSessionTitle(session.started_at)}</h2>
            <span className={`text-[10px] font-black px-2 py-1 rounded-full border ${riskChipColor[level]}`}>{riskText[level]}</span>
          </div>
          <p className="text-xs text-slate-500">{new Date(session.started_at).toLocaleString('ko-KR')}</p>
          <p className="mt-4 text-sm font-bold text-slate-900">{session.summary || '요약이 아직 없습니다.'}</p>
        </section>

        <section className="premium-card p-6">
          <h3 className="font-black text-lg mb-4">메시지</h3>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
            {messages.length === 0 && <p className="text-sm text-slate-400">메시지가 없습니다.</p>}
            {messages.map((message) => (
              <div key={message.id} className={`p-3 rounded-xl text-sm ${message.role === 'user' ? 'bg-brand-900 text-white ml-8' : 'bg-slate-100 text-slate-800 mr-8'}`}>
                <p className="text-[10px] opacity-70 mb-1">{message.role} · {new Date(message.created_at).toLocaleTimeString('ko-KR')}</p>
                <p>{message.content}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

export default ParentSessionDetail;

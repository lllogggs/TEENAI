'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/utils/supabase/client';

interface ParentDashboardProps {
  parentName: string;
}

interface MessageRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  session_id: string;
  profiles?: { name: string | null } | null;
}

export default function ParentDashboard({ parentName }: ParentDashboardProps) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMessages = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('messages')
      .select('id, role, content, created_at, session_id, profiles(name)')
      .order('created_at', { ascending: false })
      .limit(50);

    setMessages((data ?? []) as MessageRow[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchMessages();
  }, []);

  const bySession = useMemo(() => {
    return messages.reduce<Record<string, MessageRow[]>>((acc, message) => {
      acc[message.session_id] = acc[message.session_id] || [];
      acc[message.session_id].push(message);
      return acc;
    }, {});
  }, [messages]);

  return (
    <section className="card" style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>보호자 리포트</p>
          <h2 style={{ margin: '0.25rem 0 0' }}>{parentName} 님을 위한 학습 대시보드</h2>
        </div>
        <button
          onClick={fetchMessages}
          style={{ padding: '0.55rem 0.9rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'inherit' }}
        >
          새로고침
        </button>
      </div>

      {loading && <p style={{ color: 'var(--muted)' }}>최근 대화 불러오는 중...</p>}
      {!loading && messages.length === 0 && <p style={{ color: 'var(--muted)' }}>아직 기록된 대화가 없습니다.</p>}

      {!loading &&
        Object.entries(bySession).map(([sessionId, sessionMessages]) => (
          <article key={sessionId} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '1rem', background: 'rgba(255,255,255,0.02)' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div>
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>세션 {sessionId.slice(0, 8)}...</p>
                <strong>{sessionMessages[0]?.profiles?.name ?? '알 수 없는 학생'}</strong>
              </div>
              <span style={{ padding: '0.35rem 0.75rem', borderRadius: 10, background: 'rgba(124,58,237,0.16)', color: '#e9d5ff', fontWeight: 700, fontSize: '0.9rem' }}>
                {sessionMessages.length}개 메시지
              </span>
            </header>

            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {sessionMessages.map((message) => (
                <div key={message.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                    {new Date(message.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div style={{ padding: '0.75rem', borderRadius: 10, background: message.role === 'assistant' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(59,130,246,0.12)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>
                      {message.role === 'assistant' ? 'AI 응답' : `${message.profiles?.name ?? '학생'} 입력`}
                    </p>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{message.content}</div>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
    </section>
  );
}

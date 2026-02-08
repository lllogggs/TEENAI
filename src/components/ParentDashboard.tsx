'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/utils/supabase/client';

interface ParentDashboardProps {
  parentName: string;
  accessCode?: string;
}

interface MessageRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  session_id: string;
  access_code: string;
  notes?: string;
}

export default function ParentDashboard({ parentName, accessCode }: ParentDashboardProps) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);

  // 메시지 가져오기 함수 (useCallback으로 감싸서 useEffect 의존성 문제 해결)
  const fetchMessages = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);

    let query = supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    // 인증 코드가 있으면 해당 가족의 대화만 필터링
    if (accessCode) {
      query = query.eq('access_code', accessCode);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching messages:', error);
    } else {
      setMessages((data as any[]) ?? []);
    }
    setLoading(false);
  }, [accessCode]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const bySession = useMemo(() => {
    return messages.reduce<Record<string, MessageRow[]>>((acc, message) => {
      acc[message.session_id] = acc[message.session_id] || [];
      acc[message.session_id].push(message);
      return acc;
    }, {});
  }, [messages]);

  return (
    <section className="parent-shell">
      <nav className="parent-nav">
        <h1>
          TEENAI
          <span>Parent</span>
        </h1>
        <div className="parent-nav-actions">
          <div>
            <p>Parent Account</p>
            <strong>{parentName}님 ({accessCode})</strong>
          </div>
          <button type="button" onClick={fetchMessages} className="parent-refresh">
            새로고침
          </button>
        </div>
      </nav>

      <main className="parent-main">
        <section className="parent-hero">
          <div>
            <h2>자녀 학습 리포트</h2>
            <p>우리 가족 인증코드({accessCode})로 연결된 대화 내역입니다.</p>
          </div>
        </section>

        <section className="parent-timeline">
          <header>
            <h3>타임라인</h3>
            <span>최근 대화 목록</span>
          </header>

          {loading && <p className="parent-muted">데이터를 불러오는 중입니다...</p>}
          {!loading && messages.length === 0 && <p className="parent-muted">아직 자녀와의 대화 기록이 없습니다.</p>}

          {!loading &&
            Object.entries(bySession).map(([sessionId, sessionMessages]) => {
              // 최신순 정렬
              const sortedMsgs = [...sessionMessages].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              );
              const lastMsg = sortedMsgs[sortedMsgs.length - 1];
              const studentName = lastMsg.notes ? lastMsg.notes.replace('학생: ', '') : '자녀';

              return (
                <article key={sessionId} className="parent-timeline-item" style={{ padding: '1.5rem', borderBottom: '1px solid #eee' }}>
                  <div style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                    <strong>{studentName}의 세션</strong>
                    <span style={{ fontSize: '0.8rem', color: '#888' }}>
                      {new Date(lastMsg.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {sortedMsgs.map((msg) => (
                      <div key={msg.id} style={{ 
                        display: 'flex', 
                        justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' 
                      }}>
                        <span style={{
                          background: msg.role === 'user' ? '#eef2ff' : '#f0fdf4',
                          color: msg.role === 'user' ? '#3730a3' : '#166534',
                          padding: '0.5rem 0.8rem',
                          borderRadius: '8px',
                          fontSize: '0.9rem',
                          maxWidth: '80%'
                        }}>
                          {msg.role === 'assistant' && '🤖 '}
                          {msg.content}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
        </section>
      </main>
    </section>
  );
}

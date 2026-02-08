'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/utils/supabase/client';

interface ParentDashboardProps {
  parentName: string;
  accessCode: string;
}

interface MessageRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  session_id: string;
}

interface ProfileRow {
  name: string;
  role: 'student' | 'parent';
}

export default function ParentDashboard({ parentName, accessCode }: ParentDashboardProps) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [studentNames, setStudentNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMessages = async () => {
    setLoading(true);
    if (!supabase) {
      console.warn('Supabase 환경변수가 설정되지 않아 대화를 불러올 수 없습니다.');
      setMessages([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('messages')
      .select('id, role, content, created_at, session_id')
      .eq('access_code', accessCode)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching messages:', error);
    }

    setMessages(data ?? []);
    setLoading(false);
  };

  const fetchStudents = async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('name, role')
      .eq('access_code', accessCode)
      .eq('role', 'student');

    if (error) {
      console.error('Error fetching profiles:', error);
      return;
    }

    const names = (data as ProfileRow[])?.map((profile) => profile.name).filter(Boolean) ?? [];
    setStudentNames(names);
  };

  useEffect(() => {
    fetchMessages();
    fetchStudents();
  }, [accessCode]);

  const bySession = useMemo(() => {
    return messages.reduce<Record<string, MessageRow[]>>((acc, message) => {
      acc[message.session_id] = acc[message.session_id] || [];
      acc[message.session_id].push(message);
      return acc;
    }, {});
  }, [messages]);

  const sessions = useMemo(() => {
    return Object.entries(bySession)
      .map(([sessionId, sessionMessages]) => {
        const sorted = [...sessionMessages].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        return {
          id: sessionId,
          messages: sorted,
          lastMessage: sorted[0],
        };
      })
      .sort((a, b) => new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime());
  }, [bySession]);

  const displayStudentName = studentNames.length > 0 ? studentNames[0] : '학생';

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
            <strong>{parentName}님</strong>
          </div>
          <button type="button" onClick={fetchMessages} className="parent-refresh">
            새로고침
          </button>
        </div>
      </nav>

      <main className="parent-main">
        <section className="parent-hero">
          <div>
            <h2>{parentName} 님의 학습 리포트</h2>
            <p>최근 대화 기록과 세션 흐름을 한눈에 확인하세요.</p>
          </div>
          <div className="parent-hero-badge">
            <span>총 대화 {messages.length}회</span>
          </div>
        </section>

        <section className="parent-stats">
          <article>
            <p>Total Sessions</p>
            <h3>{sessions.length}회</h3>
          </article>
          <article>
            <p>Total Interactions</p>
            <h3>{messages.length}개</h3>
          </article>
          <article>
            <p>최근 업데이트</p>
            <h3>{messages[0] ? new Date(messages[0].created_at).toLocaleDateString() : '-'}</h3>
          </article>
        </section>

        <section className="parent-timeline">
          <header>
            <h3>Timeline Analysis</h3>
            <span>Recent 5 Sessions</span>
          </header>

          {loading && <p className="parent-muted">최근 대화 불러오는 중...</p>}
          {!loading && sessions.length === 0 && <p className="parent-muted">아직 기록된 대화가 없습니다.</p>}

          {!loading && (
            <div className="parent-timeline-list">
              {sessions.slice(0, 5).map((session) => {
                const lastMessage = session.lastMessage?.content ?? '새로운 대화가 시작되었습니다.';

                return (
                  <article key={session.id}>
                    <div>
                      <p>{new Date(session.lastMessage.created_at).toLocaleDateString()}</p>
                      <strong>{displayStudentName}</strong>
                      <span>{lastMessage}</span>
                    </div>
                    <span>{session.messages.length} Messages</span>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </section>
  );
}

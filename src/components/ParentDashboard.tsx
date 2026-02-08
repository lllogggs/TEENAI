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
  // 수정: Supabase 조인 결과가 배열일 수도, 객체일 수도 있으므로 유연하게 any로 처리
  profiles?: any;
}

export default function ParentDashboard({ parentName }: ParentDashboardProps) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
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
      .select('id, role, content, created_at, session_id, profiles(name)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching messages:', error);
    }

    // 수정: 타입 에러 방지를 위해 (data as any)로 강제 변환
    setMessages((data as any) ?? []);
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

  // 수정: 이름 가져오기 헬퍼 함수 (배열/객체 모두 처리)
  const getStudentName = (profiles: any) => {
    if (!profiles) return '알 수 없는 학생';
    // 배열인 경우 첫 번째 요소의 이름을 반환
    if (Array.isArray(profiles)) {
      return profiles[0]?.name ?? '알 수 없는 학생';
    }
    // 객체인 경우 바로 이름을 반환
    return profiles.name ?? '알 수 없는 학생';
  };

  return (
    <section className="parent-panel" style={{ display: 'grid', gap: '1rem', padding: '2.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>보호자 리포트</p>
          <h2 style={{ margin: '0.25rem 0 0' }}>{parentName} 님을 위한 학습 대시보드</h2>
        </div>
        <button
          onClick={fetchMessages}
          className="button-base button-secondary"
        >
          새로고침
        </button>
      </div>

      {loading && <p style={{ color: 'var(--muted)' }}>최근 대화 불러오는 중...</p>}
      {!loading && messages.length === 0 && <p style={{ color: 'var(--muted)' }}>아직 기록된 대화가 없습니다.</p>}

      {!loading &&
        Object.entries(bySession).map(([sessionId, sessionMessages]) => {
          // 세션의 첫 번째 메시지에서 학생 정보를 가져옴
          const studentName = getStudentName(sessionMessages[0]?.profiles);
          
          return (
            <article key={sessionId} style={{ border: '1px solid rgba(148, 163, 184, 0.25)', borderRadius: 24, padding: '1.25rem', background: 'var(--slate-100)' }}>
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div>
                  <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>세션 {sessionId.slice(0, 8)}...</p>
                  <strong>{studentName}</strong>
                </div>
                <span style={{ padding: '0.4rem 0.85rem', borderRadius: 999, background: 'var(--brand-50)', color: 'var(--brand-900)', fontWeight: 700, fontSize: '0.9rem' }}>
                  {sessionMessages.length}개 메시지
                </span>
              </header>

              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {sessionMessages.map((message) => (
                  <div key={message.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                      {new Date(message.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div
                      style={{
                        padding: '0.9rem',
                        borderRadius: 16,
                        background: message.role === 'assistant' ? 'rgba(99, 102, 241, 0.12)' : '#ffffff',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                      }}
                    >
                      <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>
                        {message.role === 'assistant' ? 'AI 응답' : `${getStudentName(message.profiles)} 입력`}
                      </p>
                      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{message.content}</div>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
    </section>
  );
}

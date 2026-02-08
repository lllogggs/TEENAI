'use client';

import { FormEvent, useEffect, useMemo } from 'react';
import { useChat } from 'ai/react';
import { supabase } from '@/utils/supabase/client';

type Props = {
  sessionId: string;
  userId: string;
  studentName: string;
};

export default function StudentChat({ sessionId, userId, studentName }: Props) {
  const { messages, input, handleInputChange, handleSubmit, isLoading, setInput } = useChat({
    api: '/api/chat',
    body: { sessionId, userId, studentName },
  });

  useEffect(() => {
    if (!sessionId || !userId || !supabase) return;
    supabase.from('sessions').upsert({ id: sessionId, user_id: userId, title: `${studentName}의 학습 세션` });
  }, [sessionId, userId, studentName]);

  const handleLocalSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = input.trim();
    if (!content) return;

    if (supabase) {
      await supabase.from('messages').insert({ session_id: sessionId, user_id: userId, role: 'user', content });
    }
    await handleSubmit(event);
    setInput('');
  };

  const conversation = useMemo(() => messages, [messages]);

  return (
    <section className="student-panel" style={{ display: 'grid', gap: '1rem', padding: '2.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>학습 파트너 Gemini 1.5</p>
          <h2 style={{ margin: '0.25rem 0 0' }}>{studentName} 학생 상담</h2>
        </div>
        <span style={{ padding: '0.35rem 0.75rem', background: 'rgba(255, 255, 255, 0.12)', borderRadius: 999, fontSize: '0.85rem' }}>
          세션 ID: {sessionId.slice(0, 8)}...
        </span>
      </div>

      <div
        style={{
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: 20,
          padding: '1rem',
          maxHeight: 420,
          overflowY: 'auto',
          background: 'rgba(255, 255, 255, 0.08)',
        }}
      >
        {conversation.length === 0 && <p className="muted">오늘의 질문을 시작하세요. 예: &quot;기말고사 대비 계획 세워줘&quot;</p>}
        {conversation.map((message) => (
          <article
            key={message.id}
            style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              borderRadius: 12,
              background: message.role === 'user' ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.16)',
            }}
          >
            <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              {message.role === 'user' ? `${studentName} 학생` : 'TEENAI 멘토'}
            </p>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{message.content}</div>
          </article>
        ))}
      </div>

      <form onSubmit={handleLocalSubmit} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
        <textarea
          placeholder="공부 계획, 고민, 목표를 입력하세요"
          style={{ flex: 1, padding: '1rem', borderRadius: 16, border: '1px solid rgba(255, 255, 255, 0.2)', background: 'rgba(255, 255, 255, 0.12)', color: '#ffffff', minHeight: 80 }}
          value={input}
          onChange={handleInputChange}
        />
        <button
          type="submit"
          className="button-base button-primary button-compact"
          disabled={isLoading}
        >
          {isLoading ? '응답 중...' : '보내기'}
        </button>
      </form>
    </section>
  );
}

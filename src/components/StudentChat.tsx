'use client';

import { FormEvent, useEffect, useMemo } from 'react';
import { useChat } from 'ai/react';
import { supabase } from '@/utils/supabase';

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
    if (!sessionId || !userId) return;
    supabase.from('sessions').upsert({ id: sessionId, user_id: userId, title: `${studentName}의 학습 세션` });
  }, [sessionId, userId, studentName]);

  const handleLocalSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = input.trim();
    if (!content) return;

    await supabase.from('messages').insert({ session_id: sessionId, user_id: userId, role: 'user', content });
    await handleSubmit(event);
    setInput('');
  };

  const conversation = useMemo(() => messages, [messages]);

  return (
    <section className="card" style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>학습 파트너 Gemini 1.5</p>
          <h2 style={{ margin: '0.25rem 0 0' }}>{studentName} 학생 상담</h2>
        </div>
        <span style={{ padding: '0.35rem 0.75rem', background: 'rgba(255,255,255,0.06)', borderRadius: 10, fontSize: '0.85rem' }}>
          세션 ID: {sessionId.slice(0, 8)}...
        </span>
      </div>

      <div
        style={{
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 14,
          padding: '1rem',
          maxHeight: 420,
          overflowY: 'auto',
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        {conversation.length === 0 && <p style={{ color: 'var(--muted)' }}>오늘의 질문을 시작하세요. 예) "기말고사 대비 계획 세워줘"</p>}
        {conversation.map((message) => (
          <article key={message.id} style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: 12, background: message.role === 'user' ? 'rgba(124, 58, 237, 0.1)' : 'rgba(255,255,255,0.04)' }}>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>
              {message.role === 'user' ? `${studentName} 학생` : 'TEENAI 멘토'}
            </p>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{message.content}</div>
          </article>
        ))}
      </div>

      <form onSubmit={handleLocalSubmit} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
        <textarea
          placeholder="공부 계획, 고민, 목표를 입력하세요"
          style={{ flex: 1, padding: '1rem', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'inherit', minHeight: 80 }}
          value={input}
          onChange={handleInputChange}
        />
        <button
          type="submit"
          style={{ padding: '0.95rem 1.15rem', borderRadius: 12, border: 'none', background: 'linear-gradient(90deg, #2563eb, #7c3aed)', color: 'white', fontWeight: 700 }}
          disabled={isLoading}
        >
          {isLoading ? '응답 중...' : '보내기'}
        </button>
      </form>
    </section>
  );
}

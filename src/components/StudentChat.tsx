'use client';

import { FormEvent, useEffect, useMemo, useRef } from 'react';
import { useChat } from 'ai/react';
import { supabase } from '@/utils/supabase/client';

type Props = {
  sessionId: string;
  userId: string;
  studentName: string;
  accessCode: string;
};

export default function StudentChat({ sessionId, userId, studentName, accessCode }: Props) {
  const { messages, input, handleInputChange, handleSubmit, isLoading, setInput } = useChat({
    api: '/api/chat',
    body: { sessionId, userId, studentName, accessCode },
  });
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionId || !userId || !supabase) return;
    supabase.from('sessions').upsert({
      id: sessionId,
      user_id: userId,
      title: `${studentName}의 학습 세션`,
      access_code: accessCode,
    });
  }, [sessionId, userId, studentName, accessCode]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleLocalSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = input.trim();
    if (!content) return;

    if (supabase) {
      await supabase.from('messages').insert({
        session_id: sessionId,
        user_id: userId,
        role: 'user',
        content,
        access_code: accessCode,
      });
    }
    await handleSubmit(event);
    setInput('');
  };

  const conversation = useMemo(() => messages, [messages]);

  return (
    <section className="chat-shell">
      <header className="chat-header">
        <div className="chat-title">
          <span className="chat-icon" aria-hidden="true">💜</span>
          <div>
            <h2>TEENAI 멘토</h2>
            <div className="chat-status">
              <span aria-hidden="true" />
              <p>LIVE MENTORING</p>
            </div>
          </div>
        </div>
        <span className="chat-session">세션 ID: {sessionId.slice(0, 8)}...</span>
      </header>

      <div className="chat-body">
        {conversation.length === 0 && (
          <div className="chat-empty">
            <div>💬</div>
            <p>당신의 이야기를 들려주세요.</p>
          </div>
        )}
        {conversation.map((message) => (
          <div key={message.id} className={`chat-message ${message.role === 'user' ? 'user' : 'assistant'}`}>
            <div className="chat-bubble">
              <p>{message.content}</p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="chat-loading">
            <span />
            <span />
            <span />
            <p>답변 생성 중...</p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form className="chat-input-wrap" onSubmit={handleLocalSubmit}>
        <input
          placeholder="멘토에게 고민을 털어놓아 보세요..."
          value={input}
          onChange={handleInputChange}
        />
        <button type="submit" disabled={isLoading || !input.trim()}>
          <svg className="chat-send-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
          </svg>
        </button>
      </form>
    </section>
  );
}

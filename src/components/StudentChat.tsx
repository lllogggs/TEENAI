'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useChat } from 'ai/react';
import { supabase } from '@/utils/supabase/client';

type Props = {
  initialSessionId: string;
  userId: string;
  studentName: string;
  accessCode?: string;
};

export default function StudentChat({ initialSessionId, userId, studentName, accessCode }: Props) {
  const [sessionId, setSessionId] = useState(initialSessionId);
  const { messages, input, handleInputChange, handleSubmit, isLoading, setInput, setMessages } = useChat({
    api: '/api/chat',
    body: { sessionId, userId, studentName, accessCode },
  });
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSessionId(initialSessionId);
  }, [initialSessionId]);

  useEffect(() => {
    const fetchMessages = async () => {
      if (!supabase || !sessionId) return;
      const { data, error } = await supabase
        .from('messages')
        .select('id, role, content, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error || !data) {
        console.error('대화 내역 불러오기 실패:', error);
        return;
      }

      setMessages(
        data.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
        }))
      );
    };

    fetchMessages();
  }, [sessionId, setMessages]);

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

  return (
    <section className="chat-shell">
      <header className="chat-header">
        <h2>TEENAI 멘토 ({studentName})</h2>
        <span>코드: {accessCode}</span>
      </header>

      <div className="chat-body">
        {messages.length === 0 && <p className="chat-empty">고민을 이야기해주세요.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`chat-message ${m.role}`}>
            <div className="chat-bubble">{m.content}</div>
          </div>
        ))}
        {isLoading && <p>답변 작성 중...</p>}
        <div ref={endRef} />
      </div>

      <form className="chat-input-wrap" onSubmit={handleLocalSubmit}>
        <input value={input} onChange={handleInputChange} placeholder="메시지 입력..." />
        <button type="submit" disabled={isLoading}>
          전송
        </button>
      </form>
    </section>
  );
}

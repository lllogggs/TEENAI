'use client';

import { FormEvent, useEffect, useMemo, useRef } from 'react';
import { useChat } from 'ai/react';
import { supabase } from '@/utils/supabase/client';

type Props = {
  sessionId: string;
  userId: string;
  studentName: string;
  accessCode?: string; // 추가된 Props
};

export default function StudentChat({ sessionId, userId, studentName, accessCode }: Props) {
  // api 호출 시 accessCode도 같이 보냄
  const { messages, input, handleInputChange, handleSubmit, isLoading, setInput } = useChat({
    api: '/api/chat',
    body: { sessionId, userId, studentName, accessCode },
  });
  const endRef = useRef<HTMLDivElement>(null);

  // 화면 스크롤 자동 이동
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleLocalSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = input.trim();
    if (!content) return;

    // 내 메시지 먼저 DB에 저장 (access_code 포함)
    if (supabase) {
      await supabase.from('messages').insert({
        session_id: sessionId,
        user_id: userId,
        role: 'user',
        content,
        access_code: accessCode // 중요!
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
        <button type="submit" disabled={isLoading}>전송</button>
      </form>
    </section>
  );
}

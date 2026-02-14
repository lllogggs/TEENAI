import React, { useState, useEffect, useMemo } from 'react';
import { User, ChatSession } from '../types';
import { supabase } from '../utils/supabase';

interface ParentDashboardProps {
  user: User;
  onLogout: () => void;
}

interface StudentOption {
  user_id: string;
  name: string;
  email: string;
  settings: Record<string, unknown> | null;
}

interface SessionMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  created_at: string;
}

const ParentDashboard: React.FC<ParentDashboardProps> = ({ user, onLogout }) => {
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [sessionMessages, setSessionMessages] = useState<SessionMessage[]>([]);
  const [stylePrompt, setStylePrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingPrompt, setSavingPrompt] = useState(false);

  const selectedStudent = useMemo(
    () => students.find((student) => student.user_id === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  useEffect(() => {
    const fetchStudents = async () => {
      const { data: profiles, error: profileError } = await supabase
        .from('student_profiles')
        .select('user_id, settings')
        .eq('parent_user_id', user.id);

      if (profileError) {
        console.error('student_profiles fetch error:', profileError);
        setLoading(false);
        return;
      }

      const studentIds = (profiles || []).map((profile) => profile.user_id);
      if (!studentIds.length) {
        setStudents([]);
        setLoading(false);
        return;
      }

      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', studentIds);

      if (usersError) {
        console.error('users fetch error:', usersError);
        setLoading(false);
        return;
      }

      const mapped = studentIds
        .map((studentId) => {
          const profile = (profiles || []).find((p) => p.user_id === studentId);
          const account = (usersData || []).find((u) => u.id === studentId);
          if (!account) return null;

          return {
            user_id: studentId,
            name: account.name,
            email: account.email,
            settings: (profile?.settings as Record<string, unknown> | null) || {},
          };
        })
        .filter(Boolean) as StudentOption[];

      setStudents(mapped);
      if (mapped.length > 0) {
        setSelectedStudentId(mapped[0].user_id);
      }
      setLoading(false);
    };

    fetchStudents();
  }, [user.id]);

  useEffect(() => {
    const fetchSessions = async () => {
      if (!selectedStudentId) {
        setSessions([]);
        return;
      }

      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('student_id', selectedStudentId)
        .order('started_at', { ascending: false });

      if (error) {
        console.error('chat_sessions fetch error:', error);
        setSessions([]);
        return;
      }

      setSessions((data || []) as ChatSession[]);
      setSelectedSessionId(data?.[0]?.id || '');
    };

    fetchSessions();
  }, [selectedStudentId]);

  useEffect(() => {
    const profileStylePrompt = (selectedStudent?.settings?.ai_style_prompt as string) || '';
    setStylePrompt(profileStylePrompt);
  }, [selectedStudent]);

  useEffect(() => {
    const fetchMessages = async () => {
      if (!selectedSessionId) {
        setSessionMessages([]);
        return;
      }

      const { data, error } = await supabase
        .from('messages')
        .select('id, role, content, created_at')
        .eq('session_id', selectedSessionId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('messages fetch error:', error);
        setSessionMessages([]);
        return;
      }

      setSessionMessages((data || []) as SessionMessage[]);
    };

    fetchMessages();
  }, [selectedSessionId]);

  const saveStylePrompt = async () => {
    if (!selectedStudentId) return;

    setSavingPrompt(true);
    const currentSettings = selectedStudent?.settings || {};
    const mergedSettings = { ...currentSettings, ai_style_prompt: stylePrompt };
    const { error } = await supabase
      .from('student_profiles')
      .update({ settings: mergedSettings })
      .eq('user_id', selectedStudentId);

    if (error) {
      console.error('student_profiles update error:', error);
      alert('스타일 프롬프트 저장에 실패했습니다.');
      setSavingPrompt(false);
      return;
    }

    setStudents((prev) =>
      prev.map((student) =>
        student.user_id === selectedStudentId
          ? { ...student, settings: { ...(student.settings || {}), ai_style_prompt: stylePrompt } }
          : student
      )
    );
    alert('스타일 프롬프트가 저장되었습니다.');
    setSavingPrompt(false);
  };

  if (loading) return <div className="h-screen flex items-center justify-center font-black animate-pulse text-brand-900">데이터 동기화 중...</div>;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <nav className="sticky top-0 z-40 px-10 py-6 flex justify-between items-center bg-white/80 backdrop-blur-xl border-b border-slate-100">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">TEENAI <span className="text-[10px] bg-brand-900 text-white px-2 py-0.5 rounded ml-1 uppercase tracking-tighter">Parent</span></h1>
        <button onClick={onLogout} className="bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 p-3 rounded-2xl transition-all">Logout</button>
      </nav>

      <main className="max-w-7xl mx-auto px-10 py-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <section className="premium-card p-6 space-y-4">
          <h2 className="font-black text-lg">연결된 학생</h2>
          {students.length === 0 && <p className="text-sm text-slate-400">아직 연결된 학생이 없습니다.</p>}
          {students.map((student) => (
            <button
              key={student.user_id}
              onClick={() => setSelectedStudentId(student.user_id)}
              className={`w-full text-left p-4 rounded-2xl border ${selectedStudentId === student.user_id ? 'border-brand-500 bg-brand-50' : 'border-slate-100 bg-white'}`}
            >
              <p className="font-bold text-slate-900">{student.name}</p>
              <p className="text-xs text-slate-500">{student.email}</p>
            </button>
          ))}

          <div className="pt-4 border-t border-slate-100">
            <label className="block text-sm font-bold mb-2">AI 답변 스타일(프롬프트 주입)</label>
            <textarea
              value={stylePrompt}
              onChange={(e) => setStylePrompt(e.target.value)}
              disabled={!selectedStudentId}
              className="w-full h-36 rounded-xl border border-slate-200 p-3 text-sm"
              placeholder="예) 짧고 따뜻한 문장으로 공감 먼저, 마지막에 실천 질문 1개"
            />
            <button
              onClick={saveStylePrompt}
              disabled={!selectedStudentId || savingPrompt}
              className="mt-3 px-4 py-2 rounded-xl bg-brand-900 text-white text-sm font-bold disabled:bg-slate-300"
            >
              {savingPrompt ? '저장 중...' : '저장'}
            </button>
          </div>
        </section>

        <section className="premium-card p-6 space-y-4">
          <h2 className="font-black text-lg">세션 목록</h2>
          {sessions.length === 0 && <p className="text-sm text-slate-400">세션이 없습니다.</p>}
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => setSelectedSessionId(session.id)}
              className={`w-full text-left p-4 rounded-2xl border ${selectedSessionId === session.id ? 'border-brand-500 bg-brand-50' : 'border-slate-100 bg-white'}`}
            >
              <p className="text-xs text-slate-500">{new Date(session.started_at).toLocaleString()}</p>
              <p className="text-sm font-bold text-slate-900 mt-1">{session.session_summary || '요약 없음'}</p>
              <p className="text-xs text-slate-600 mt-1">tone: {session.tone_level}</p>
              <p className="text-xs text-slate-600">tags: {(session.topic_tags || []).join(', ') || '-'}</p>
            </button>
          ))}
        </section>

        <section className="premium-card p-6">
          <h2 className="font-black text-lg mb-4">세션 원문</h2>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2">
            {sessionMessages.length === 0 && <p className="text-sm text-slate-400">메시지가 없습니다.</p>}
            {sessionMessages.map((message) => (
              <div key={message.id} className={`p-3 rounded-xl text-sm ${message.role === 'user' ? 'bg-brand-900 text-white ml-8' : 'bg-slate-100 text-slate-800 mr-8'}`}>
                <p className="text-[10px] opacity-70 mb-1">{message.role} · {new Date(message.created_at).toLocaleTimeString()}</p>
                <p>{message.content}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

export default ParentDashboard;

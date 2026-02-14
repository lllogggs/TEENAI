import React, { useState, useEffect, useMemo } from 'react';
import { User, ChatSession, MessageRow, SafetyAlert, StudentSettings } from '../types';
import { supabase } from '../utils/supabase';

interface ParentDashboardProps {
  user: User;
  onLogout: () => void;
}

interface ConnectedStudent {
  user_id: string;
  parent_user_id?: string;
  settings: StudentSettings;
}

interface StudentAccount {
  name: string;
  email: string;
}

const ParentDashboard: React.FC<ParentDashboardProps> = ({ user, onLogout }) => {
  const [connectedStudents, setConnectedStudents] = useState<ConnectedStudent[]>([]);
  const [studentAccounts, setStudentAccounts] = useState<Record<string, StudentAccount>>({});
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [sessionMessages, setSessionMessages] = useState<MessageRow[]>([]);
  const [stylePrompt, setStylePrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  const selectedStudent = useMemo(
    () => connectedStudents.find((student) => student.user_id === selectedStudentId) || null,
    [connectedStudents, selectedStudentId]
  );

  useEffect(() => {
    const fetchStudents = async () => {
      const { data: profiles, error: profileError } = await supabase
        .from('student_profiles')
        .select('user_id, settings, parent_user_id')
        .eq('parent_user_id', user.id);

      if (profileError) {
        console.error('student_profiles fetch error:', profileError);
        setLoading(false);
        return;
      }

      const mappedProfiles: ConnectedStudent[] = (profiles || []).map((profile) => ({
        user_id: profile.user_id,
        parent_user_id: profile.parent_user_id || undefined,
        settings: (profile.settings as StudentSettings) || {},
      }));
      setConnectedStudents(mappedProfiles);

      const studentIds = mappedProfiles.map((profile) => profile.user_id);
      if (!studentIds.length) {
        setStudentAccounts({});
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

      const accountMap = (usersData || []).reduce<Record<string, StudentAccount>>((acc, account) => {
        acc[account.id] = {
          name: account.name,
          email: account.email,
        };
        return acc;
      }, {});

      setStudentAccounts(accountMap);
      setSelectedStudentId(studentIds[0] || '');
      setLoading(false);
    };

    fetchStudents();
  }, [user.id]);

  useEffect(() => {
    const fetchStudentData = async () => {
      if (!selectedStudentId) {
        setSessions([]);
        setAlerts([]);
        setSelectedSessionId('');
        return;
      }

      const [sessionsResult, alertsResult] = await Promise.all([
        supabase
          .from('chat_sessions')
          .select('*')
          .eq('student_id', selectedStudentId)
          .order('started_at', { ascending: false }),
        supabase
          .from('safety_alerts')
          .select('*')
          .eq('student_id', selectedStudentId)
          .order('created_at', { ascending: false }),
      ]);

      if (sessionsResult.error) {
        console.error('chat_sessions fetch error:', sessionsResult.error);
        setSessions([]);
      } else {
        const fetchedSessions = (sessionsResult.data || []) as ChatSession[];
        setSessions(fetchedSessions);
        setSelectedSessionId(fetchedSessions[0]?.id || '');
      }

      if (alertsResult.error) {
        console.error('safety_alerts fetch error:', alertsResult.error);
        setAlerts([]);
      } else {
        setAlerts((alertsResult.data || []) as SafetyAlert[]);
      }
    };

    fetchStudentData();
  }, [selectedStudentId]);

  useEffect(() => {
    const profileStylePrompt = selectedStudent?.settings?.ai_style_prompt || '';
    setStylePrompt(profileStylePrompt);
    setSaveStatus('');
  }, [selectedStudent]);

  useEffect(() => {
    const fetchMessages = async () => {
      if (!selectedSessionId) {
        setSessionMessages([]);
        return;
      }

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('session_id', selectedSessionId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('messages fetch error:', error);
        setSessionMessages([]);
        return;
      }

      setSessionMessages((data || []) as MessageRow[]);
    };

    fetchMessages();
  }, [selectedSessionId]);

  const saveStylePrompt = async () => {
    if (!selectedStudentId || !selectedStudent) return;

    setSavingPrompt(true);
    setSaveStatus('');
    const mergedSettings: StudentSettings = {
      ...(selectedStudent.settings || {}),
      ai_style_prompt: stylePrompt,
    };

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

    setConnectedStudents((prev) =>
      prev.map((student) =>
        student.user_id === selectedStudentId
          ? { ...student, settings: mergedSettings }
          : student
      )
    );

    setSaveStatus('Saved');
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
          {connectedStudents.length === 0 && <p className="text-sm text-slate-400">아직 연결된 학생이 없습니다.</p>}
          {connectedStudents.length > 0 && (
            <select
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
            >
              {connectedStudents.map((student) => (
                <option key={student.user_id} value={student.user_id}>
                  {(studentAccounts[student.user_id]?.name || 'Unknown')} ({studentAccounts[student.user_id]?.email || student.user_id})
                </option>
              ))}
            </select>
          )}

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
            {saveStatus && <p className="text-xs text-emerald-600 mt-2 font-bold">{saveStatus}</p>}
          </div>

          <div className="pt-4 border-t border-slate-100">
            <h3 className="font-bold text-sm mb-2">안전 알림</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {alerts.length === 0 && <p className="text-xs text-slate-400">안전 알림이 없습니다.</p>}
              {alerts.map((alert) => (
                <div key={alert.id} className="bg-amber-50 border border-amber-100 rounded-lg p-2">
                  <p className="text-xs text-amber-700">{new Date(alert.created_at).toLocaleString()}</p>
                  <p className="text-xs text-slate-700 mt-1">{alert.message}</p>
                </div>
              ))}
            </div>
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

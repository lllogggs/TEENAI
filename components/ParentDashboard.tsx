import React, { useEffect, useMemo, useState } from 'react';
import { User, ChatSession, MessageRow, StudentSettings } from '../types';
import { supabase } from '../utils/supabase';

interface ParentDashboardProps {
  user: User;
  onLogout: () => void;
}

type StabilityFilter = 'all' | 'stable' | 'normal' | 'caution';
type MentorTone = 'warm' | 'rational' | 'friendly';

interface StudentItem {
  user_id: string;
  parent_user_id?: string;
  settings: StudentSettings;
}

const guardrailsMeta = [
  { key: 'block_inappropriate', label: '성범죄 및 부적절 대화 차단' },
  { key: 'self_directed', label: '자기주도 학습 모드' },
  { key: 'anti_overuse', label: 'AI 과몰입 방지 시스템' },
  { key: 'language_filter', label: '바른 언어 생활 필터링' },
] as const;

const toneOptions: { value: MentorTone; label: string }[] = [
  { value: 'warm', label: '다정한 멘토' },
  { value: 'rational', label: '이성적인 멘토' },
  { value: 'friendly', label: '친근한 멘토' },
];

const ParentDashboard: React.FC<ParentDashboardProps> = ({ user, onLogout }) => {
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [studentNames, setStudentNames] = useState<Record<string, string>>({});
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [filter, setFilter] = useState<StabilityFilter>('all');
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [promptInput, setPromptInput] = useState('');

  const selectedStudent = students.find((s) => s.user_id === selectedStudentId);
  const settings = (selectedStudent?.settings || {}) as StudentSettings;
  const guardrails = (settings.guardrails as Record<string, boolean>) || {};
  const mentorTone = (settings.mentor_tone || settings.mentor_style || 'warm') as MentorTone;

  const filteredSessions = useMemo(() => {
    if (filter === 'all') return sessions;
    return sessions.filter((s) => (s.stability_label || 'stable') === filter);
  }, [sessions, filter]);

  const stabilityCount = useMemo(() => ({
    stable: sessions.filter((s) => (s.stability_label || 'stable') === 'stable').length,
    normal: sessions.filter((s) => (s.stability_label || 'stable') === 'normal').length,
    caution: sessions.filter((s) => (s.stability_label || 'stable') === 'caution').length,
  }), [sessions]);

  const fetchStudents = async () => {
    const { data: profiles } = await supabase.from('student_profiles').select('user_id,parent_user_id,settings').eq('parent_user_id', user.id);
    const rows = (profiles || []) as StudentItem[];
    setStudents(rows);
    if (!selectedStudentId && rows[0]) setSelectedStudentId(rows[0].user_id);

    const ids = rows.map((r) => r.user_id);
    if (!ids.length) return;
    const { data: users } = await supabase.from('users').select('id,name').in('id', ids);
    const map = (users || []).reduce<Record<string, string>>((acc, item: any) => ({ ...acc, [item.id]: item.name }), {});
    setStudentNames(map);
  };

  const fetchSessions = async (studentId: string) => {
    const { data } = await supabase.from('chat_sessions').select('*').eq('student_id', studentId).order('last_message_at', { ascending: false });
    const rows = (data || []) as ChatSession[];
    setSessions(rows);
    if (!selectedSessionId && rows[0]) setSelectedSessionId(rows[0].id);

    const missing = rows.filter((s) => !(s.summary || s.session_summary));
    if (missing.length) {
      const { data: auth } = await supabase.auth.getSession();
      const token = auth.session?.access_token;
      await Promise.all(missing.slice(0, 3).map((session) => fetch('/api/summarize-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ session_id: session.id }),
      })));
      const { data: refreshed } = await supabase.from('chat_sessions').select('*').eq('student_id', studentId).order('last_message_at', { ascending: false });
      setSessions((refreshed || []) as ChatSession[]);
    }
  };

  useEffect(() => { fetchStudents(); }, []);
  useEffect(() => { if (selectedStudentId) fetchSessions(selectedStudentId); }, [selectedStudentId]);

  useEffect(() => {
    if (!selectedSessionId) return setMessages([]);
    supabase.from('messages').select('*').eq('session_id', selectedSessionId).order('created_at', { ascending: true })
      .then(({ data }) => setMessages((data || []) as MessageRow[]));
  }, [selectedSessionId]);

  const updateSettings = async (next: StudentSettings) => {
    if (!selectedStudentId) return;
    await supabase.from('student_profiles').update({ settings: next }).eq('user_id', selectedStudentId);
    setStudents((prev) => prev.map((s) => (s.user_id === selectedStudentId ? { ...s, settings: next } : s)));
  };

  const toggleGuardrail = async (key: string) => {
    const next: StudentSettings = {
      ...settings,
      guardrails: { ...guardrails, [key]: !guardrails[key] },
    };
    await updateSettings(next);
  };

  const saveTone = async (tone: MentorTone) => {
    await updateSettings({ ...settings, mentor_tone: tone });
  };

  const savePrompt = async () => {
    await updateSettings({ ...settings, ai_style_prompt: promptInput });
  };

  useEffect(() => { setPromptInput(settings.ai_style_prompt || ''); }, [selectedStudentId]);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 flex items-center justify-between">
        <h1 className="font-black text-lg">Parent Dashboard</h1>
        <button onClick={onLogout} className="text-sm text-slate-500">Logout</button>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <section className="premium-card p-4">
          <p className="text-sm text-slate-500 mb-2">학생 선택</p>
          <select value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)} className="border rounded-lg px-3 py-2">
            {students.map((student) => (
              <option key={student.user_id} value={student.user_id}>{studentNames[student.user_id] || student.user_id}</option>
            ))}
          </select>
        </section>

        <section className="premium-card p-4">
          <h2 className="font-black mb-3">1) 심리 안정도 통계</h2>
          <div className="grid grid-cols-3 gap-2">
            {['stable', 'normal', 'caution'].map((label) => (
              <button key={label} onClick={() => setFilter((prev) => prev === label ? 'all' : label as StabilityFilter)} className={`p-3 rounded-lg border ${filter === label ? 'bg-brand-900 text-white' : 'bg-white'}`}>
                <p className="font-bold">{label === 'stable' ? '안정' : label === 'normal' ? '보통' : '주의'}</p>
                <p className="text-xs">{stabilityCount[label as 'stable' | 'normal' | 'caution']}건</p>
              </button>
            ))}
          </div>
        </section>

        <section className="premium-card p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <h2 className="font-black mb-3">2) 활동 타임라인</h2>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {filteredSessions.map((session) => (
                <button key={session.id} onClick={() => setSelectedSessionId(session.id)} className={`w-full text-left p-3 rounded-lg border ${selectedSessionId === session.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'}`}>
                  <p className="text-sm font-bold">{session.summary || session.session_summary || '요약 생성 중...'}</p>
                  <p className="text-xs text-slate-500">{new Date(session.last_message_at || session.started_at).toLocaleString()} · {(session.stability_label || 'stable').toUpperCase()}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <h3 className="font-bold mb-2">세션 상세</h3>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {messages.map((m) => (
                <div key={m.id} className={`p-3 rounded-lg text-sm ${m.role === 'user' ? 'bg-brand-900 text-white ml-8' : 'bg-slate-100 mr-8'}`}>
                  <p>{m.content}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="premium-card p-4">
          <h2 className="font-black mb-3">3) 필수 안심 가드레일</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {guardrailsMeta.map((item) => (
              <label key={item.key} className="flex items-center justify-between border rounded-lg p-3 bg-white">
                <span className="text-sm">{item.label}</span>
                <input type="checkbox" checked={Boolean(guardrails[item.key])} onChange={() => toggleGuardrail(item.key)} />
              </label>
            ))}
          </div>
        </section>

        <section className="premium-card p-4">
          <h2 className="font-black mb-3">4) 멘토 말투 성향</h2>
          <div className="flex gap-2 flex-wrap">
            {toneOptions.map((tone) => (
              <button key={tone.value} onClick={() => saveTone(tone.value)} className={`px-3 py-2 rounded-lg border ${mentorTone === tone.value ? 'bg-brand-900 text-white' : 'bg-white'}`}>{tone.label}</button>
            ))}
          </div>
        </section>

        <section className="premium-card p-4">
          <h2 className="font-black mb-3">5) AI 개별 지시사항 관리</h2>
          <textarea value={promptInput} onChange={(e) => setPromptInput(e.target.value)} className="w-full border rounded-lg p-3 min-h-28" placeholder="학생별 AI 지시사항을 입력하세요." />
          <button onClick={savePrompt} className="mt-2 px-4 py-2 rounded-lg bg-brand-900 text-white">저장</button>
        </section>
      </main>
    </div>
  );
};

export default ParentDashboard;

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

type MentorStyle = 'kind' | 'rational' | 'friendly';

interface NormalizedSettings {
  guardrails: {
    block_harmful: boolean;
    self_directed: boolean;
    anti_overuse: boolean;
    language_filter: boolean;
  };
  mentor_style: MentorStyle;
  parent_instructions: string[];
  ai_style_prompt: string;
}

const DEFAULT_SETTINGS: NormalizedSettings = {
  guardrails: {
    block_harmful: true,
    self_directed: true,
    anti_overuse: true,
    language_filter: true,
  },
  mentor_style: 'kind',
  parent_instructions: [],
  ai_style_prompt: '',
};

const guardrailMeta: { key: keyof NormalizedSettings['guardrails']; label: string; description: string }[] = [
  {
    key: 'block_harmful',
    label: '성별·폭력 등 부적절 대화 차단',
    description: '민감하고 위험한 대화 주제를 자동 차단해요.',
  },
  {
    key: 'self_directed',
    label: '자기주도 학습 모드',
    description: '정답 제시 대신 스스로 생각할 수 있게 유도해요.',
  },
  {
    key: 'anti_overuse',
    label: 'AI 과몰입 방지 시스템',
    description: '장시간 사용 시 자연스럽게 휴식을 제안해요.',
  },
  {
    key: 'language_filter',
    label: '바른 언어 생활 필터링',
    description: '거친 표현을 완곡하고 건강한 표현으로 교정해요.',
  },
];

const mentorStyleOptions: { value: MentorStyle; label: string; description: string }[] = [
  { value: 'kind', label: '다정한 멘토', description: '따뜻하게 공감하고 부드럽게 안내해요.' },
  { value: 'rational', label: '이성적인 멘토', description: '차분하고 논리적인 흐름으로 정리해요.' },
  { value: 'friendly', label: '친근한 멘토', description: '편안하고 친근한 톤으로 대화해요.' },
];

const normalizeSettings = (settings?: StudentSettings | null): NormalizedSettings => {
  const guardrails = (settings?.guardrails as Record<string, unknown> | undefined) || {};
  const instructions = Array.isArray(settings?.parent_instructions)
    ? settings.parent_instructions.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const mentorStyle = settings?.mentor_style;

  return {
    guardrails: {
      block_harmful: typeof guardrails.block_harmful === 'boolean' ? guardrails.block_harmful : DEFAULT_SETTINGS.guardrails.block_harmful,
      self_directed: typeof guardrails.self_directed === 'boolean' ? guardrails.self_directed : DEFAULT_SETTINGS.guardrails.self_directed,
      anti_overuse: typeof guardrails.anti_overuse === 'boolean' ? guardrails.anti_overuse : DEFAULT_SETTINGS.guardrails.anti_overuse,
      language_filter: typeof guardrails.language_filter === 'boolean' ? guardrails.language_filter : DEFAULT_SETTINGS.guardrails.language_filter,
    },
    mentor_style: mentorStyle === 'kind' || mentorStyle === 'rational' || mentorStyle === 'friendly' ? mentorStyle : DEFAULT_SETTINGS.mentor_style,
    parent_instructions: instructions,
    ai_style_prompt: typeof settings?.ai_style_prompt === 'string' ? settings.ai_style_prompt : '',
  };
};

const toStudentSettings = (normalized: NormalizedSettings): StudentSettings => ({
  guardrails: normalized.guardrails,
  mentor_style: normalized.mentor_style,
  parent_instructions: normalized.parent_instructions,
  ai_style_prompt: normalized.ai_style_prompt,
});

const ParentDashboard: React.FC<ParentDashboardProps> = ({ user, onLogout }) => {
  const [connectedStudents, setConnectedStudents] = useState<ConnectedStudent[]>([]);
  const [studentAccounts, setStudentAccounts] = useState<Record<string, StudentAccount>>({});
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [sessionMessages, setSessionMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('');
  const [instructionInput, setInstructionInput] = useState('');
  const [activeTab, setActiveTab] = useState<'report' | 'settings'>('settings');

  const selectedStudent = useMemo(
    () => connectedStudents.find((student) => student.user_id === selectedStudentId) || null,
    [connectedStudents, selectedStudentId]
  );

  const normalizedSettings = useMemo(
    () => normalizeSettings(selectedStudent?.settings),
    [selectedStudent]
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
        settings: toStudentSettings(normalizeSettings(profile.settings as StudentSettings)),
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

      const { data: profile, error: profileError } = await supabase
        .from('student_profiles')
        .select('settings,parent_user_id,user_id')
        .eq('user_id', selectedStudentId)
        .single();

      if (profileError) {
        console.error('student_profiles selected fetch error:', profileError);
      } else if (profile) {
        const fetchedSettings = toStudentSettings(normalizeSettings(profile.settings as StudentSettings));
        setConnectedStudents((prev) =>
          prev.map((student) => (student.user_id === selectedStudentId ? { ...student, settings: fetchedSettings } : student))
        );
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

  const updateStudentSettings = async (nextSettings: NormalizedSettings) => {
    if (!selectedStudentId) return;
    setSaveStatus('');

    const previousStudents = connectedStudents;
    const mergedSettings = toStudentSettings(nextSettings);

    setConnectedStudents((prev) =>
      prev.map((student) =>
        student.user_id === selectedStudentId
          ? { ...student, settings: mergedSettings }
          : student
      )
    );

    const { error } = await supabase
      .from('student_profiles')
      .update({ settings: mergedSettings })
      .eq('user_id', selectedStudentId);

    if (error) {
      console.error('student_profiles update error:', error);
      setConnectedStudents(previousStudents);
      alert('설정 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    setSaveStatus('저장되었습니다.');
  };

  const toggleGuardrail = async (key: keyof NormalizedSettings['guardrails']) => {
    const nextSettings: NormalizedSettings = {
      ...normalizedSettings,
      guardrails: {
        ...normalizedSettings.guardrails,
        [key]: !normalizedSettings.guardrails[key],
      },
    };
    await updateStudentSettings(nextSettings);
  };

  const updateMentorStyle = async (style: MentorStyle) => {
    const nextSettings: NormalizedSettings = {
      ...normalizedSettings,
      mentor_style: style,
    };
    await updateStudentSettings(nextSettings);
  };

  const addInstruction = async () => {
    const trimmed = instructionInput.trim();
    if (!trimmed) return;
    const nextSettings: NormalizedSettings = {
      ...normalizedSettings,
      parent_instructions: [...normalizedSettings.parent_instructions, trimmed],
    };

    setInstructionInput('');
    await updateStudentSettings(nextSettings);
  };

  const deleteInstruction = async (index: number) => {
    const nextSettings: NormalizedSettings = {
      ...normalizedSettings,
      parent_instructions: normalizedSettings.parent_instructions.filter((_, idx) => idx !== index),
    };
    await updateStudentSettings(nextSettings);
  };

  const activeGuardrails = guardrailMeta.filter((item) => normalizedSettings.guardrails[item.key]);
  const mentorStyleLabel = mentorStyleOptions.find((option) => option.value === normalizedSettings.mentor_style)?.label || '다정한 멘토';

  if (loading) return <div className="h-screen flex items-center justify-center font-black animate-pulse text-brand-900">데이터 동기화 중...</div>;

  return (
    <div className="min-h-screen bg-[#F4F7FC]">
      <nav className="sticky top-0 z-40 px-8 md:px-10 py-6 flex justify-between items-center bg-white/90 backdrop-blur-xl border-b border-slate-100">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">TEENAI <span className="text-[10px] bg-brand-900 text-white px-2 py-0.5 rounded ml-1 uppercase tracking-tighter">Parent</span></h1>
        <button onClick={onLogout} className="bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 p-3 rounded-2xl transition-all">Logout</button>
      </nav>

      <main className="max-w-7xl mx-auto px-5 md:px-8 lg:px-10 py-8 md:py-10 space-y-6">
        <section className="premium-card p-4 md:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            {connectedStudents.length === 0 && <p className="text-sm text-slate-400">연결된 학생이 없습니다.</p>}
            {connectedStudents.map((student) => {
              const account = studentAccounts[student.user_id];
              const isActive = selectedStudentId === student.user_id;
              return (
                <button
                  key={student.user_id}
                  onClick={() => setSelectedStudentId(student.user_id)}
                  className={`px-4 py-2.5 rounded-full text-sm font-bold border transition-all ${
                    isActive
                      ? 'bg-brand-900 text-white border-brand-900 shadow-md shadow-brand-900/20'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-brand-300'
                  }`}
                >
                  {account?.name || 'Unknown 학생'}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 bg-slate-100 rounded-full p-1">
            <button
              onClick={() => setActiveTab('report')}
              className={`px-4 py-2 rounded-full text-xs md:text-sm font-bold ${activeTab === 'report' ? 'bg-white text-slate-900 shadow' : 'text-slate-500'}`}
            >
              성장 리포트
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-2 rounded-full text-xs md:text-sm font-bold ${activeTab === 'settings' ? 'bg-brand-900 text-white shadow' : 'text-slate-500'}`}
            >
              AI 안심 설정
            </button>
          </div>
        </section>

        {activeTab === 'settings' && (
          <>
            <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <article className="premium-card p-6 md:p-7">
                <h2 className="text-lg md:text-xl font-black text-slate-900 mb-5">필수 안심 가드레일</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {guardrailMeta.map((item) => {
                    const enabled = normalizedSettings.guardrails[item.key];
                    return (
                      <div key={item.key} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold text-sm text-slate-900">{item.label}</p>
                            <p className="text-xs text-slate-500 mt-1">{item.description}</p>
                          </div>
                          <button
                            disabled={!selectedStudentId}
                            onClick={() => toggleGuardrail(item.key)}
                            className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${enabled ? 'bg-brand-900' : 'bg-slate-300'} disabled:opacity-50`}
                          >
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>

              <article className="premium-card p-6 md:p-7">
                <h2 className="text-lg md:text-xl font-black text-slate-900 mb-5">멘토 말투 성향</h2>
                <div className="space-y-3">
                  {mentorStyleOptions.map((option) => {
                    const checked = normalizedSettings.mentor_style === option.value;
                    return (
                      <button
                        key={option.value}
                        onClick={() => updateMentorStyle(option.value)}
                        disabled={!selectedStudentId}
                        className={`w-full text-left rounded-2xl border p-4 transition ${checked ? 'border-brand-900 bg-brand-50' : 'border-slate-200 bg-white hover:border-brand-300'} disabled:opacity-50`}
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-slate-900">{option.label}</p>
                          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${checked ? 'border-brand-900' : 'border-slate-300'}`}>
                            {checked && <span className="w-2.5 h-2.5 bg-brand-900 rounded-full" />}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{option.description}</p>
                      </button>
                    );
                  })}
                </div>
              </article>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <article className="premium-card p-6 md:p-7">
                <h2 className="text-lg md:text-xl font-black text-slate-900 mb-4">AI 개별 지시사항 관리</h2>
                <div className="flex gap-2 mb-4">
                  <input
                    value={instructionInput}
                    onChange={(e) => setInstructionInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addInstruction()}
                    placeholder="예) 답변 마지막에는 항상 실천 질문 1개 추가"
                    className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                  <button onClick={addInstruction} className="px-4 py-2 rounded-xl bg-brand-900 text-white text-sm font-bold">추가</button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {normalizedSettings.parent_instructions.length === 0 && (
                    <p className="text-sm text-slate-400">등록된 지시사항이 없습니다.</p>
                  )}
                  {normalizedSettings.parent_instructions.map((instruction, index) => (
                    <div key={`${instruction}-${index}`} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                      <span className="text-xs font-black text-brand-900 mt-1">{index + 1}.</span>
                      <p className="flex-1 text-sm text-slate-700">{instruction}</p>
                      <button onClick={() => deleteInstruction(index)} className="text-xs font-bold text-red-500 hover:text-red-700">삭제</button>
                    </div>
                  ))}
                </div>
                {saveStatus && <p className="text-xs text-emerald-600 mt-3 font-bold">{saveStatus}</p>}
              </article>

              <article className="premium-card p-6 md:p-7 bg-slate-900 text-white">
                <h2 className="text-lg md:text-xl font-black mb-4">AI 실시간 운영 엔진 상태</h2>

                <div className="space-y-4 text-sm">
                  <div>
                    <p className="text-slate-300 text-xs mb-2">활성 가드레일 리스트</p>
                    {activeGuardrails.length === 0 ? (
                      <p className="text-slate-100">활성화된 가드레일이 없습니다.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {activeGuardrails.map((item) => (
                          <li key={item.key} className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />{item.label}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <p className="text-slate-300 text-xs mb-1">현재 멘토 말투</p>
                    <p className="font-bold">{mentorStyleLabel}</p>
                  </div>

                  <div>
                    <p className="text-slate-300 text-xs mb-1">현재 적용 중인 개별 지시사항</p>
                    {normalizedSettings.parent_instructions.length === 0 ? (
                      <p>적용 중인 지시사항 없음</p>
                    ) : (
                      <>
                        <p className="font-bold">총 {normalizedSettings.parent_instructions.length}개 적용 중</p>
                        <p className="text-slate-200 text-xs mt-1 line-clamp-2">{normalizedSettings.parent_instructions.slice(0, 2).join(' / ')}</p>
                      </>
                    )}
                  </div>
                </div>
              </article>
            </section>
          </>
        )}

        {activeTab === 'report' && (
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <article className="premium-card p-6 space-y-4">
              <h2 className="font-black text-lg">안전 알림</h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {alerts.length === 0 && <p className="text-xs text-slate-400">안전 알림이 없습니다.</p>}
                {alerts.map((alert) => (
                  <div key={alert.id} className="bg-amber-50 border border-amber-100 rounded-lg p-2">
                    <p className="text-xs text-amber-700">{new Date(alert.created_at).toLocaleString()}</p>
                    <p className="text-xs text-slate-700 mt-1">{alert.message}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="premium-card p-6 space-y-4">
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
            </article>

            <article className="premium-card p-6">
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
            </article>
          </section>
        )}
      </main>
    </div>
  );
};

export default ParentDashboard;

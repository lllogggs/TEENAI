import React, { useState, useEffect, useMemo } from 'react';
import { User, ChatSession, StudentSettings, SessionRiskLevel } from '../types';
import { supabase } from '../utils/supabase';

interface ParentDashboardProps {
  user: User;
  onLogout: () => void;
  onOpenSession: (sessionId: string) => void;
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

type MentorTone = 'kind' | 'rational' | 'friendly';

interface NormalizedSettings {
  guardrails: {
    sexual_block: boolean;
    self_directed_mode: boolean;
    overuse_prevent: boolean;
    clean_language: boolean;
  };
  mentor_tone: MentorTone;
  ai_style_prompt: string;
}

const DEFAULT_SETTINGS: NormalizedSettings = {
  guardrails: {
    sexual_block: true,
    self_directed_mode: true,
    overuse_prevent: true,
    clean_language: true,
  },
  mentor_tone: 'kind',
  ai_style_prompt: '',
};

const guardrailMeta: { key: keyof NormalizedSettings['guardrails']; label: string; description: string }[] = [
  { key: 'sexual_block', label: '성범죄/부적절 대화 차단', description: '민감하고 위험한 대화를 우선 차단해요.' },
  { key: 'self_directed_mode', label: '자기주도 학습 모드', description: '정답 대신 스스로 생각할 수 있도록 유도해요.' },
  { key: 'overuse_prevent', label: 'AI 과몰입 방지', description: '장시간 이용 시 자연스럽게 휴식을 제안해요.' },
  { key: 'clean_language', label: '바른 언어 생활 필터링', description: '거친 표현을 건강한 표현으로 정리해요.' },
];

const mentorToneOptions: { value: MentorTone; label: string; description: string }[] = [
  { value: 'kind', label: '다정한', description: '따뜻하고 공감 중심' },
  { value: 'rational', label: '이성적인', description: '차분하고 논리 중심' },
  { value: 'friendly', label: '친근한', description: '가볍고 편안한 대화' },
];

const riskChipColor: Record<SessionRiskLevel, string> = {
  stable: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  normal: 'bg-amber-50 text-amber-700 border-amber-100',
  caution: 'bg-rose-50 text-rose-700 border-rose-100',
  warn: 'bg-rose-100 text-rose-800 border-rose-200',
  high: 'bg-red-100 text-red-800 border-red-200',
};

const riskText: Record<SessionRiskLevel, string> = {
  stable: '안정',
  normal: '보통',
  caution: '주의',
  warn: '경고',
  high: '위험',
};

const normalizeSettings = (settings?: StudentSettings | null): NormalizedSettings => {
  const guardrails = (settings?.guardrails as Record<string, unknown> | undefined) || {};
  const mentorTone = settings?.mentor_tone || settings?.mentor_style;

  return {
    guardrails: {
      sexual_block:
        typeof guardrails.sexual_block === 'boolean'
          ? guardrails.sexual_block
          : typeof guardrails.block_harmful === 'boolean'
            ? guardrails.block_harmful
            : DEFAULT_SETTINGS.guardrails.sexual_block,
      self_directed_mode:
        typeof guardrails.self_directed_mode === 'boolean'
          ? guardrails.self_directed_mode
          : typeof guardrails.self_directed === 'boolean'
            ? guardrails.self_directed
            : DEFAULT_SETTINGS.guardrails.self_directed_mode,
      overuse_prevent:
        typeof guardrails.overuse_prevent === 'boolean'
          ? guardrails.overuse_prevent
          : typeof guardrails.anti_overuse === 'boolean'
            ? guardrails.anti_overuse
            : DEFAULT_SETTINGS.guardrails.overuse_prevent,
      clean_language:
        typeof guardrails.clean_language === 'boolean'
          ? guardrails.clean_language
          : typeof guardrails.language_filter === 'boolean'
            ? guardrails.language_filter
            : DEFAULT_SETTINGS.guardrails.clean_language,
    },
    mentor_tone: mentorTone === 'kind' || mentorTone === 'rational' || mentorTone === 'friendly' ? mentorTone : DEFAULT_SETTINGS.mentor_tone,
    ai_style_prompt: typeof settings?.ai_style_prompt === 'string' ? settings.ai_style_prompt : '',
  };
};

const toStudentSettings = (normalized: NormalizedSettings): StudentSettings => ({
  guardrails: normalized.guardrails,
  mentor_tone: normalized.mentor_tone,
  mentor_style: normalized.mentor_tone,
  ai_style_prompt: normalized.ai_style_prompt,
});

const SESSION_SELECT = 'id, student_id, started_at, title, title_source, title_updated_at, last_activity_at, closed_at, summary, risk_level, tone_level, topic_tags, output_types, student_intent, ai_intervention';

const fetchSessionsByStudentIds = async (studentIds: string[]) => {
  return supabase
    .from('chat_sessions')
    .select(SESSION_SELECT)
    .in('student_id', studentIds)
    .order('started_at', { ascending: false })
    .limit(50);
};

const formatSessionFallbackDate = (startedAt: string) => {
  const date = new Date(startedAt);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `대화 ${yyyy}-${mm}-${dd}`;
};

const ParentDashboard: React.FC<ParentDashboardProps> = ({ user, onLogout, onOpenSession }) => {
  const [connectedStudents, setConnectedStudents] = useState<ConnectedStudent[]>([]);
  const [studentAccounts, setStudentAccounts] = useState<Record<string, StudentAccount>>({});
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [riskFilter, setRiskFilter] = useState<SessionRiskLevel | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [summaryStatus, setSummaryStatus] = useState<Record<string, string>>({});

  const selectedStudent = useMemo(
    () => connectedStudents.find((student) => student.user_id === selectedStudentId) || null,
    [connectedStudents, selectedStudentId]
  );

  const normalizedSettings = useMemo(() => normalizeSettings(selectedStudent?.settings), [selectedStudent]);

  const getStudentDisplayName = (studentId: string) => {
    const profile = connectedStudents.find((student) => student.user_id === studentId);
    const parentDisplayName = (profile?.settings?.parent_display_name as string | undefined)?.trim();
    if (parentDisplayName) return parentDisplayName;
    return studentAccounts[studentId]?.name || studentId;
  };

  useEffect(() => {
    setDisplayNameInput(getStudentDisplayName(selectedStudentId));
    setEditingDisplayName(false);
    setSaveStatus('');
  }, [selectedStudentId, connectedStudents]);

  const filteredSessions = useMemo(() => sessions.filter((session) => {
    if (selectedStudentId && session.student_id !== selectedStudentId) return false;
    if (riskFilter === 'all') return true;
    return (session.risk_level || 'normal') === riskFilter;
  }), [sessions, riskFilter, selectedStudentId]);

  const riskStats = useMemo(() => {
    const counts: Record<SessionRiskLevel, number> = { stable: 0, normal: 0, caution: 0, warn: 0, high: 0 };
    sessions.forEach((session) => {
      const level = session.risk_level || 'normal';
      counts[level] += 1;
    });

    const maxCount = Math.max(counts.stable, counts.normal, counts.caution, counts.warn, counts.high, 1);
    return { counts, maxCount };
  }, [sessions]);

  useEffect(() => {
    const fetchInviteCode = async () => {
      const { data: userRow } = await supabase
        .from('users')
        .select('my_invite_code, role')
        .eq('id', user.id)
        .single();

      let resolvedCode = userRow?.role === 'parent' ? userRow?.my_invite_code || '' : '';
      if (!resolvedCode) {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        const response = await fetch('/api/ensure-invite-code', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
        });

        if (response.ok) {
          const payload = await response.json();
          resolvedCode = payload.code || '';
        }
      }
      setInviteCode((resolvedCode || '').toUpperCase());
    };
    fetchInviteCode();
  }, [user.id]);

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
        setLoading(false);
        return;
      }

      const { data: usersData } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', studentIds);

      const accountMap = (usersData || []).reduce<Record<string, StudentAccount>>((acc, account) => {
        acc[account.id] = { name: account.name, email: account.email };
        return acc;
      }, {});

      setStudentAccounts(accountMap);
      setSelectedStudentId(studentIds[0] || '');
      setLoading(false);
    };

    fetchStudents();
  }, [user.id]);

  useEffect(() => {
    const fetchSessions = async () => {
      const studentIds = connectedStudents.map((student) => student.user_id);
      if (!studentIds.length) {
        setSessions([]);
        return;
      }

      const { data, error } = await fetchSessionsByStudentIds(studentIds);
      if (error) {
        console.error('chat_sessions fetch error in parent dashboard:', error);
        setSessions([]);
        return;
      }

      setSessions((data || []) as ChatSession[]);

      const missingSummarySessions = ((data || []) as ChatSession[])
        .filter((session) => !session.summary?.trim())
        .slice(0, 5);

      if (!missingSummarySessions.length) return;

      try {
        const nextStatus: Record<string, string> = {};
        const { data: authData } = await supabase.auth.getSession();
        const accessToken = authData.session?.access_token;
        await Promise.all(missingSummarySessions.map(async (session) => {
          const response = await fetch('/api/session-summary', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: JSON.stringify({
              sessionId: session.id,
              force: !session.summary?.trim() && !!session.last_activity_at && (Date.now() - new Date(session.last_activity_at).getTime()) >= 3600_000,
            }),
          });

          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            console.error('session summary backfill failed:', { sessionId: session.id, status: response.status, payload });
            nextStatus[session.id] = '요약 생성 중';
            return;
          }

          const payload = await response.json().catch(() => ({}));
          if (payload?.skipped) {
            nextStatus[session.id] = '요약 생성 중';
          }
        }));

        const { data: refreshed, error: refreshError } = await fetchSessionsByStudentIds(studentIds);
        if (refreshError) {
          console.error('chat_sessions refresh fetch error in parent dashboard:', refreshError);
        }

        if (refreshed) {
          setSessions(refreshed as ChatSession[]);
        }
        setSummaryStatus(nextStatus);
      } catch (error) {
        console.error('session summary backfill request failed:', error);
      }
    };

    fetchSessions();
  }, [connectedStudents]);

  const updateStudentSettings = async (nextSettings: NormalizedSettings) => {
    if (!selectedStudentId) return;
    setSaveStatus('');

    const currentSettings = selectedStudent?.settings || {};
    const mergedSettings = {
      ...currentSettings,
      ...toStudentSettings(nextSettings),
      guardrails: {
        ...(currentSettings.guardrails as Record<string, unknown> | undefined),
        ...toStudentSettings(nextSettings).guardrails,
      },
    } as StudentSettings;

    const { error } = await supabase
      .from('student_profiles')
      .update({ settings: mergedSettings })
      .eq('user_id', selectedStudentId);

    if (error) {
      console.error('student_profiles update error:', error);
      return;
    }

    setConnectedStudents((prev) =>
      prev.map((student) =>
        student.user_id === selectedStudentId ? { ...student, settings: mergedSettings } : student
      )
    );
    setSaveStatus('저장되었습니다.');
  };

  const saveParentDisplayName = async () => {
    if (!selectedStudentId) return;

    const { data, error: selectError } = await supabase
      .from('student_profiles')
      .select('settings')
      .eq('user_id', selectedStudentId)
      .single();

    if (selectError) {
      console.error('student_profiles display name select error:', selectError);
      return;
    }

    const settings = {
      ...((data?.settings as StudentSettings) || {}),
      parent_display_name: displayNameInput.trim(),
    } as StudentSettings;

    const { error } = await supabase
      .from('student_profiles')
      .update({ settings })
      .eq('user_id', selectedStudentId);

    if (error) {
      console.error('student_profiles display name update error:', error);
      return;
    }

    setConnectedStudents((prev) => prev.map((student) => (
      student.user_id === selectedStudentId ? { ...student, settings } : student
    )));
    setEditingDisplayName(false);
    setSaveStatus('표시명이 저장되었습니다.');
  };

  const toggleGuardrail = async (key: keyof NormalizedSettings['guardrails']) => {
    await updateStudentSettings({
      ...normalizedSettings,
      guardrails: {
        ...normalizedSettings.guardrails,
        [key]: !normalizedSettings.guardrails[key],
      },
    });
  };

  const updateMentorTone = async (tone: MentorTone) => {
    await updateStudentSettings({ ...normalizedSettings, mentor_tone: tone });
  };

  const updateAiStylePrompt = async (prompt: string) => {
    await updateStudentSettings({ ...normalizedSettings, ai_style_prompt: prompt });
  };

  const copyInviteCode = async () => {
    if (!inviteCode) return;
    await navigator.clipboard.writeText(inviteCode);
  };

  if (loading) return <div className="h-screen flex items-center justify-center font-black animate-pulse text-brand-900">데이터 동기화 중...</div>;

  return (
    <div className="min-h-screen bg-[#F4F7FC]">
      <nav className="sticky top-0 z-40 px-5 md:px-10 py-5 md:py-6 flex justify-between items-center bg-white/90 backdrop-blur-xl border-b border-slate-100">
        <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">TEENAI <span className="text-[10px] bg-brand-900 text-white px-2 py-0.5 rounded ml-1 uppercase tracking-tighter">Parent</span></h1>
        <div className="flex items-center gap-2 md:gap-3 flex-wrap justify-end">
          <span className="text-xs md:text-sm font-bold text-slate-500">{user.name}</span>
          {!!inviteCode && (
            <div className="flex items-center gap-2 rounded-2xl border border-brand-100 bg-brand-50 px-3 py-2">
              <span className="text-[11px] md:text-xs font-black text-brand-900 whitespace-nowrap">학생 인증코드:</span>
              <span className="text-sm md:text-base font-black tracking-[0.18em] text-brand-900">{inviteCode}</span>
              <button onClick={copyInviteCode} className="text-[11px] md:text-xs font-black text-brand-700 hover:text-brand-900 bg-white px-2 py-1 rounded-lg border border-brand-100">복사</button>
            </div>
          )}
          <button onClick={onLogout} className="bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 p-3 rounded-2xl transition-all">Logout</button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-5 md:px-8 lg:px-10 py-8 md:py-10 space-y-6">
        <section className="premium-card p-4 md:p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {connectedStudents.length === 0 && <p className="text-sm text-slate-400">연결된 학생이 없습니다.</p>}
            {connectedStudents.map((student) => {
              const active = selectedStudentId === student.user_id;
              return (
                <div
                  key={student.user_id}
                  className={`px-4 py-2 rounded-full text-sm font-bold border transition-all flex items-center gap-2 ${active ? 'bg-brand-900 text-white border-brand-900 shadow-md shadow-brand-900/20' : 'bg-white text-slate-700 border-slate-200 hover:border-brand-300'}`}
                >
                  <button onClick={() => setSelectedStudentId(student.user_id)} className="font-bold">{getStudentDisplayName(student.user_id)}</button>
                  {active && (
                    <button
                      onClick={() => {
                        setEditingDisplayName((prev) => !prev);
                        setDisplayNameInput(getStudentDisplayName(student.user_id));
                      }}
                      className={`text-xs ${active ? 'text-white/80 hover:text-white' : 'text-slate-500'}`}
                      aria-label="표시명 편집"
                    >
                      ✏️
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {selectedStudentId && editingDisplayName && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={displayNameInput}
                onChange={(event) => setDisplayNameInput(event.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm"
                placeholder="부모 화면용 학생 표시명"
              />
              <button onClick={saveParentDisplayName} className="px-3 py-2 rounded-xl bg-brand-900 text-white text-xs font-black">저장</button>
            </div>
          )}

        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <article className="premium-card p-6 lg:col-span-1">
            <h2 className="font-black text-lg mb-4">심리 안정도 통계</h2>
            <div className="flex items-end justify-around gap-4 h-40 mb-4">
              {[
                { key: 'stable' as SessionRiskLevel, label: '안정', color: 'bg-emerald-500' },
                { key: 'normal' as SessionRiskLevel, label: '보통', color: 'bg-amber-500' },
                { key: 'caution' as SessionRiskLevel, label: '주의', color: 'bg-rose-500' },
              ].map((item) => {
                const count = riskStats.counts[item.key];
                const ratio = count / riskStats.maxCount;
                return (
                  <button key={item.key} onClick={() => setRiskFilter((prev) => (prev === item.key ? 'all' : item.key))} className={`flex-1 max-w-[88px] text-center rounded-2xl py-1 ${riskFilter === item.key ? 'bg-slate-100' : ''}`}>
                    <div className="h-24 flex items-end justify-center">
                      <div className={`w-10 rounded-2xl ${item.color} ${riskFilter === item.key ? 'ring-2 ring-brand-700 ring-offset-2' : ''}`} style={{ height: `${Math.max(10, Math.round(ratio * 100))}%` }} />
                    </div>
                    <p className="mt-2 text-xs font-black text-slate-700">{item.label}</p>
                    <p className="text-[11px] text-slate-400 font-bold">{count}건</p>
                  </button>
                );
              })}
            </div>
          </article>

          <article className="premium-card p-6 lg:col-span-2">
            <div className="flex items-center justify-between mb-4 gap-2">
              <h2 className="font-black text-lg">2) 활동 타임라인</h2>

            </div>
            <div className="space-y-3 max-h-[340px] overflow-y-auto custom-scrollbar pr-2">
              {filteredSessions.length === 0 && <p className="text-sm text-slate-400">조건에 맞는 대화가 없습니다.</p>}
              {filteredSessions.map((session) => {
                const level = session.risk_level || 'normal';
                return (
                  <button
                    key={session.id}
                    onClick={() => onOpenSession(session.id)}
                    className="w-full text-left p-4 rounded-2xl border transition-all border-slate-100 bg-white hover:border-brand-200"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-xs font-black text-slate-800">{session.title?.trim() || session.summary?.trim() || formatSessionFallbackDate(session.started_at)}</p>
                      <span className={`text-[10px] font-black px-2 py-1 rounded-full border ${riskChipColor[level]}`}>{riskText[level]}</span>
                    </div>
                    
                    <p className="text-xs text-slate-500 mb-2">{new Date(session.started_at).toLocaleString('ko-KR')}</p>
                    <p className="text-sm font-bold text-slate-900 line-clamp-2">{session.summary || '요약 생성 중'}</p>
                    {!session.summary && <p className="text-[11px] text-slate-400 mt-1">{summaryStatus[session.id] || '요약 생성 중'}</p>}
                  </button>
                );
              })}
            </div>
          </article>

          <article className="premium-card p-6 lg:col-span-2">
            <h2 className="font-black text-lg mb-4">3) AI 개별 지시사항 관리</h2>
            <textarea
              value={normalizedSettings.ai_style_prompt}
              onChange={(event) => {
                const value = event.target.value;
                setConnectedStudents((prev) =>
                  prev.map((student) =>
                    student.user_id === selectedStudentId
                      ? { ...student, settings: { ...student.settings, ...toStudentSettings({ ...normalizedSettings, ai_style_prompt: value }) } }
                      : student
                  )
                );
              }}
              placeholder="예: 아이가 불안해할 때는 짧고 명확하게 안심 문장을 먼저 말해 주세요."
              className="w-full min-h-36 rounded-2xl border border-slate-200 p-4 text-sm"
            />
            <button onClick={() => updateAiStylePrompt(normalizedSettings.ai_style_prompt)} className="mt-3 px-4 py-2 rounded-xl bg-brand-900 text-white text-sm font-bold">저장</button>
            {saveStatus && <p className="text-xs text-emerald-600 mt-2 font-bold">{saveStatus}</p>}
          </article>

          <article className="premium-card p-6 lg:col-span-1">
            <h2 className="font-black text-lg mb-4">4) 멘토 말투 성향</h2>
            <div className="space-y-2">
              {mentorToneOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => updateMentorTone(option.value)}
                  className={`w-full text-left px-4 py-3 rounded-2xl border ${normalizedSettings.mentor_tone === option.value ? 'bg-brand-50 border-brand-400 text-brand-900' : 'bg-white border-slate-100'}`}
                >
                  <p className="font-black text-sm">{option.label}</p>
                  <p className="text-xs text-slate-500 mt-1">{option.description}</p>
                </button>
              ))}
            </div>
          </article>

          <article className="premium-card p-6 lg:col-span-3">
            <h2 className="font-black text-lg mb-4">5) 필수 안심 가드레일</h2>
            <div className="space-y-3">
              {guardrailMeta.map((item) => {
                const enabled = normalizedSettings.guardrails[item.key];
                return (
                  <button key={item.key} onClick={() => toggleGuardrail(item.key)} className="w-full border border-slate-100 rounded-2xl p-4 text-left bg-white">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-black text-slate-900">{item.label}</p>
                        <p className="text-xs text-slate-500 mt-1">{item.description}</p>
                      </div>
                      <span className={`w-10 h-6 rounded-full transition-all ${enabled ? 'bg-brand-900' : 'bg-slate-300'} relative`}>
                        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${enabled ? 'left-5' : 'left-1'}`}></span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </article>
        </section>
      </main>
    </div>
  );
};

export default ParentDashboard;

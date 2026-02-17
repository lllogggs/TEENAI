import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, ChatSession, StudentSettings, SessionRiskLevel, MessageRow } from '../types';
import { supabase } from '../utils/supabase';

interface ParentDashboardProps {
  user: User;
  onLogout: () => void;
  onOpenSession?: (sessionId: string) => void;
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
      sexual_block: typeof guardrails.sexual_block === 'boolean' ? guardrails.sexual_block : DEFAULT_SETTINGS.guardrails.sexual_block,
      self_directed_mode: typeof guardrails.self_directed_mode === 'boolean' ? guardrails.self_directed_mode : DEFAULT_SETTINGS.guardrails.self_directed_mode,
      overuse_prevent: typeof guardrails.overuse_prevent === 'boolean' ? guardrails.overuse_prevent : DEFAULT_SETTINGS.guardrails.overuse_prevent,
      clean_language: typeof guardrails.clean_language === 'boolean' ? guardrails.clean_language : DEFAULT_SETTINGS.guardrails.clean_language,
    },
    mentor_tone: (['kind', 'rational', 'friendly'] as MentorTone[]).includes(mentorTone as MentorTone) ? (mentorTone as MentorTone) : DEFAULT_SETTINGS.mentor_tone,
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
    .order('last_activity_at', { ascending: false })
    .limit(50);
};

const formatSessionFallbackDate = (startedAt: string) => {
  const date = new Date(startedAt);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `대화 ${yyyy}-${mm}-${dd}`;
};

// [내부 컴포넌트] 대화 상세 뷰 (전체화면 모드)
const SessionDetailView: React.FC<{ sessionId: string; title: string; onClose: () => void }> = ({ sessionId, title, onClose }) => {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });
      
      if (!error && data) setMessages(data as MessageRow[]);
      setLoading(false);
    };
    load();
  }, [sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div>
            <h3 className="font-bold text-lg text-slate-900">{title}</h3>
            <p className="text-xs text-slate-400">전체 대화 기록</p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-[#F8FAFC]">
        {loading && <div className="text-center text-slate-400 py-10 animate-pulse">대화 내용을 불러오고 있어요...</div>}
        {!loading && messages.length === 0 && <p className="text-center text-slate-400 py-10">대화 내용이 없습니다.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-4 rounded-2xl text-[15px] leading-relaxed whitespace-pre-wrap shadow-sm ${m.role === 'user' ? 'bg-brand-900 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'}`}>
              {m.content}
            </div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>
    </div>
  );
};

const ParentDashboard: React.FC<ParentDashboardProps> = ({ user, onLogout }) => {
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
  
  // 현재 보고 있는 세션 ID (상세보기용)
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);

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

  // 초대 코드 로드
  useEffect(() => {
    const fetchInviteCode = async () => {
      const { data: userRow } = await supabase.from('users').select('my_invite_code, role').eq('id', user.id).single();
      let resolvedCode = userRow?.role === 'parent' ? userRow?.my_invite_code || '' : '';
      if (!resolvedCode) {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        const response = await fetch('/api/ensure-invite-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
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

  // 학생 데이터 및 세션 로드
  useEffect(() => {
    const fetchStudents = async () => {
      const { data: profiles, error: profileError } = await supabase
        .from('student_profiles')
        .select('user_id, settings, parent_user_id')
        .eq('parent_user_id', user.id);

      if (profileError) {
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

      const { data: usersData } = await supabase.from('users').select('id, name, email').in('id', studentIds);
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

  // 세션 목록 로드
  useEffect(() => {
    const fetchSessions = async () => {
      const studentIds = connectedStudents.map((student) => student.user_id);
      if (!studentIds.length) {
        setSessions([]);
        return;
      }

      const { data, error } = await fetchSessionsByStudentIds(studentIds);
      if (error) {
        setSessions([]);
        return;
      }

      setSessions((data || []) as ChatSession[]);

      // 요약 없는 세션 백그라운드 요청
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
            headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
            body: JSON.stringify({
              sessionId: session.id,
              force: !session.summary?.trim() && !!session.last_activity_at && (Date.now() - new Date(session.last_activity_at).getTime()) >= 3600_000,
            }),
          });
          
          if (!response.ok) {
             nextStatus[session.id] = '요약 생성 중';
             return;
          }
          const payload = await response.json().catch(() => ({}));
          if (payload?.skipped) nextStatus[session.id] = '요약 생성 중';
        }));

        const { data: refreshed } = await fetchSessionsByStudentIds(studentIds);
        if (refreshed) setSessions(refreshed as ChatSession[]);
        setSummaryStatus(nextStatus);
      } catch (error) {
        console.error(error);
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

    await supabase.from('student_profiles').update({ settings: mergedSettings }).eq('user_id', selectedStudentId);

    setConnectedStudents((prev) => prev.map((student) => student.user_id === selectedStudentId ? { ...student, settings: mergedSettings } : student));
    setSaveStatus('저장되었습니다.');
  };

  const saveParentDisplayName = async () => {
    if (!selectedStudentId) return;
    const { data } = await supabase.from('student_profiles').select('settings').eq('user_id', selectedStudentId).single();
    const settings = { ...((data?.settings as StudentSettings) || {}), parent_display_name: displayNameInput.trim() };
    await supabase.from('student_profiles').update({ settings }).eq('user_id', selectedStudentId);
    setConnectedStudents((prev) => prev.map((student) => student.user_id === selectedStudentId ? { ...student, settings } : student));
    setEditingDisplayName(false);
    setSaveStatus('표시명이 저장되었습니다.');
  };

  const toggleGuardrail = (key: keyof NormalizedSettings['guardrails']) => updateStudentSettings({ ...normalizedSettings, guardrails: { ...normalizedSettings.guardrails, [key]: !normalizedSettings.guardrails[key] } });
  const updateMentorTone = (tone: MentorTone) => updateStudentSettings({ ...normalizedSettings, mentor_tone: tone });
  const updateAiStylePrompt = (prompt: string) => updateStudentSettings({ ...normalizedSettings, ai_style_prompt: prompt });
  const copyInviteCode = () => inviteCode && navigator.clipboard.writeText(inviteCode);

  if (loading) return <div className="h-screen flex items-center justify-center font-black animate-pulse text-brand-900">데이터 동기화 중...</div>;

  const viewingSession = sessions.find(s => s.id === viewingSessionId);

  return (
    <div className="min-h-screen bg-[#F4F7FC] flex flex-col">
      {/* 상단 네비게이션 */}
      <nav className="sticky top-0 z-40 px-5 md:px-10 py-4 flex justify-between items-center bg-white/90 backdrop-blur-xl border-b border-slate-100 shadow-sm h-[72px]">
        <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">TEENAI <span className="text-[10px] bg-brand-900 text-white px-2 py-0.5 rounded ml-1 uppercase tracking-tighter">Parent</span></h1>
        <div className="flex items-center gap-3">
          <span className="hidden md:block text-sm font-bold text-slate-500">{user.name}</span>
          {!!inviteCode && (
            <div className="flex items-center gap-2 rounded-2xl border border-brand-100 bg-brand-50 px-3 py-1.5">
              <span className="text-[10px] md:text-xs font-black text-brand-900 whitespace-nowrap">CODE:</span>
              <span className="text-sm md:text-base font-black tracking-widest text-brand-900">{inviteCode}</span>
              <button onClick={copyInviteCode} className="text-[10px] bg-white px-2 py-0.5 rounded border border-brand-100 hover:text-brand-700">복사</button>
            </div>
          )}
          <button onClick={onLogout} className="bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 px-3 py-2 rounded-xl text-xs font-bold transition-all">Logout</button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto w-full px-4 md:px-6 py-8">
        
        {/* 상단: 자녀 선택 (항상 표시) */}
        <section className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-black text-slate-400 uppercase mr-2">자녀 선택</h2>
            {connectedStudents.length === 0 && <p className="text-sm text-slate-400">연결된 자녀가 없습니다.</p>}
            {connectedStudents.map((student) => {
              const active = selectedStudentId === student.user_id;
              return (
                <button
                  key={student.user_id}
                  onClick={() => { setSelectedStudentId(student.user_id); setViewingSessionId(null); }}
                  className={`px-4 py-2 rounded-full text-sm font-bold border transition-all ${active ? 'bg-brand-900 text-white border-brand-900 shadow-lg shadow-brand-900/20 scale-105' : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'}`}
                >
                  {getStudentDisplayName(student.user_id)}
                </button>
              );
            })}
          </div>
          
          {selectedStudentId && (
            <div className="flex items-center gap-2">
              {editingDisplayName ? (
                <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                  <input value={displayNameInput} onChange={(e) => setDisplayNameInput(e.target.value)} className="px-2 py-1 text-xs outline-none bg-transparent w-24" placeholder="이름 입력" />
                  <button onClick={saveParentDisplayName} className="text-xs bg-brand-900 text-white px-2 py-1 rounded hover:bg-black transition-colors">저장</button>
                </div>
              ) : (
                <button onClick={() => { setEditingDisplayName(true); setDisplayNameInput(getStudentDisplayName(selectedStudentId)); }} className="text-xs font-medium text-slate-400 hover:text-brand-900 flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-slate-100">
                  <span>표시명 변경</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
              )}
            </div>
          )}
        </section>

        {/* 메인 컨텐츠 영역 */}
        {viewingSessionId ? (
          <SessionDetailView 
            sessionId={viewingSessionId} 
            title={viewingSession?.title?.trim() || formatSessionFallbackDate(viewingSession?.started_at || '')}
            onClose={() => setViewingSessionId(null)} 
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* 1. 심리 안정도 통계 */}
            <article className="premium-card p-6 bg-white flex flex-col h-full min-h-[300px]">
              <h2 className="text-sm font-black text-slate-500 mb-6 uppercase flex items-center gap-2">
                <span>📊</span> 심리 안정도 분석
              </h2>
              <div className="flex-1 flex items-end justify-between gap-3 px-2">
                {['stable', 'normal', 'caution'].map((k) => {
                  const key = k as SessionRiskLevel;
                  const count = riskStats.counts[key];
                  const height = `${Math.max(15, (count / riskStats.maxCount) * 100)}%`;
                  const isSelected = riskFilter === key;
                  return (
                    <div 
                      key={key} 
                      onClick={() => setRiskFilter(prev => prev === key ? 'all' : key)} 
                      className={`cursor-pointer flex-1 flex flex-col items-center justify-end group transition-all duration-300 ${riskFilter !== 'all' && !isSelected ? 'opacity-40 scale-95' : 'opacity-100'}`}
                    >
                        <div className={`w-full rounded-2xl transition-all relative overflow-hidden shadow-sm group-hover:shadow-md ${key === 'stable' ? 'bg-emerald-400' : key === 'normal' ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ height }}>
                          {isSelected && <div className="absolute inset-0 bg-white/20 animate-pulse"></div>}
                        </div>
                        <span className={`text-xs font-black mt-3 ${isSelected ? 'text-slate-800 scale-110' : 'text-slate-500'} transition-all`}>{riskText[key]}</span>
                        <span className="text-[10px] text-slate-400 font-bold mt-0.5">{count}건</span>
                    </div>
                  )
                })}
              </div>
              <div className="mt-6 pt-4 border-t border-slate-50 text-center">
                 <button onClick={() => setRiskFilter('all')} className={`text-xs font-bold px-3 py-1 rounded-full transition-colors ${riskFilter === 'all' ? 'bg-slate-100 text-slate-600' : 'text-slate-400 hover:text-slate-600'}`}>전체 보기</button>
              </div>
            </article>

            {/* 2. 대화 타임라인 (메인 기능) */}
            <article className="premium-card bg-white lg:col-span-2 flex flex-col h-full min-h-[500px] lg:min-h-[600px] overflow-hidden">
              <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-white sticky top-0 z-10">
                <h2 className="text-sm font-black text-slate-500 uppercase flex items-center gap-2">
                  <span>💬</span> 대화 타임라인
                </h2>
                <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">{filteredSessions.length}개의 대화</span>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 bg-[#F8FAFC]">
                {filteredSessions.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                    <span className="text-4xl grayscale opacity-50">📭</span>
                    <span className="text-sm">표시할 대화 기록이 없습니다.</span>
                  </div>
                )}
                {filteredSessions.map((session) => {
                  const level = session.risk_level || 'normal';
                  const displayTitle = session.title?.trim() || formatSessionFallbackDate(session.started_at);
                  const displayDesc = session.summary?.trim() || "대화 내용 요약 중...";
                  
                  return (
                    <button
                      key={session.id}
                      onClick={() => setViewingSessionId(session.id)}
                      className="w-full text-left p-5 rounded-2xl border border-slate-100 bg-white hover:border-brand-300 hover:shadow-md hover:-translate-y-0.5 transition-all group relative overflow-hidden"
                    >
                      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${level === 'stable' ? 'bg-emerald-400' : level === 'normal' ? 'bg-amber-400' : 'bg-rose-400'}`}></div>
                      <div className="flex justify-between items-start mb-2 pl-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${riskChipColor[level]}`}>{riskText[level]}</span>
                          <span className="text-xs text-slate-400 font-medium">{new Date(session.started_at).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <span className="text-slate-300 group-hover:text-brand-500 transition-colors">➔</span>
                      </div>
                      <h3 className="text-base font-bold text-slate-800 line-clamp-1 pl-2 group-hover:text-brand-900">{displayTitle}</h3>
                      <p className="text-sm text-slate-500 line-clamp-2 mt-1 pl-2 leading-relaxed">{displayDesc}</p>
                    </button>
                  );
                })}
              </div>
            </article>

            {/* 3. 하단 설정 영역 (가로 전체) */}
            <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               {/* AI 스타일 설정 */}
               <article className="premium-card p-6 bg-white lg:col-span-1">
                  <h2 className="text-sm font-black text-slate-500 mb-4 uppercase">AI 멘토링 지시사항</h2>
                  <textarea
                    value={normalizedSettings.ai_style_prompt}
                    onChange={(e) => {
                        const val = e.target.value;
                        setConnectedStudents(prev => prev.map(s => s.user_id === selectedStudentId ? { ...s, settings: { ...s.settings, ...toStudentSettings({ ...normalizedSettings, ai_style_prompt: val }) } } : s));
                    }}
                    placeholder="예: 아이가 진로 문제로 고민 중이니, 격려하는 말투로 대화해 주세요."
                    className="w-full h-32 rounded-xl border border-slate-200 p-3 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none resize-none bg-slate-50/50"
                  />
                  <div className="flex justify-between items-center mt-3">
                     <span className="text-xs text-emerald-600 font-bold h-4">{saveStatus}</span>
                     <button onClick={() => updateAiStylePrompt(normalizedSettings.ai_style_prompt)} className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl hover:bg-black transition-all">저장하기</button>
                  </div>
               </article>

               {/* 멘토 말투 */}
               <article className="premium-card p-6 bg-white lg:col-span-1">
                  <h2 className="text-sm font-black text-slate-500 mb-4 uppercase">멘토 말투 성향</h2>
                  <div className="space-y-2">
                      {mentorToneOptions.map((opt) => (
                          <button key={opt.value} onClick={() => updateMentorTone(opt.value)} className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between ${normalizedSettings.mentor_tone === opt.value ? 'bg-brand-50 border-brand-500 text-brand-900 ring-1 ring-brand-200' : 'bg-white border-slate-100 hover:bg-slate-50'}`}>
                              <div>
                                <div className="font-bold text-sm">{opt.label}</div>
                                <div className="text-[11px] text-slate-400">{opt.description}</div>
                              </div>
                              {normalizedSettings.mentor_tone === opt.value && <span className="text-brand-600">✔</span>}
                          </button>
                      ))}
                  </div>
               </article>

               {/* 안심 가드레일 */}
               <article className="premium-card p-6 bg-white lg:col-span-1">
                  <h2 className="text-sm font-black text-slate-500 mb-4 uppercase">안심 가드레일</h2>
                  <div className="space-y-2">
                      {guardrailMeta.map((g) => (
                          <div key={g.key} onClick={() => toggleGuardrail(g.key)} className="flex items-center justify-between p-3 border border-slate-100 rounded-xl cursor-pointer hover:bg-slate-50 bg-white">
                              <div className="flex-1 pr-2">
                                  <div className="font-bold text-sm text-slate-800">{g.label}</div>
                                  <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{g.description}</div>
                              </div>
                              <div className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${normalizedSettings.guardrails[g.key] ? 'bg-brand-600' : 'bg-slate-300'}`}>
                                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all shadow-sm ${normalizedSettings.guardrails[g.key] ? 'left-5' : 'left-1'}`} />
                              </div>
                          </div>
                      ))}
                  </div>
               </article>
            </div>

          </div>
        )}
      </main>
    </div>
  );
};

export default ParentDashboard;

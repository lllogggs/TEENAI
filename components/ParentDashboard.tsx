import React, { useState, useEffect, useMemo } from 'react';
import { User, ChatSession, MessageRow, StudentSettings, SessionRiskLevel } from '../types';
import { supabase } from '../utils/supabase';
import { ForteenLogo } from './Icons';

interface ParentDashboardProps {
  user: User;
  onLogout: () => void;
}

interface ConnectedStudent {
  user_id: string;
  parent_user_id?: string;
  settings: StudentSettings;
  subscription_expires_at?: string | null;
}

interface StudentAccount {
  name: string;
  email: string;
  subscription_expires_at?: string | null;
}

type MentorTone = 'kind' | 'rational' | 'friendly';
type InviteCodeStatus = 'idle' | 'loading' | 'ready' | 'limit' | 'error';

interface NormalizedSettings {
  guardrails: {
    sexual_block: boolean;
    self_directed_mode: boolean;
    overuse_prevent: boolean;
    clean_language: boolean;
  };
  mentor_tone: MentorTone;
  ai_style_prompt: string;
  parent_student_name: string;
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
  parent_student_name: '',
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
};

const riskText: Record<SessionRiskLevel, string> = {
  stable: '안정',
  normal: '주의',
  caution: '위험',
};

const sessionModeLabelMap = {
  conversation: '대화 모드',
  study: '학습 모드',
} as const;

const riskBarTheme: Record<SessionRiskLevel, { fill: string; text: string; border: string }> = {
  stable: { fill: 'bg-emerald-500', text: 'text-emerald-700', border: 'border-emerald-200' },
  normal: { fill: 'bg-amber-400', text: 'text-amber-700', border: 'border-amber-200' },
  caution: { fill: 'bg-rose-500', text: 'text-rose-700', border: 'border-rose-200' },
};

const normalizeRiskLevel = (value: unknown): SessionRiskLevel => {
  if (value === 'stable') return 'stable';
  if (value === 'caution' || value === 'warn' || value === 'high') return 'caution';
  return 'normal';
};

const generateInviteCodeCandidate = (length = 6): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';

  for (let index = 0; index < length; index += 1) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return code;
};

const isUniqueViolation = (error: unknown): boolean => {
  const code = String((error as { code?: string } | null)?.code || '');
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();
  return code === '23505' || message.includes('duplicate key') || message.includes('unique');
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
    parent_student_name: typeof settings?.parent_student_name === 'string' ? settings.parent_student_name : '',
  };
};

const toStudentSettings = (normalized: NormalizedSettings): StudentSettings => ({
  guardrails: normalized.guardrails,
  mentor_tone: normalized.mentor_tone,
  mentor_style: normalized.mentor_tone,
  ai_style_prompt: normalized.ai_style_prompt,
  parent_student_name: normalized.parent_student_name,
});

const ParentDashboard: React.FC<ParentDashboardProps> = ({ user, onLogout }) => {
  const [connectedStudents, setConnectedStudents] = useState<ConnectedStudent[]>([]);
  const [studentAccounts, setStudentAccounts] = useState<Record<string, StudentAccount>>({});
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [sessionMessages, setSessionMessages] = useState<MessageRow[]>([]);
  const [openedSessionId, setOpenedSessionId] = useState('');
  const [riskFilter, setRiskFilter] = useState<SessionRiskLevel | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteCodeStatus, setInviteCodeStatus] = useState<InviteCodeStatus>('idle');
  const [copyStatus, setCopyStatus] = useState('');
  const [isNameEditing, setIsNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [aiInstructionDraft, setAiInstructionDraft] = useState('');
  const [studentsError, setStudentsError] = useState('');
  const [sessionsError, setSessionsError] = useState('');
  const [messagesError, setMessagesError] = useState('');
  const [renewalCode, setRenewalCode] = useState('');
  const [renewalStatus, setRenewalStatus] = useState('');
  const [isRenewalSubmitting, setIsRenewalSubmitting] = useState(false);
  const [showRenewalPrompt, setShowRenewalPrompt] = useState(false);

  const selectedStudent = useMemo(
    () => connectedStudents.find((student) => student.user_id === selectedStudentId) || null,
    [connectedStudents, selectedStudentId]
  );

  const normalizedSettings = useMemo(() => normalizeSettings(selectedStudent?.settings), [selectedStudent]);
  const selectedStudentAccount = studentAccounts[selectedStudentId];
  const selectedStudentSubscriptionExpiresAt = selectedStudent?.subscription_expires_at || selectedStudentAccount?.subscription_expires_at || null;
  const isSelectedStudentExpired = useMemo(() => {
    if (!selectedStudentSubscriptionExpiresAt) return false;
    const expiresAt = new Date(selectedStudentSubscriptionExpiresAt).getTime();
    return Number.isFinite(expiresAt) && expiresAt < Date.now();
  }, [selectedStudentSubscriptionExpiresAt]);

  const displayStudentName = useMemo(() => {
    const customName = normalizedSettings.parent_student_name.trim();
    return customName || selectedStudentAccount?.name || '학생';
  }, [normalizedSettings.parent_student_name, selectedStudentAccount?.name]);

  const aiInstructionList = useMemo(
    () =>
      normalizedSettings.ai_style_prompt
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
    [normalizedSettings.ai_style_prompt]
  );

  const riskCounts = useMemo(() => {
    const counts: Record<SessionRiskLevel, number> = { stable: 0, normal: 0, caution: 0 };
    sessions.forEach((session) => {
      // Only count non-deleted sessions for risk stats
      if (!session.is_deleted_by_student) {
        const level = normalizeRiskLevel(session.risk_level);
        counts[level] += 1;
      }
    });
    return counts;
  }, [sessions]);

  const maxRiskCount = Math.max(1, riskCounts.stable, riskCounts.normal, riskCounts.caution);

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      if (riskFilter === 'all') return true;
      return normalizeRiskLevel(session.risk_level) === riskFilter;
    });
  }, [sessions, riskFilter]);

  useEffect(() => {
    if (user.subscription_expires_at) {
      const expires = new Date(user.subscription_expires_at);
      if (expires < new Date()) {
        alert('서비스 이용 기간이 만료되었습니다. 관리자에게 문의하세요.');
        onLogout();
      }
    }
  }, [user, onLogout]);

  const ensureInviteCodeViaClient = async (): Promise<string> => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = generateInviteCodeCandidate();

      const { data: updatedRow, error: updateError } = await supabase
        .from('users')
        .update({ my_invite_code: candidate })
        .eq('id', user.id)
        .eq('role', 'parent')
        .or('my_invite_code.is.null,my_invite_code.eq.')
        .select('my_invite_code')
        .maybeSingle();

      const updatedCode = (updatedRow?.my_invite_code || '').toUpperCase();
      if (updatedCode) {
        return updatedCode;
      }

      const { data: latestRow, error: latestError } = await supabase
        .from('users')
        .select('my_invite_code')
        .eq('id', user.id)
        .maybeSingle();

      const latestCode = (latestRow?.my_invite_code || '').toUpperCase();
      if (!latestError && latestCode) {
        return latestCode;
      }

      if (updateError && !isUniqueViolation(updateError)) {
        console.error('[ParentDashboard] client invite code update failed:', updateError);
        break;
      }
    }

    return '';
  };

  const fetchInviteCode = async () => {
    setInviteCodeStatus('loading');
    setCopyStatus('');

    // Check student count limit first
    const { count, error: countError } = await supabase
      .from('student_profiles')
      .select('user_id', { count: 'exact', head: true })
      .eq('parent_user_id', user.id);

    if (countError) {
      console.error('[ParentDashboard] student_profiles count error:', countError);
      setInviteCodeStatus('error');
      return;
    }

    if ((count || 0) >= 3) {
      setInviteCode('');
      setInviteCodeStatus('limit');
      return;
    }

    const { data: userRow, error: userError } = await supabase
      .from('users')
      .select('my_invite_code, role')
      .eq('id', user.id)
      .single();

    if (userError) {
      console.error('[ParentDashboard] users(my_invite_code) fetch error:', userError);
      setInviteCodeStatus('error');
      return;
    }

    let resolvedCode = userRow?.role === 'parent' ? userRow?.my_invite_code || '' : '';
    if (!resolvedCode) {
      resolvedCode = await ensureInviteCodeViaClient();
    }

    if (!resolvedCode) {
      try {
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
        } else {
          const payload = await response.json().catch(() => ({}));
          console.error('[ParentDashboard] /api/ensure-invite-code failed:', payload?.error || response.statusText);
        }
      } catch (ensureError) {
        console.error('[ParentDashboard] /api/ensure-invite-code request error:', ensureError);
      }
    }

    const normalizedCode = (resolvedCode || '').toUpperCase();
    setInviteCode(normalizedCode);
    setInviteCodeStatus(normalizedCode ? 'ready' : 'error');
  };

  useEffect(() => {
    fetchInviteCode();
  }, [user.id]);

  useEffect(() => {
    const fetchStudents = async () => {
      setStudentsError('');
      const { data: profiles, error: profileError } = await supabase
        .from('student_profiles')
        .select('user_id, settings, parent_user_id, users!student_profiles_user_id_fkey(subscription_expires_at)')
        .eq('parent_user_id', user.id);

      if (profileError) {
        console.error('[ParentDashboard] student_profiles fetch error:', profileError);
        setStudentsError('학생 연결 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
        setLoading(false);
        return;
      }

      const mappedProfiles: ConnectedStudent[] = (profiles || []).map((profile) => {
        const profileUser = Array.isArray(profile.users) ? profile.users[0] : profile.users;
        return {
          user_id: profile.user_id,
          parent_user_id: profile.parent_user_id || undefined,
          settings: toStudentSettings(normalizeSettings(profile.settings as StudentSettings)),
          subscription_expires_at: profileUser?.subscription_expires_at || null,
        };
      });

      setConnectedStudents(mappedProfiles);
      const studentIds = mappedProfiles.map((profile) => profile.user_id);
      if (!studentIds.length) {
        setStudentAccounts({});
        setSelectedStudentId('');
        setLoading(false);
        return;
      }

      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, name, email, subscription_expires_at')
        .in('id', studentIds);

      if (usersError) {
        console.error('[ParentDashboard] users(student account) fetch error:', usersError);
      }

      const accountMap = (usersData || []).reduce<Record<string, StudentAccount>>((acc, account) => {
        acc[account.id] = {
          name: account.name,
          email: account.email,
          subscription_expires_at: account.subscription_expires_at || null,
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
    // Fetch sessions for selected student
    if (!selectedStudentId) {
      setSessions([]);
      setSelectedSessionId('');
      return;
    }

    const fetchSessions = async () => {
      setSessionsError('');
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('student_id', selectedStudentId)
        .order('started_at', { ascending: false });

      if (error) {
        console.error('[ParentDashboard] chat_sessions fetch error:', error);
        setSessionsError('대화 목록을 불러오지 못했습니다.');
        setSessions([]);
      } else {
        setSessions((data as ChatSession[]) || []);
        setSelectedSessionId((prev) => (prev && (data || []).some((session) => session.id === prev) ? prev : (data || [])[0]?.id || ''));
        setOpenedSessionId((prev) => (prev && (data || []).some((session) => session.id === prev) ? prev : ''));
      }
    };

    fetchSessions(); // Initial fetch

    const channel = supabase
      .channel(`public:chat_sessions:parent:${user.id}:student:${selectedStudentId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_sessions', filter: `student_id=eq.${selectedStudentId}` },
        () => {
          fetchSessions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedStudentId, user.id]);

  useEffect(() => {
    const fetchMessages = async () => {
      if (!openedSessionId) {
        setSessionMessages([]);
        setMessagesError('');
        return;
      }

      setMessagesError('');
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('session_id', openedSessionId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[ParentDashboard] messages fetch error:', error);
        setMessagesError('메시지를 불러오지 못했습니다.');
        setSessionMessages([]);
        return;
      }

      setSessionMessages((data || []) as MessageRow[]);
    };

    fetchMessages();
  }, [openedSessionId]);

  useEffect(() => {
    setRiskFilter('all');
    setOpenedSessionId('');
    setIsNameEditing(false);
    setNameDraft('');
    setAiInstructionDraft('');
  }, [selectedStudentId, user.id]);

  // Duplicate logic removed.
  // The riskCounts and filteredSessions are already defined above.
  // See lines 157+ for the source of truth.

  useEffect(() => {
    setNameDraft(normalizedSettings.parent_student_name || selectedStudentAccount?.name || '');
  }, [normalizedSettings.parent_student_name, selectedStudentAccount?.name]);

  useEffect(() => {
    if (isSelectedStudentExpired) {
      setShowRenewalPrompt(true);
      return;
    }

    setShowRenewalPrompt(false);
    setRenewalCode('');
    setRenewalStatus('');
  }, [isSelectedStudentExpired, selectedStudentId]);

  useEffect(() => {
    const registerPushToken = async (token: string) => {
      const trimmedToken = token.trim();
      if (!trimmedToken) return;

      const { error } = await supabase
        .from('parent_push_tokens')
        .upsert(
          {
            parent_user_id: user.id,
            expo_push_token: trimmedToken,
            platform: 'expo',
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: 'parent_user_id,expo_push_token' }
        );

      if (error) {
        console.error('[ParentDashboard] parent push token save error:', error);
      }
    };

    const handlePushTokenMessage = (event: Event) => {
      const payload = (event as MessageEvent).data;
      try {
        const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
        if (parsed?.type === 'expo_push_token' && typeof parsed.token === 'string') {
          registerPushToken(parsed.token);
        }
      } catch (messageError) {
        console.error('[ParentDashboard] push token message parse error:', messageError);
      }
    };

    window.addEventListener('message', handlePushTokenMessage as EventListener);
    document.addEventListener('message', handlePushTokenMessage as EventListener);

    return () => {
      window.removeEventListener('message', handlePushTokenMessage as EventListener);
      document.removeEventListener('message', handlePushTokenMessage as EventListener);
    };
  }, [user.id]);

  const updateStudentSettings = async (nextSettings: NormalizedSettings) => {
    if (!selectedStudentId) return;
    setSaveStatus('');

    const mergedSettings = toStudentSettings(nextSettings);
    const { error } = await supabase
      .from('student_profiles')
      .update({ settings: mergedSettings })
      .eq('user_id', selectedStudentId);

    if (error) {
      console.error('[ParentDashboard] student_profiles update error:', error);
      setSaveStatus(`저장 실패: ${error.message}`);
      return;
    }

    setConnectedStudents((prev) =>
      prev.map((student) =>
        student.user_id === selectedStudentId ? { ...student, settings: mergedSettings } : student
      )
    );
    setSaveStatus('저장되었습니다.');
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

  const addAiInstruction = async () => {
    const trimmed = aiInstructionDraft.trim();
    if (!trimmed) return;

    const nextPrompt = [...aiInstructionList, trimmed].join('\n');
    await updateAiStylePrompt(nextPrompt);
    setAiInstructionDraft('');
  };

  const removeAiInstruction = async (targetIndex: number) => {
    const nextPrompt = aiInstructionList
      .filter((_, index) => index !== targetIndex)
      .join('\n');

    await updateAiStylePrompt(nextPrompt);
  };

  const handleSaveStudentName = async () => {
    const trimmed = nameDraft.trim();
    await updateStudentSettings({ ...normalizedSettings, parent_student_name: trimmed });
    setIsNameEditing(false);
  };

  const copyInviteCode = async () => {
    if (!inviteCode || inviteCodeStatus !== 'ready') return;

    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopyStatus('복사됨');
      window.setTimeout(() => setCopyStatus(''), 1500);
    } catch (copyError) {
      console.error('[ParentDashboard] invite code copy failed:', copyError);
      setCopyStatus('복사 실패');
    }
  };

  const handleRenewSubscription = async () => {
    if (!selectedStudentId) return;

    const normalizedCode = renewalCode.trim().toUpperCase();
    if (!normalizedCode) {
      setRenewalStatus('초대코드를 입력해주세요.');
      return;
    }

    setIsRenewalSubmitting(true);
    setRenewalStatus('');

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch('/api/parent/renew-student-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ studentId: selectedStudentId, inviteCode: normalizedCode }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || '기간 연장에 실패했습니다.');
      }

      const nextExpiresAt = payload?.subscription_expires_at || null;
      setConnectedStudents((prev) => prev.map((student) => (
        student.user_id === selectedStudentId
          ? { ...student, subscription_expires_at: nextExpiresAt }
          : student
      )));
      setStudentAccounts((prev) => ({
        ...prev,
        [selectedStudentId]: prev[selectedStudentId]
          ? { ...prev[selectedStudentId], subscription_expires_at: nextExpiresAt }
          : prev[selectedStudentId],
      }));
      setRenewalStatus('이용 기간이 연장되었습니다.');
      setRenewalCode('');
      setShowRenewalPrompt(false);
    } catch (renewError) {
      console.error('[ParentDashboard] renew subscription error:', renewError);
      setRenewalStatus(renewError instanceof Error ? renewError.message : '기간 연장 중 오류가 발생했습니다.');
    } finally {
      setIsRenewalSubmitting(false);
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center font-black animate-pulse text-brand-900">데이터 동기화 중...</div>;

  return (
    <div className="min-h-[100dvh] bg-[#F4F7FC] pt-[env(safe-area-inset-top,0px)]">
      {/* Header */}
      <header className="px-3 md:px-7 py-2.5 md:py-4 flex justify-between items-center bg-white shadow-sm border-b border-slate-100 z-10 relative">
        <div className="flex items-center gap-2 md:gap-3">
          <ForteenLogo className="w-10 h-10 md:w-11 md:h-11 shrink-0 shadow-md shadow-brand-900/10 rounded-xl" />
          <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight flex items-end gap-1.5">
            포틴AI
            <span className="text-[9px] bg-brand-900 text-white px-1.5 py-0.5 rounded uppercase tracking-tight leading-none">Parent</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 md:gap-4 flex-wrap justify-end">
          <span className="text-xs md:text-sm font-bold text-slate-500">{user.name}</span>
          <button onClick={onLogout} className="bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 px-3 py-2 md:p-3 rounded-2xl transition-all">Logout</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 md:px-6 lg:px-7 py-3 md:py-4 space-y-2">
        {showRenewalPrompt && selectedStudent ? (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/45 px-4">
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-100">
              <p className="text-sm font-black text-rose-500 mb-2">초대코드를 입력해주세요</p>
              <h2 className="text-xl font-black text-slate-900 mb-2">{displayStudentName} 학생의 이용 기간이 만료되었습니다.</h2>
              <p className="text-sm font-bold text-slate-500 mb-4">새로운 초대코드를 입력하여 기간을 연장할 수 있습니다.</p>
              <div className="space-y-3">
                <input
                  value={renewalCode}
                  onChange={(event) => setRenewalCode(event.target.value.toUpperCase())}
                  placeholder="초대코드를 입력해주세요"
                  disabled={isRenewalSubmitting}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black tracking-[0.2em] text-slate-800 uppercase"
                />
                {renewalStatus ? <p className={`text-xs font-bold ${renewalStatus.includes('연장되었습니다') ? 'text-emerald-600' : 'text-rose-500'}`}>{renewalStatus}</p> : null}
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => {
                      if (isRenewalSubmitting) return;
                      setShowRenewalPrompt(false);
                      setRenewalStatus('');
                    }}
                    disabled={isRenewalSubmitting}
                    className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-500"
                  >
                    닫기
                  </button>
                  <button
                    onClick={handleRenewSubscription}
                    disabled={isRenewalSubmitting}
                    className="px-4 py-2 rounded-xl bg-brand-900 text-white text-sm font-black shadow-lg shadow-brand-900/20 disabled:opacity-50"
                  >
                    {isRenewalSubmitting ? '확인 중...' : '기간 연장'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {connectedStudents.length === 0 ? (
          <div className="max-w-4xl mx-auto mt-4 md:mt-10 animate-in fade-in slide-in-from-bottom-5 duration-700">
            <div className="premium-card p-8 md:p-14 text-center relative overflow-hidden">
              {studentsError && <p className="text-sm text-rose-500 mb-3">{studentsError}</p>}
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-brand-400 to-brand-600"></div>
              <div className="w-20 h-20 bg-brand-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner border border-brand-100">
                <span className="text-4xl text-brand-900">👨‍👩‍👧‍👦</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-black text-slate-800 mb-4 tracking-tight">환영합니다! 자녀를 연결해 주세요</h2>
              <p className="text-slate-500 font-bold mb-10 text-balance leading-relaxed text-sm md:text-base">
                포틴 AI는 부모님과 자녀가 함께 만들어가는 안전한 성장의 공간입니다.<br className="hidden md:block" />
                아래 3단계 가이드에 따라 자녀와 계정을 연결하고 멘토링 현황을 확인해 보세요.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6 text-left">
                <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 relative shadow-sm hover:shadow-md transition-shadow">
                  <div className="absolute -top-4 -left-4 w-10 h-10 bg-brand-900 text-white rounded-full flex items-center justify-center font-black border-4 border-white shadow-sm shadow-brand-900/20 text-lg">1</div>
                  <h3 className="font-black text-brand-900 mb-2 mt-2 text-lg">코드 확인</h3>
                  <p className="text-sm text-slate-500 font-bold leading-relaxed">계정 생성 시 발급된 전용 초대 코드를 아래에서 확인하세요.</p>
                </div>
                <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 relative shadow-sm hover:shadow-md transition-shadow">
                  <div className="absolute -top-4 -left-4 w-10 h-10 bg-brand-900 text-white rounded-full flex items-center justify-center font-black border-4 border-white shadow-sm shadow-brand-900/20 text-lg">2</div>
                  <h3 className="font-black text-brand-900 mb-2 mt-2 text-lg">코드 전달</h3>
                  <p className="text-sm text-slate-500 font-bold leading-relaxed">복사 버튼을 눌러 자녀의 카카오톡이나 문자로 코드를 보내주세요.</p>
                </div>
                <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 relative shadow-sm hover:shadow-md transition-shadow">
                  <div className="absolute -top-4 -left-4 w-10 h-10 bg-brand-900 text-white rounded-full flex items-center justify-center font-black border-4 border-white shadow-sm shadow-brand-900/20 text-lg">3</div>
                  <h3 className="font-black text-brand-900 mb-2 mt-2 text-lg">학생 접속</h3>
                  <p className="text-sm text-slate-500 font-bold leading-relaxed">자녀가 포틴 AI 앱의 '학생 시작하기'에 코드를 입력하면 즉시 연결됩니다.</p>
                </div>
              </div>

              <div className="bg-brand-50/50 rounded-3xl p-6 md:p-10 border border-brand-100/50">
                {inviteCodeStatus === 'limit' ? (
                  <p className="text-red-500 font-bold">더 이상 학생을 추가할 수 없습니다.</p>
                ) : inviteCodeStatus === 'loading' ? (
                  <div className="text-brand-900 font-black animate-pulse">초대 코드 발급 중...</div>
                ) : inviteCodeStatus === 'error' ? (
                  <div className="space-y-2">
                    <p className="text-rose-500 font-bold">초대 코드 조회에 실패했습니다.</p>
                    <button onClick={fetchInviteCode} className="text-xs font-black px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 bg-white hover:bg-rose-50">다시 시도</button>
                  </div>
                ) : !inviteCode ? (
                  <div className="text-brand-900 font-black animate-pulse">초대 코드 발급 중...</div>
                ) : (
                  <div className="flex flex-col items-center">
                    <p className="text-sm font-black text-brand-700 mb-4 uppercase tracking-widest">자녀에게 전달할 코드</p>
                    <div className="flex flex-col md:flex-row items-center gap-4 bg-white border border-slate-200 pl-8 pr-3 py-3 rounded-2xl shadow-sm">
                      <span className="text-3xl md:text-4xl font-black tracking-[0.25em] text-slate-800">{inviteCode}</span>
                      <button onClick={copyInviteCode} className="w-full md:w-auto bg-brand-900 text-white px-6 py-3 font-black rounded-xl shadow-lg shadow-brand-900/20 hover:bg-black hover:-translate-y-0.5 transition-all text-sm">복사하기</button>
                    {copyStatus && <p className="text-xs text-slate-500">{copyStatus}</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            <section className="premium-card p-4 md:p-5 space-y-3">
              <div className="flex flex-col md:flex-row justify-between gap-3 md:items-start">
                <div className="flex flex-wrap items-center gap-2">
                  {connectedStudents.map((student) => {
                    const account = studentAccounts[student.user_id];
                    const studentName = normalizeSettings(student.settings).parent_student_name?.trim() || account?.name || '학생';
                    const active = selectedStudentId === student.user_id;
                    return (
                      <button
                        key={student.user_id}
                        onClick={() => setSelectedStudentId(student.user_id)}
                        className={`group relative px-4 py-2.5 rounded-full text-sm font-bold border transition-all flex items-center gap-2 ${active ? 'bg-brand-900 text-white border-brand-900 shadow-md shadow-brand-900/20' : 'bg-white text-slate-700 border-slate-200 hover:border-brand-300'}`}
                      >
                        {studentName}
                        {active && !isNameEditing && (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsNameEditing(true);
                            }}
                            className="opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
                            role="button"
                            aria-label="학생 이름 편집"
                          >
                            ✏️
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {inviteCodeStatus !== 'limit' && (
                  <div className="flex items-center justify-between md:justify-end gap-2 px-3 py-2 lg:py-1.5 bg-brand-50 rounded-xl border border-brand-100 shrink-0">
                    <span className="text-xs font-bold text-brand-900">학생 인증코드: <span className="font-black tracking-widest ml-1">{inviteCode || '...'}</span></span>
                    <button onClick={copyInviteCode} disabled={!inviteCode} className="text-[10px] bg-white border border-brand-200 px-2 py-0.5 rounded shadow-sm hover:bg-brand-100 font-bold transition-colors disabled:opacity-50">복사</button>
                  </div>
                )}
              </div>
              {isNameEditing && (
                <div className="rounded-2xl border border-brand-100 bg-brand-50/40 p-3 md:p-4 max-w-md">
                  <p className="text-xs font-bold text-slate-600 mb-2">선택한 학생 이름 수정</p>
                  <div className="space-y-2">
                    <input
                      value={nameDraft}
                      onChange={(event) => setNameDraft(event.target.value)}
                      placeholder="학생 이름"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800"
                    />
                    <div className="flex items-center gap-2">
                      <button onClick={handleSaveStudentName} className="px-3 py-1.5 rounded-lg bg-brand-900 text-white text-xs font-black">저장</button>
                      <button
                        onClick={() => {
                          setIsNameEditing(false);
                          setNameDraft(normalizedSettings.parent_student_name || selectedStudentAccount?.name || '');
                        }}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-black text-slate-500 bg-white"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-4 gap-2 md:gap-2.5 lg:gap-3">
              <article className="premium-card p-3 md:p-3.5 lg:p-4 lg:col-span-1">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h2 className="font-black text-base lg:text-lg">1) 심리 안정도 요약</h2>
                  <button
                    onClick={() => setRiskFilter('all')}
                    className="text-[10px] md:text-[11px] font-black px-2 py-1 rounded-lg border border-slate-200 text-slate-600 bg-white hover:border-brand-200 hover:text-brand-900 shrink-0 -mt-1"
                  >
                    전체 보기
                  </button>
                </div>
                <div className="h-28 lg:h-32 flex items-end justify-around gap-1.5">
                  {(['stable', 'normal', 'caution'] as SessionRiskLevel[]).map((level) => {
                    const count = riskCounts[level];
                    const heightPercent = Math.max((count / maxRiskCount) * 100, count > 0 ? 18 : 8);
                    const active = riskFilter === level;
                    const theme = riskBarTheme[level];
                    return (
                      <button
                        key={level}
                        onClick={() => setRiskFilter(level)}
                        className={`flex-1 min-w-[70px] h-full rounded-2xl border p-2 flex flex-col justify-end items-center gap-2 transition-all ${active ? `${theme.border} ring-2 ring-brand-100 bg-slate-50` : 'border-slate-100 hover:border-slate-200 bg-white'}`}
                      >
                        <p className="text-[10px] lg:text-xs font-black text-slate-500">{count}개</p>
                        <div className="w-7 lg:w-8 h-20 lg:h-24 rounded-xl bg-slate-100 flex items-end overflow-hidden">
                          <div className={`${theme.fill} w-full rounded-xl transition-all`} style={{ height: `${heightPercent}%` }} />
                        </div>
                        <p className={`text-xs font-black ${theme.text}`}>{riskText[level]}</p>
                      </button>
                    );
                  })}
                </div>

              </article>

              <article className="premium-card p-3.5 md:p-4 lg:p-5 lg:col-span-3">
                <h2 className="font-black text-base lg:text-lg mb-2 lg:mb-3">2) 대화 목록</h2>
                <div className="space-y-2 min-h-[204px] md:min-h-[236px]">
                  {sessionsError && <p className="text-sm text-rose-500">{sessionsError}</p>}
                  {filteredSessions.length === 0 && <p className="text-sm text-slate-400">조건에 맞는 대화가 없습니다.</p>}
                  {filteredSessions.map((session) => {
                    const risk = normalizeRiskLevel(session.risk_level);
                    return (
                      <div
                        key={session.id}
                        onClick={() => {
                          setSelectedSessionId(session.id);
                          setOpenedSessionId(session.id);
                        }}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer group relative ${selectedSessionId === session.id
                          ? 'bg-brand-50 border-brand-500 ring-1 ring-brand-500'
                          : 'bg-white border-slate-100 hover:border-brand-200 hover:shadow-md'
                          } ${session.is_deleted_by_student ? 'opacity-75 bg-slate-50' : ''}`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${risk === 'stable' ? 'bg-emerald-100 text-emerald-700' :
                            risk === 'normal' ? 'bg-amber-100 text-amber-700' :
                              'bg-rose-100 text-rose-700'
                            }`}>
                            {riskText[risk]}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">{new Date(session.started_at).toLocaleDateString()}</span>
                        </div>
                        <h4 className="font-bold text-slate-800 text-sm mb-1 line-clamp-1 flex items-center gap-2">
                          {session.title || '새 대화'}
                          {session.is_deleted_by_student && (
                            <span className="text-[9px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">학생이 삭제함</span>
                          )}
                        </h4>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-500">
                            {sessionModeLabelMap[session.chat_mode || 'conversation']}
                          </span>
                        </div>

                        {/* Permanent Delete Button (Only for sessions deleted by student) */}
                        {session.is_deleted_by_student && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (confirm("이 대화 기록을 영구적으로 삭제하시겠습니까? 복구할 수 없습니다.")) {
                                const { error } = await supabase.from('chat_sessions').delete().eq('id', session.id);
                                if (error) {
                                  alert("삭제 실패: " + error.message);
                                } else {
                                  setSessions((prev) => prev.filter((s) => s.id !== session.id));
                                  if (openedSessionId === session.id) setOpenedSessionId('');
                                  if (selectedSessionId === session.id) setSelectedSessionId(sessions.find(s => s.id !== session.id)?.id || '');
                                }
                              }
                            }}
                            className="absolute right-4 bottom-4 p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50 rounded-lg"
                            title="영구 삭제"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </article>

              <article className="premium-card p-3.5 md:p-4 lg:p-5 lg:col-span-2">
                <h2 className="font-black text-base lg:text-lg mb-2 lg:mb-3">3) AI 개별 지시사항 관리</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
                  <div>
                    <textarea
                      value={aiInstructionDraft}
                      onChange={(event) => setAiInstructionDraft(event.target.value)}
                      placeholder="예: 아이가 불안해할 때는 짧고 명확하게 안심 문장을 먼저 말해 주세요."
                      className="w-full min-h-32 lg:min-h-[220px] rounded-2xl border border-slate-200 p-3 lg:p-4 text-sm"
                    />
                    <button onClick={addAiInstruction} className="mt-3 px-4 py-2 rounded-xl bg-brand-900 text-white text-sm font-bold">리스트에 추가</button>
                    {saveStatus && <p className={`text-xs mt-2 font-bold ${saveStatus.startsWith('저장 실패') ? 'text-rose-500' : 'text-emerald-600'}`}>{saveStatus}</p>}
                  </div>
                  <div className="space-y-2 h-[210px] lg:h-[268px] overflow-y-auto custom-scrollbar pr-1">
                    {aiInstructionList.length === 0 && <p className="text-sm text-slate-400">아직 등록된 지시사항이 없습니다.</p>}
                    {aiInstructionList.map((instruction, index) => (
                      <div key={`${instruction}-${index}`} className="rounded-xl border border-slate-100 bg-white p-3 flex items-start justify-between gap-2">
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{instruction}</p>
                        <button
                          onClick={() => removeAiInstruction(index)}
                          className="shrink-0 text-xs font-black text-rose-500 hover:text-rose-700"
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </article>

              <article className="premium-card p-3.5 md:p-4 lg:p-5 lg:col-span-2">
                <h2 className="font-black text-base lg:text-lg mb-2 lg:mb-3">4) 멘토 말투 성향</h2>
                <div className="grid grid-cols-1 gap-2">
                  {mentorToneOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => updateMentorTone(option.value)}
                      className={`w-full text-left px-3 py-2.5 lg:px-4 lg:py-3 rounded-2xl border ${normalizedSettings.mentor_tone === option.value ? 'bg-brand-50 border-brand-400 text-brand-900' : 'bg-white border-slate-100'}`}
                    >
                      <p className="font-black text-sm mb-1">{option.label}</p>
                      <p className="text-[10px] lg:text-xs text-slate-500 leading-tight">{option.description}</p>
                    </button>
                  ))}
                </div>
              </article>

              <article className="premium-card p-4 lg:p-5 lg:col-span-4">
                <h2 className="font-black text-base lg:text-lg mb-2 lg:mb-3">5) 필수 안심 가드레일</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 lg:gap-3">
                  {guardrailMeta.map((item) => {
                    const enabled = normalizedSettings.guardrails[item.key];
                    return (
                      <button key={item.key} onClick={() => toggleGuardrail(item.key)} className="w-full border border-slate-100 rounded-xl lg:rounded-2xl p-3 lg:p-4 text-left bg-white">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-black text-slate-900">{item.label}</p>
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2 min-h-[2.5rem]">{item.description}</p>
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
          </>
        )}
      </main>

      {openedSessionId && (
        <div className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-[1px] px-4 py-6 md:p-10">
          <div className="max-w-4xl mx-auto h-full bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden">
            <div className="px-5 md:px-7 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
              <div>
                <h3 className="font-black text-base md:text-lg text-slate-900">{sessions.find((session) => session.id === openedSessionId)?.title || '대화 전문'}</h3>
                <p className="text-xs text-slate-500 mt-1">세션 원문 전체 메시지</p>
              </div>
              <button onClick={() => setOpenedSessionId('')} className="text-sm font-black text-slate-500 hover:text-slate-900">닫기</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 md:p-7 space-y-3 custom-scrollbar bg-slate-50/40">
              {messagesError && <p className="text-sm text-rose-500">{messagesError}</p>}
              {sessionMessages.length === 0 && <p className="text-sm text-slate-400">메시지가 없습니다.</p>}
              {sessionMessages.map((message) => (
                <div key={message.id} className={`max-w-[88%] p-3 rounded-2xl text-sm ${message.role === 'user' ? 'bg-brand-900 text-white ml-auto' : 'bg-white border border-slate-100 text-slate-800 mr-auto'}`}>
                  <p className="text-[10px] opacity-70 mb-1">{message.role === 'user' ? '학생' : 'AI'} · {new Date(message.created_at).toLocaleTimeString('ko-KR')}</p>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParentDashboard;

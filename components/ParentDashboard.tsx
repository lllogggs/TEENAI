import React, { useState, useEffect } from 'react';
import { User, StudentProfile, ChatSession, SafetyAlert, ToneLevel, AISettings, ChatMessage } from '../types';
import { MockDb } from '../services/mockDb';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface ParentDashboardProps {
  user: User;
  onLogout: () => void;
}

const ParentDashboard: React.FC<ParentDashboardProps> = ({ user, onLogout }) => {
  const [students, setStudents] = useState<(User & { profile: StudentProfile })[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [activeTab, setActiveTab] = useState<'report' | 'settings'>('report');
  const [aiSettings, setAiSettings] = useState<AISettings | null>(null);
  const [viewingSession, setViewingSession] = useState<ChatSession | null>(null);
  const [newDirective, setNewDirective] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchData = () => {
      const myStudents = MockDb.getConnectedStudents(user.id);
      setStudents(myStudents);
      if (myStudents.length > 0 && !selectedStudentId) setSelectedStudentId(myStudents[0].id);
    };
    fetchData();
  }, [user.id, selectedStudentId]);

  useEffect(() => {
    if (selectedStudentId) {
      setSessions(MockDb.getStudentSessions(selectedStudentId));
      setAlerts(MockDb.getParentAlerts(selectedStudentId));
      const student = students.find(s => s.id === selectedStudentId);
      if (student?.profile.settings) setAiSettings(student.profile.settings);
    }
  }, [selectedStudentId, students]);

  const handleUpdateSettings = async (newSettings: AISettings) => {
    if (!selectedStudentId) return;
    setAiSettings(newSettings);
    await MockDb.updateStudentSettings(selectedStudentId, newSettings);
  };

  const handleAddDirective = async () => {
    if (!selectedStudentId || !aiSettings || !newDirective.trim()) return;
    setIsSaving(true);
    const updatedDirectives = [...(aiSettings.parentDirectives || []), newDirective.trim()];
    const updated = { ...aiSettings, parentDirectives: updatedDirectives };
    await handleUpdateSettings(updated);
    setNewDirective('');
    setTimeout(() => setIsSaving(false), 600);
  };

  const handleDeleteDirective = async (index: number) => {
    if (!selectedStudentId || !aiSettings) return;
    const updatedDirectives = aiSettings.parentDirectives.filter((_, i) => i !== index);
    const updated = { ...aiSettings, parentDirectives: updatedDirectives };
    await handleUpdateSettings(updated);
  };

  const toggleGuardrail = (key: keyof AISettings) => {
    if (!aiSettings) return;
    const updated = { ...aiSettings, [key]: !aiSettings[key] };
    handleUpdateSettings(updated);
  };

  const toneData = [
    { name: '안정', value: sessions.filter(s => s.toneLevel === ToneLevel.LOW).length, color: '#10b981' },
    { name: '보통', value: sessions.filter(s => s.toneLevel === ToneLevel.MEDIUM).length, color: '#f59e0b' },
    { name: '주의', value: sessions.filter(s => s.toneLevel === ToneLevel.HIGH).length, color: '#ef4444' },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* 프리미엄 상단바 */}
      <nav className="glass-nav sticky top-0 z-40 px-8 py-5 flex justify-between items-center shadow-sm">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center">
            TEENAI <span className="ml-2 px-2 py-0.5 bg-brand-900 text-white text-[10px] rounded font-black tracking-widest">PRO</span>
        </h1>
        <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center text-xs font-black text-brand-600">P</div>
                <span className="text-sm font-bold text-slate-700">{user.name} 학부모님</span>
            </div>
            <button onClick={onLogout} className="text-slate-400 hover:text-red-500 text-xs font-black transition-colors border-l border-slate-200 pl-6">로그아웃</button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-8 py-10 space-y-8">
        {/* 자녀 선택 섹션 */}
        <div className="flex justify-between items-end border-b border-slate-200 pb-5">
            <div className="flex gap-3">
                {students.map(s => (
                    <button key={s.id} onClick={() => setSelectedStudentId(s.id)} 
                    className={`px-6 py-2.5 rounded-2xl text-sm font-bold transition-all shadow-sm ${selectedStudentId === s.id ? 'bg-brand-900 text-white translate-y-[-1px]' : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-100'}`}>
                        {s.name}
                    </button>
                ))}
                <button onClick={async () => alert(`초대 코드: ${await MockDb.createInviteCode(user.id)}`)} 
                className="w-10 h-10 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300 hover:border-brand-500 hover:text-brand-500 transition-all">+</button>
            </div>
            {selectedStudentId && (
                <div className="flex bg-slate-200/50 p-1 rounded-2xl">
                    <button onClick={() => setActiveTab('report')} className={`px-6 py-2 text-xs font-bold rounded-xl transition-all ${activeTab === 'report' ? 'bg-white text-brand-900 shadow-sm' : 'text-slate-500'}`}>성장 리포트</button>
                    <button onClick={() => setActiveTab('settings')} className={`px-6 py-2 text-xs font-bold rounded-xl transition-all ${activeTab === 'settings' ? 'bg-white text-brand-900 shadow-sm' : 'text-slate-500'}`}>AI 안심 설정</button>
                </div>
            )}
        </div>

        {selectedStudentId ? (
          activeTab === 'report' ? (
            <div className="space-y-8 animate-in fade-in duration-500">
                {alerts.some(a => !a.read) && (
                    <div className="bg-red-500 text-white p-6 rounded-3xl flex items-center justify-between shadow-lg">
                        <div className="flex items-center gap-4">
                            <span className="text-3xl animate-bounce">🚨</span>
                            <div>
                                <h3 className="font-black text-lg">보호자 확인 필요</h3>
                                <p className="text-red-100 text-sm font-medium">최근 대화에서 정서적 불안 징후가 감지되었습니다. 상세 내용을 확인하세요.</p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="premium-card p-8">
                        <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-4">대화 횟수</h3>
                        <p className="text-5xl font-black text-slate-900">{sessions.length}<span className="text-lg text-slate-300 ml-1">회</span></p>
                    </div>
                    <div className="premium-card p-8 md:col-span-2">
                        <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-4">심리 안정도 통계</h3>
                        <div className="h-32">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={toneData}>
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 11, fontWeight: 'bold', fill: '#94a3b8'}} dy={5} />
                                    <Tooltip cursor={{fill: '#F8FAFC'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)'}} />
                                    <Bar dataKey="value" radius={[6, 6, 6, 6]} barSize={35}>
                                        {toneData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                <div className="premium-card overflow-hidden">
                    <div className="px-8 py-5 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                        <h3 className="font-black text-slate-800">활동 타임라인</h3>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Activity Feed</span>
                    </div>
                    <div className="divide-y divide-slate-50">
                        {sessions.length === 0 && <div className="p-20 text-center text-slate-300 font-bold italic">기록된 활동이 없습니다.</div>}
                        {sessions.map(s => (
                            <div key={s.id} onClick={() => setViewingSession(s)} className="px-8 py-5 hover:bg-slate-50 transition-all cursor-pointer group flex items-center gap-6">
                                <div className="w-10 h-10 bg-white border border-slate-100 rounded-xl flex items-center justify-center font-black text-slate-400 group-hover:bg-brand-900 group-hover:text-white transition-all">
                                    {new Date(s.startedAt).getDate()}
                                </div>
                                <div className="flex-1">
                                    <p className="text-[10px] text-slate-400 font-bold mb-0.5">{new Date(s.startedAt).toLocaleString()}</p>
                                    <p className="text-base text-slate-700 font-bold group-hover:text-brand-600 transition-colors">
                                      {s.studentIntent || "상세 분석 내용 보기"}
                                    </p>
                                </div>
                                <svg className="w-5 h-5 text-slate-200 group-hover:text-brand-900 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7"></path></svg>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
          ) : (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                
                {/* SET 1: 필수 안심 가드레일 (Left) & 멘토 말투 성향 (Right) */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-stretch">
                    <div className="lg:col-span-2">
                        <section className="premium-card h-full overflow-hidden flex flex-col">
                            <div className="bg-[#1e1b4b] p-8 text-white">
                                <h3 className="text-xl font-black mb-1 flex items-center gap-3">🛡️ 필수 안심 가드레일</h3>
                                <p className="text-slate-400 text-xs font-medium">자녀의 안전한 대화 환경을 위해 항시 작동하는 시스템 설정입니다.</p>
                            </div>
                            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                                {[
                                    { id: 'strictSafety', label: '성범죄 및 부적절 대화 차단', icon: '🚫', desc: '위험한 접근 시 즉시 대화 중단' },
                                    { id: 'eduMode', label: '자기주도 학습 모드', icon: '✍️', desc: '정답 대신 힌트로 사고력 유도' },
                                    { id: 'socialBalance', label: 'AI 과몰입 방지 시스템', icon: '⏳', desc: '장시간 이용 시 휴식 권장 알림' },
                                    { id: 'cleanLanguage', label: '바른 언어 생활 필터링', icon: '✨', desc: '비속어 사용 시 교정 유도' }
                                ].map(item => (
                                    <div key={item.id} className="flex items-center justify-between p-5 bg-white border border-slate-100 rounded-2xl hover:border-brand-200 transition-all shadow-sm">
                                        <div className="flex gap-4 items-center">
                                            <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-2xl">{item.icon}</div>
                                            <div>
                                                <p className="text-sm font-black text-slate-800">{item.label}</p>
                                                <p className="text-[10px] text-slate-500 mt-0.5">{item.desc}</p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => toggleGuardrail(item.id as keyof AISettings)}
                                            className={`w-12 h-6 rounded-full transition-all flex items-center px-1 shadow-inner ${aiSettings?.[item.id as keyof AISettings] ? 'bg-brand-600 justify-end' : 'bg-slate-300 justify-start'}`}
                                        >
                                            <div className="w-4 h-4 bg-white rounded-full shadow-md"></div>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                    <div className="lg:col-span-1">
                        <section className="premium-card p-8 space-y-6 h-full flex flex-col">
                            <h4 className="text-sm font-black text-slate-800 flex items-center gap-3">
                               <span className="w-1 h-5 bg-brand-900 rounded-full"></span> 멘토 말투 성향
                            </h4>
                            <div className="space-y-3 flex-1">
                                {['gentle', 'logical', 'casual'].map(tone => (
                                    <button key={tone} onClick={() => handleUpdateSettings({...aiSettings!, toneType: tone as any})} 
                                        className={`w-full flex justify-between items-center p-5 rounded-2xl border-2 transition-all duration-300 ${aiSettings?.toneType === tone ? 'border-brand-900 bg-brand-50 text-brand-900 font-black shadow-sm' : 'border-slate-50 text-slate-400 hover:border-slate-200'}`}>
                                        <span className="text-[14px]">{tone === 'gentle' ? '🌸 다정한 멘토' : tone === 'logical' ? '🧠 이성적인 멘토' : '😎 친근한 멘토'}</span>
                                        {aiSettings?.toneType === tone && <div className="w-3 h-3 bg-brand-900 rounded-full"></div>}
                                    </button>
                                ))}
                            </div>
                        </section>
                    </div>
                </div>

                {/* SET 2: AI 개별 지시사항 관리 (Left) & AI 실시간 운영 엔진 상태 (Right) */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-stretch">
                    <div className="lg:col-span-2">
                        <section className="premium-card h-full overflow-hidden flex flex-col">
                            <div className="bg-[#1e1b4b] p-8 text-white">
                                <h3 className="text-xl font-black mb-1 flex items-center gap-3">✍️ AI 개별 지시사항 관리</h3>
                                <p className="text-slate-400 text-xs font-medium">부모님이 AI 멘토에게 내리는 특별 지침입니다. (최우선 반영)</p>
                            </div>
                            <div className="p-8 space-y-8 flex-1">
                                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex flex-col gap-4 shadow-inner">
                                    <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">새 지시사항 추가</h4>
                                    <div className="flex gap-3">
                                        <input className="flex-1 bg-white border border-slate-200 rounded-xl px-5 py-4 text-sm font-bold focus:ring-4 focus:ring-brand-100 outline-none transition-all"
                                            placeholder="예: '시험 기간이니 응원을 평소보다 더 많이 해줘'" value={newDirective} onChange={e => setNewDirective(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddDirective()} />
                                        <button onClick={handleAddDirective} disabled={isSaving || !newDirective.trim()}
                                            className="bg-brand-900 text-white px-8 rounded-xl font-black text-sm hover:bg-black transition-all shadow-lg active:scale-95 disabled:bg-slate-300">
                                            {isSaving ? '저장 중...' : '추가'}
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-2">현재 적용 중인 개별 지시사항</h4>
                                    <div className="grid grid-cols-1 gap-4">
                                        {aiSettings?.parentDirectives.map((d, i) => (
                                            <div key={i} className="flex items-center justify-between bg-white border border-slate-100 p-6 rounded-2xl hover:border-brand-500 transition-all group shadow-sm">
                                                <div className="flex gap-4 items-center">
                                                    <span className="w-8 h-8 bg-brand-50 text-brand-900 text-[10px] font-black rounded-lg flex items-center justify-center border border-brand-100">{i + 1}</span>
                                                    <p className="text-sm text-slate-700 font-bold">{d}</p>
                                                </div>
                                                <button onClick={() => handleDeleteDirective(i)} className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                                </button>
                                            </div>
                                        ))}
                                        {(!aiSettings?.parentDirectives || aiSettings.parentDirectives.length === 0) && (
                                            <div className="text-center py-20 bg-slate-50 border-2 border-dashed border-slate-100 rounded-[2rem]">
                                                <p className="text-slate-300 font-bold italic">등록된 지시사항이 없습니다. 위에 입력해 보세요.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                    <div className="lg:col-span-1">
                        <section className="bg-[#1e1b4b] rounded-[2.5rem] shadow-2xl p-8 text-white h-full relative overflow-hidden flex flex-col">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/10 rounded-full -mr-16 -mt-16"></div>
                            <h3 className="text-sm font-black mb-6 flex items-center gap-2 tracking-tighter">🎯 AI 실시간 운영 엔진 상태</h3>
                            <div className="space-y-8 flex-1">
                                <div>
                                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">활성 개별 지침 리스트</h4>
                                    <div className="space-y-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                                        {aiSettings?.parentDirectives && aiSettings.parentDirectives.length > 0 ? (
                                            aiSettings.parentDirectives.map((d, idx) => (
                                                <div key={idx} className="bg-white/5 p-4 rounded-xl border border-white/5 flex gap-2 items-start animate-in slide-in-from-right-4 duration-300">
                                                    <div className="w-1.5 h-1.5 bg-brand-500 rounded-full mt-1.5"></div>
                                                    <p className="text-[11px] text-slate-300 font-bold leading-tight italic">"{d}"</p>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center py-10 border border-dashed border-slate-700 rounded-xl">
                                                <p className="text-[10px] text-slate-600 font-bold">대기 중인 지침 없음</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="mt-auto pt-6 border-t border-slate-800 space-y-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">엔진 동기화</span>
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></div>
                                            <span className="text-[11px] font-black text-emerald-400">정상 운영 중</span>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">현재 멘토 말투</span>
                                        <span className="text-[11px] font-black text-brand-400 uppercase">{aiSettings?.toneType === 'gentle' ? '다정함' : aiSettings?.toneType === 'logical' ? '이성적' : '친근함'}</span>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>

            </div>
          )
        ) : (
            <div className="text-center py-48 bg-white rounded-[2.5rem] border border-dashed border-slate-200 shadow-inner">
                <p className="text-slate-300 font-black text-lg italic">분석 리포트와 AI 설정을 위해 자녀를 선택해 주세요.</p>
            </div>
        )}
      </main>

      {/* 리포트 모달 */}
      {viewingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setViewingSession(null)}></div>
          <div className="relative bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            <header className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">상세 대화 리포트</h3>
                <p className="text-xs text-slate-400 font-bold mt-1 uppercase tracking-widest">{new Date(viewingSession.startedAt).toLocaleString()}</p>
              </div>
              <button onClick={() => setViewingSession(null)} className="p-3 hover:bg-slate-200 rounded-xl transition-all">
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-10 space-y-10">
              <section className="bg-brand-50 p-6 rounded-3xl border border-brand-100">
                <h4 className="text-[10px] font-black text-brand-500 uppercase tracking-widest mb-3">AI 분석 전문가 의견</h4>
                <p className="text-base text-brand-900 leading-relaxed font-bold italic">
                  "{viewingSession.aiIntervention || viewingSession.summary}"
                </p>
              </section>
              <section className="space-y-6">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">채팅 기록 요약</h4>
                <div className="space-y-4">
                  {viewingSession.messages?.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm font-medium ${m.role === 'user' ? 'bg-brand-900 text-white rounded-tr-none' : 'bg-slate-100 text-slate-800 rounded-tl-none'}`}>
                        {m.text}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <footer className="p-6 border-t border-slate-50 text-center bg-slate-50/50">
              <button onClick={() => setViewingSession(null)} className="text-sm font-black text-brand-900 hover:underline">리포트 닫기</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParentDashboard;
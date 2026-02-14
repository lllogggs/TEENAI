
import React, { useState, useEffect } from 'react';
import { User, ChatSession, SafetyAlert } from '../types';
import { supabase } from '../utils/supabase';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface ParentDashboardProps {
  user: User;
  onLogout: () => void;
}

const ParentDashboard: React.FC<ParentDashboardProps> = ({ user, onLogout }) => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectedStudentCount, setConnectedStudentCount] = useState(0);
  
  const [inviteCode, setInviteCode] = useState(user.my_invite_code);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const { data: profiles, error: profileError } = await supabase
        .from('student_profiles')
        .select('user_id')
        .eq('parent_user_id', user.id);

      if (!profileError && profiles && profiles.length > 0) {
        setConnectedStudentCount(profiles.length);
        const studentId = profiles[0].user_id;

        const [sessionRes, alertRes] = await Promise.all([
          supabase.from('chat_sessions').select('*').eq('student_id', studentId).order('started_at', { ascending: false }),
          supabase.from('safety_alerts').select('*').eq('student_id', studentId).order('created_at', { ascending: false })
        ]);

        if (sessionRes.data) setSessions(sessionRes.data as any);
        if (alertRes.data) setAlerts(alertRes.data as any);
      }
      setLoading(false);
    };

    fetchData();
  }, [user.id]);

  const handleGenerateCode = async () => {
    if (inviteCode && inviteCode !== 'CODE-ERR') {
        if (!confirm('이미 연결 코드가 존재합니다. 재생성하시겠습니까? (기존 연결은 유지됩니다)')) return;
    }
    
    try {
      setGenerating(true);
      const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      let newCode = '';
      for (let i = 0; i < 6; i++) {
        newCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      
      const { error } = await supabase.from('users').update({ my_invite_code: newCode }).eq('id', user.id);
      
      const currentUserStr = localStorage.getItem('teenai_current_user');
      if (currentUserStr) {
        const currentUser = JSON.parse(currentUserStr);
        currentUser.my_invite_code = newCode;
        localStorage.setItem('teenai_current_user', JSON.stringify(currentUser));
      }

      setInviteCode(newCode);
      alert(`새로운 코드가 발급되었습니다: ${newCode}`);
    } catch (e: any) {
      alert('코드 생성 중 오류: ' + e.message);
    } finally {
      setGenerating(false);
    }
  };

  const toneData = [
    { name: '안정', value: sessions.filter(s => s.tone_level === 'low').length, color: '#10b981' },
    { name: '보통', value: sessions.filter(s => s.tone_level === 'medium').length, color: '#f59e0b' },
    { name: '주의', value: sessions.filter(s => s.tone_level === 'high').length, color: '#ef4444' },
  ];

  if (loading) return <div className="h-screen flex items-center justify-center font-black animate-pulse text-brand-900">데이터 동기화 중...</div>;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <nav className="sticky top-0 z-40 px-10 py-6 flex justify-between items-center bg-white/80 backdrop-blur-xl border-b border-slate-100">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">TEENAI <span className="text-[10px] bg-brand-900 text-white px-2 py-0.5 rounded ml-1 uppercase tracking-tighter">Parent</span></h1>
        <div className="flex items-center gap-6">
            <div className="text-right hidden sm:block">
                <p className="text-xs font-black text-slate-400 uppercase">Parent Account</p>
                <p className="text-sm font-bold text-slate-900">{user.name}님</p>
            </div>
            <button onClick={onLogout} className="bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 p-3 rounded-2xl transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
            </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-10 py-12 space-y-10">
        
        {/* 초대 코드 섹션 리디자인 */}
        <div className="bg-brand-900 rounded-[2.5rem] p-12 text-white flex flex-col md:flex-row items-center justify-between shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/20 rounded-full blur-[100px] -mr-32 -mt-32 pointer-events-none group-hover:bg-brand-500/30 transition-all duration-1000"></div>
            <div className="relative z-10 text-center md:text-left">
                <h2 className="text-3xl font-black mb-3 tracking-tight">자녀 연결 코드</h2>
                <p className="text-brand-200 text-sm font-medium leading-relaxed">자녀의 회원가입 화면에서 아래 코드를 입력하세요.<br/>연결된 후에도 코드는 재생성 가능하며 기존 연결은 유지됩니다.</p>
            </div>
            <div className="mt-8 md:mt-0 relative z-10 flex flex-col items-center gap-4">
                <div className="bg-white/10 px-10 py-6 rounded-[2rem] border border-white/20 backdrop-blur-xl flex items-center gap-6 shadow-inner">
                    <span className="text-5xl font-black tracking-[0.25em] font-mono">{inviteCode || 'CODE-ERR'}</span>
                    <button 
                        onClick={handleGenerateCode} 
                        disabled={generating}
                        className="bg-white text-brand-900 hover:bg-brand-50 text-[10px] font-black px-4 py-2 rounded-xl transition-all shadow-lg active:scale-95"
                    >
                        {generating ? '...' : 'REGEN'}
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${connectedStudentCount > 0 ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]' : 'bg-amber-400'}`}></span>
                    <span className="text-[11px] font-black uppercase tracking-[0.15em] opacity-70">
                        {connectedStudentCount > 0 ? `${connectedStudentCount} Student Connected` : 'Waiting for connection'}
                    </span>
                </div>
            </div>
        </div>

        {alerts.length > 0 && (
          <div className="bg-red-500 text-white p-8 rounded-[2rem] shadow-xl shadow-red-500/20 flex items-center gap-6 animate-in slide-in-from-top duration-700">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center text-3xl">⚠️</div>
            <div>
                <h3 className="font-black text-lg">보호 조치 필요 알림</h3>
                <p className="text-sm font-medium opacity-90">자녀의 대화에서 정서적 주의가 필요한 표현이 감지되었습니다. 멘토 리포트를 확인해주세요.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="premium-card p-10 hover:shadow-xl transition-all">
                <h3 className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-6">Total Interactions</h3>
                <p className="text-6xl font-black text-slate-900">{sessions.length}<span className="text-xl text-slate-300 ml-2 font-bold">회</span></p>
            </div>
            <div className="premium-card p-10 md:col-span-2 hover:shadow-xl transition-all">
                <h3 className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-6">Psychological Balance</h3>
                <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={toneData}>
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: '900', fill: '#94a3b8'}} />
                            <Tooltip cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                            <Bar dataKey="value" radius={[10, 10, 10, 10]} barSize={50}>
                                {toneData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>

        <div className="premium-card overflow-hidden">
            <div className="px-10 py-7 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center">
                <h3 className="font-black text-slate-900 tracking-tight">Timeline Analysis</h3>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recent 5 Sessions</span>
            </div>
            <div className="divide-y divide-slate-50">
                {sessions.length === 0 && <div className="p-32 text-center text-slate-300 font-black italic tracking-tighter">No data available yet.</div>}
                {sessions.slice(0, 5).map(s => (
                    <div key={s.id} className="px-10 py-7 hover:bg-slate-50/80 transition-all flex justify-between items-center group">
                        <div className="flex items-center gap-6">
                            <div className={`w-3 h-3 rounded-full ${s.tone_level === 'high' ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]' : 'bg-emerald-500'}`}></div>
                            <div>
                                <p className="text-[11px] text-slate-400 font-black mb-1">{new Date(s.started_at).toLocaleDateString()}</p>
                                <p className="text-base font-bold text-slate-800 group-hover:text-brand-900 transition-colors">{s.student_intent || '일상적인 소통 및 정서 환기'}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <span className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                s.tone_level === 'high' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                            }`}>
                                {s.tone_level === 'high' ? 'Critical' : 'Stable'}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
      </main>
    </div>
  );
};

export default ParentDashboard;

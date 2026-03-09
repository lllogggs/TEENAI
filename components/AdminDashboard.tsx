import React, { useEffect, useState } from 'react';
import { User } from '../types';
import { supabase } from '../utils/supabase';

interface Props {
  user: User;
  onLogout: () => Promise<void>;
}

const AdminDashboard: React.FC<Props> = ({ onLogout }) => {
  const [overview, setOverview] = useState<any>(null);
  const [codes, setCodes] = useState<any[]>([]);
  const [memo, setMemo] = useState('');
  const [maxUses, setMaxUses] = useState(1);
  const [expiresAt, setExpiresAt] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  const authedFetch = async (url: string, options: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
  };

  const load = async () => {
    setLoadError(null);

    const [overviewRes, codeRes] = await Promise.all([
      authedFetch('/api/admin/overview'),
      authedFetch('/api/admin/invite-codes'),
    ]);

    const ov = await overviewRes.json().catch(() => ({}));
    const codePayload = await codeRes.json().catch(() => ({}));

    if (!overviewRes.ok) {
      const detail = ov?.queryErrors ? ` (${JSON.stringify(ov.queryErrors)})` : '';
      setLoadError(ov?.error ? `${ov.error}${detail}` : '대시보드 통계를 불러오지 못했습니다.');
      setOverview(null);
    } else {
      setOverview(ov);
    }

    if (!codeRes.ok) {
      setLoadError((prev) => prev || codePayload?.error || '초대코드 목록을 불러오지 못했습니다.');
      setCodes([]);
    } else {
      setCodes(codePayload.items || []);
    }
  };

  useEffect(() => { load(); }, []);

  const createCode = async () => {
    await authedFetch('/api/admin/invite-codes', {
      method: 'POST',
      body: JSON.stringify({ memo, maxUses, expiresAt: expiresAt || null }),
    });
    setMemo('');
    setMaxUses(1);
    setExpiresAt('');
    await load();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black">운영 대시보드</h1>
          <button onClick={onLogout} className="px-4 py-2 rounded-xl border bg-white text-sm font-bold">로그아웃</button>
        </div>

        {loadError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-bold">대시보드 데이터를 불러오는 중 오류가 발생했습니다.</p>
            <p className="mt-1 break-all">{loadError}</p>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['총 회원수', overview ? overview.totalUsers : '오류'],
            ['오늘 가입자', overview ? overview.todayUsers : '오류'],
            ['전체 채팅 수', overview ? overview.totalChats : '오류'],
            ['오늘 채팅 수', overview ? overview.todayChats : '오류'],
            ['전체 토큰', overview ? (overview?.usage?.input || 0) + (overview?.usage?.output || 0) : '오류'],
            ['오늘 토큰', overview ? (overview?.todayUsage?.input || 0) + (overview?.todayUsage?.output || 0) : '오류'],
            ['누적 비용(USD)', overview ? Number(overview?.usage?.cost || 0).toFixed(4) : '오류'],
            ['주간 이상징후', overview ? (overview?.abuseFlagsWeekly || 0) + (overview?.overUseUsers || 0) : '오류'],
          ].map(([label, value]) => (
            <div key={String(label)} className="bg-white rounded-2xl p-4 border border-slate-100">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-xl font-black mt-1">{value}</p>
            </div>
          ))}
        </div>

        {overview?.sources && (
          <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <h2 className="font-black mb-3">카드 데이터 소스</h2>
            <ul className="text-sm text-slate-600 list-disc pl-5 space-y-1">
              {Object.entries(overview.sources).map(([key, source]) => (
                <li key={key}>
                  <span className="font-bold">{key}</span>: {String(source)}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-white rounded-2xl p-4 border border-slate-100">
          <h2 className="font-black mb-3">초대코드 발급</h2>
          <div className="grid md:grid-cols-4 gap-2">
            <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모" className="border rounded-xl px-3 py-2" />
            <input type="number" value={maxUses} min={1} onChange={(e) => setMaxUses(Number(e.target.value) || 1)} placeholder="사용횟수" className="border rounded-xl px-3 py-2" />
            <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="border rounded-xl px-3 py-2" />
            <button onClick={createCode} className="rounded-xl bg-brand-900 text-white font-bold">발급</button>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-100 overflow-x-auto">
          <h2 className="font-black mb-3">초대코드 조회/사용 여부</h2>
          <table className="min-w-full text-sm">
            <thead><tr className="text-left text-slate-500"><th>코드</th><th>메모</th><th>사용</th><th>만료</th><th>최근사용</th><th>가입방식</th></tr></thead>
            <tbody>
              {codes.map((row) => (
                <tr key={row.code} className="border-t"><td className="py-2 font-bold">{row.code}</td><td>{row.memo || '-'}</td><td>{row.use_count}/{row.max_uses || '∞'}</td><td>{row.expires_at ? new Date(row.expires_at).toLocaleString() : '-'}</td><td>{row.used_at ? new Date(row.used_at).toLocaleString() : '-'}</td><td>{row.auth_provider || '-'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-100">
          <h2 className="font-black mb-3">최근 에러/운영 로그</h2>
          <div className="space-y-2">
            {(overview?.recentLogs || []).map((log: any) => (
              <div key={log.id} className="text-sm border rounded-xl px-3 py-2">
                <b>[{log.level}]</b> {log.message} <span className="text-slate-400">{new Date(log.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;

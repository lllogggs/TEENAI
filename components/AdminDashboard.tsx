import React, { useEffect, useMemo, useState } from 'react';
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
  const [loadDetail, setLoadDetail] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createdCode, setCreatedCode] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  const authedFetch = async (url: string, options: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      throw new Error('로그인 세션을 찾지 못했습니다. 다시 로그인해주세요.');
    }

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
    setLoadDetail(null);

    try {
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
        if (ov?.hasPartialFailure) {
          setLoadDetail('일부 통계 테이블 조회에 실패해 기본값(0)으로 표시된 카드가 있습니다. 아래 데이터 소스/로그를 확인해주세요.');
        }
      }

      if (!codeRes.ok) {
        setLoadError((prev) => prev || codePayload?.error || '초대코드 목록을 불러오지 못했습니다.');
        setCodes([]);
      } else {
        setCodes(codePayload.items || []);
      }
    } catch (error: any) {
      setLoadError(error?.message || '대시보드 로딩 실패');
      setOverview(null);
      setCodes([]);
    }
  };

  useEffect(() => { load(); }, []);

  const createCode = async () => {
    setCreateLoading(true);
    setCreateError(null);
    setCreatedCode('');
    setCopyStatus('');

    try {
      const response = await authedFetch('/api/admin/invite-codes', {
        method: 'POST',
        body: JSON.stringify({ memo, maxUses, expiresAt: expiresAt || null }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || '초대코드 발급에 실패했습니다.');
      }

      setCreatedCode(String(payload?.code || ''));
      setMemo('');
      setMaxUses(1);
      setExpiresAt('');
      await load();
    } catch (error: any) {
      setCreateError(error?.message || '초대코드 발급에 실패했습니다.');
    } finally {
      setCreateLoading(false);
    }
  };

  const copyCreatedCode = async () => {
    if (!createdCode) return;

    try {
      await navigator.clipboard.writeText(createdCode);
      setCopyStatus('복사됨');
      window.setTimeout(() => setCopyStatus(''), 1500);
    } catch {
      setCopyStatus('복사 실패');
    }
  };

  const canIssue = useMemo(() => Number.isFinite(maxUses) && maxUses > 0 && !createLoading, [maxUses, createLoading]);

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
            <button onClick={load} className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-black text-red-700">다시 불러오기</button>
          </div>
        )}

        {loadDetail && !loadError && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-bold">부분 조회 경고</p>
            <p className="mt-1">{loadDetail}</p>
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
          <p className="text-xs text-slate-500 mb-3">메모(선택), 사용 가능 횟수, 만료 일시를 설정하고 발급을 누르세요. 발급된 코드는 아래에서 즉시 복사할 수 있습니다.</p>
          <div className="grid md:grid-cols-4 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-500">메모(선택)</label>
              <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모" className="border rounded-xl px-3 py-2" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-500">사용 가능 횟수</label>
              <input type="number" value={maxUses} min={1} onChange={(e) => setMaxUses(Number(e.target.value) || 1)} placeholder="사용횟수" className="border rounded-xl px-3 py-2" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-500">만료 일시</label>
              <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="border rounded-xl px-3 py-2" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-transparent select-none">발급</span>
              <button onClick={createCode} disabled={!canIssue} className="rounded-xl bg-brand-900 text-white font-bold disabled:opacity-60 py-2">{createLoading ? '발급 중...' : '발급'}</button>
            </div>
          </div>
          {createError && <p className="mt-2 text-xs font-bold text-rose-600">{createError}</p>}
          {createdCode && (
            <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 flex items-center justify-between gap-2">
              <p className="text-sm font-black tracking-widest text-brand-900">{createdCode}</p>
              <button onClick={copyCreatedCode} className="rounded-lg border border-brand-200 bg-white px-2 py-1 text-xs font-black text-brand-900">복사</button>
            </div>
          )}
          {copyStatus && <p className="mt-1 text-xs text-slate-500">{copyStatus}</p>}
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

import { GoogleGenAI } from '@google/genai';
import { ApiError, requireUser } from './_lib/auth';
import { getGeminiKeyOrThrow, getRateLimitConfig, getSummaryConfig } from './_lib/env';
import { allow, getRateLimitKey } from './_lib/rateLimit';
import { createServiceRoleClient } from './_lib/supabase';

const normalizeSummary = (value: unknown) => {
  if (typeof value !== 'string') return '대화 요약을 생성하지 못했습니다.';
  const trimmed = value.trim();
  if (!trimmed) return '대화 요약을 생성하지 못했습니다.';
  if (trimmed.length < 200) return `${trimmed} 학생의 현재 감정과 요청을 조금 더 구체적으로 지켜볼 필요가 있습니다.`.slice(0, 350);
  if (trimmed.length > 350) return trimmed.slice(0, 350);
  return trimmed;
};

const parseBody = (req: any) => {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { user, authedSupabase } = await requireUser(req);
    const { summary: summaryRateLimit } = getRateLimitConfig();
    const rateLimitResult = allow(getRateLimitKey(req, user.id), summaryRateLimit.windowSec, summaryRateLimit.max);

    if (!rateLimitResult.ok) {
      res.setHeader('Retry-After', String(rateLimitResult.retryAfterSec || summaryRateLimit.windowSec));
      res.status(429).json({ error: 'Rate limit exceeded' });
      return;
    }

    const body = parseBody(req);
    const sessionId = String((req.method === 'GET' ? req.query?.sessionId : body.sessionId) || '').trim();

    if (!sessionId) {
      throw new ApiError(400, 'sessionId is required.');
    }

    const { data: sessionRow } = await authedSupabase
      .from('chat_sessions')
      .select('id, summary')
      .eq('id', sessionId)
      .single();

    if (!sessionRow) {
      throw new ApiError(404, 'Session not found.');
    }

    const adminSupabase = createServiceRoleClient();
    const summaryConfig = getSummaryConfig();

    const { data: latestMessages, error: messageError } = await adminSupabase
      .from('messages')
      .select('role, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(summaryConfig.maxHistory);

    if (messageError) {
      throw new ApiError(500, 'Failed to read messages.');
    }

    const messages = [...(latestMessages || [])].reverse();
    if (!messages.length) {
      res.status(200).json({ ok: true, updated: false, skipped: true, reason: 'no_messages' });
      return;
    }

    const { count, error: countError } = await adminSupabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId);

    if (countError) {
      throw new ApiError(500, 'Failed to count messages.');
    }

    const messageCount = count || 0;
    const idleMinSec = summaryConfig.idleMinSec;
    const everyN = Math.max(1, summaryConfig.everyN);
    const lastMessageAt = messages[messages.length - 1]?.created_at;
    const idleMs = lastMessageAt ? Date.now() - new Date(lastMessageAt).getTime() : 0;
    const shouldSummarize = idleMs >= idleMinSec * 1000 || (messageCount > 0 && messageCount % everyN === 0);

    if (!shouldSummarize) {
      res.status(200).json({ ok: true, updated: false, skipped: true, reason: 'trigger_not_met' });
      return;
    }

    const transcript = messages.map((item) => `${item.role}: ${item.content}`).join('\n');
    const ai = new GoogleGenAI({ apiKey: getGeminiKeyOrThrow() });
    const prompt = [
      '다음 청소년 상담 대화를 JSON으로 요약하세요.',
      'summary는 반드시 한국어 2~3문장, 공백 포함 200~350자여야 합니다.',
      '주제, 핵심 감정, 요청 사항, 멘토 개입 요지를 포함하고 민감정보는 제거하세요.',
      "riskLevel은 normal|warn|high 중 하나로 답하세요.",
      'topicTags는 1~5개 한국어 배열로 답하세요.',
      '',
      transcript,
    ].join('\n');

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.2 },
    });

    let summary = '대화 요약을 생성하지 못했습니다.';
    let riskLevel = 'normal';
    let topicTags: string[] = [];

    try {
      const payload = JSON.parse(result.text || '{}');
      summary = normalizeSummary(payload.summary);
      if (payload.riskLevel === 'warn' || payload.riskLevel === 'high' || payload.riskLevel === 'normal') {
        riskLevel = payload.riskLevel;
      }
      if (Array.isArray(payload.topicTags)) {
        topicTags = payload.topicTags.filter((tag: unknown): tag is string => typeof tag === 'string' && tag.trim().length > 0).slice(0, 5);
      }
    } catch {
      summary = normalizeSummary(result.text || summary);
    }

    const { error: updateError } = await adminSupabase
      .from('chat_sessions')
      .update({
        summary,
        risk_level: riskLevel,
        topic_tags: topicTags,
      })
      .eq('id', sessionId);

    if (updateError) {
      throw new ApiError(500, 'Failed to update summary.');
    }

    res.status(200).json({ ok: true, updated: true, skipped: false, summary, risk_level: riskLevel });
  } catch (error: any) {
    const status = typeof error?.status === 'number' ? error.status : 500;
    const message = error?.message || '요약 생성 중 오류가 발생했습니다.';
    console.error('session summary error', { status, message });
    res.status(status).json({ ok: false, error: message });
  }
}

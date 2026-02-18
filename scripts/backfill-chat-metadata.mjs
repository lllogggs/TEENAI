import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;
const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Math.max(parseInt(limitArg.split('=')[1], 10) || 0, 0) : 0;

if (!supabaseUrl || !serviceRoleKey || !geminiApiKey) {
  console.error('Missing required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ai = new GoogleGenAI({ apiKey: geminiApiKey });

const extractJsonObject = (raw) => {
  const trimmed = String(raw || '').trim();
  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) return fencedMatch[1].trim();

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) return trimmed.slice(firstBrace, lastBrace + 1);
  return '{}';
};

const normalizeRiskLevel = (value) => (value === 'stable' || value === 'normal' || value === 'caution' ? value : 'normal');
const sanitizeTitle = (value) => (typeof value === 'string' ? value.replace(/["'`]/g, '').replace(/\s+/g, ' ').trim() : '');

const buildPrompt = ({ currentTitle, transcript, firstMessage }) => [
  '청소년 상담 대화의 메타데이터를 JSON으로 생성하세요.',
  '반드시 아래 JSON 스키마로만 답하세요.',
  '{"title":"...","risk_level":"stable|normal|caution"}',
  '',
  '[risk_level 기준]',
  '- stable: 감정이 안정적이고 위험 신호가 거의 없음',
  '- normal: 걱정/불안/스트레스 언급은 있으나 즉각 위험 신호는 없음',
  '- caution: 자해/자살/폭력/학대/극심한 절망 등 안전 위험 가능성 존재',
  '',
  '[title 규칙]',
  '- 8~20자 한국어',
  '- 구체적인 대화방 제목 형태',
  '- 너무 일반적인 표현(예: 대화, 고민상담) 금지',
  '- 현재 title이 "새 대화"가 아니면 title은 기존 값을 그대로 반환',
  '',
  `현재 title: ${currentTitle || '새 대화'}`,
  '[최근 대화]',
  transcript.length
    ? transcript.map((item, idx) => `${idx + 1}. ${item.role === 'user' ? '학생' : '멘토'}: ${item.content}`).join('\n')
    : `1. 학생: ${firstMessage || ''}`,
].join('\n');

const fetchSessions = async () => {
  let query = supabase
    .from('chat_sessions')
    .select('id,title,risk_level,student_id,started_at')
    .order('started_at', { ascending: false });
  if (limit > 0) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

const fetchMessages = async (sessionId) => {
  const { data, error } = await supabase
    .from('messages')
    .select('role,content,created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || [])
    .filter((m) => (m.role === 'user' || m.role === 'model') && typeof m.content === 'string')
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 400) }));
};

const buildMetadata = async ({ title, transcript }) => {
  const firstMessage = transcript.find((m) => m.role === 'user')?.content || '';
  const prompt = buildPrompt({ currentTitle: title, transcript, firstMessage });
  const result = await ai.models.generateContent({
    model: 'gemini-1.5-flash',
    contents: prompt,
    config: { responseMimeType: 'application/json', temperature: 0.2 },
  });

  const parsed = JSON.parse(extractJsonObject(result.text || '{}'));
  const nextTitle = sanitizeTitle(parsed?.title);
  return {
    title: title !== '새 대화' ? title : nextTitle || sanitizeTitle(firstMessage).slice(0, 20) || '새 대화',
    risk_level: normalizeRiskLevel(parsed?.risk_level),
  };
};

const run = async () => {
  const sessions = await fetchSessions();
  let updated = 0;

  for (const session of sessions) {
    const transcript = await fetchMessages(session.id);
    if (transcript.length === 0) continue;

    const nextMeta = await buildMetadata({ title: session.title || '새 대화', transcript });
    const needsUpdate = nextMeta.title !== (session.title || '새 대화') || nextMeta.risk_level !== (session.risk_level || 'normal');

    if (!needsUpdate) continue;

    if (dryRun) {
      console.log(`[dry-run] ${session.id}:`, { before: { title: session.title, risk_level: session.risk_level }, after: nextMeta });
      updated += 1;
      continue;
    }

    const { error } = await supabase
      .from('chat_sessions')
      .update({ title: nextMeta.title, risk_level: nextMeta.risk_level })
      .eq('id', session.id);

    if (error) {
      console.error(`Update failed for session ${session.id}:`, error.message);
      continue;
    }

    updated += 1;
    console.log(`[updated] ${session.id}: ${nextMeta.title} / ${nextMeta.risk_level}`);
  }

  console.log(`Done. Updated sessions: ${updated}`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

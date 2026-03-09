import { requireAdminUser } from '../_lib/admin-auth';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const auth = await requireAdminUser(req, res);
  if (!auth) return;

  const { adminClient } = auth;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    todayUsers,
    totalChats,
    todayChats,
    usageRows,
    todayUsageRows,
    weeklyUsageRows,
    abuseRows,
    logs,
  ] = await Promise.all([
    adminClient.from('users').select('id', { count: 'exact', head: true }),
    adminClient.from('users').select('id', { count: 'exact', head: true }).gte('created_at', todayStart.toISOString()),
    adminClient.from('messages').select('id', { count: 'exact', head: true }),
    adminClient.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', todayStart.toISOString()),
    adminClient.from('ai_usage_events').select('input_tokens, output_tokens, estimated_cost_usd'),
    adminClient.from('ai_usage_events').select('input_tokens, output_tokens, estimated_cost_usd').gte('created_at', todayStart.toISOString()),
    adminClient.from('ai_usage_events').select('user_id, input_tokens, output_tokens').gte('created_at', weekStart.toISOString()),
    adminClient.from('ai_usage_events').select('id', { count: 'exact', head: true }).eq('abuse_flag', true).gte('created_at', weekStart.toISOString()),
    adminClient.from('system_logs').select('id, level, message, created_at').order('created_at', { ascending: false }).limit(20),
  ]);

  const reduceUsage = (rows: any[] | null | undefined) => (rows || []).reduce((acc, row) => {
    acc.input += Number(row.input_tokens || 0);
    acc.output += Number(row.output_tokens || 0);
    acc.cost += Number(row.estimated_cost_usd || 0);
    return acc;
  }, { input: 0, output: 0, cost: 0 });

  const usage = reduceUsage(usageRows.data);
  const todayUsage = reduceUsage(todayUsageRows.data);

  const weeklyByUser: Record<string, number> = {};
  (weeklyUsageRows.data || []).forEach((row: any) => {
    if (!row.user_id) return;
    weeklyByUser[row.user_id] = (weeklyByUser[row.user_id] || 0) + Number(row.input_tokens || 0) + Number(row.output_tokens || 0);
  });

  const overUseUsers = Object.values(weeklyByUser).filter((tokenCount) => tokenCount > 200000).length;

  res.status(200).json({
    totalUsers: totalUsers.count || 0,
    todayUsers: todayUsers.count || 0,
    totalChats: totalChats.count || 0,
    todayChats: todayChats.count || 0,
    usage,
    todayUsage,
    overUseUsers,
    abuseFlagsWeekly: abuseRows.count || 0,
    recentLogs: logs.data || [],
  });
}

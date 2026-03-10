import { requireAdminUser } from '../_lib/admin-auth';

const DATA_SOURCES = {
  totalUsers: 'public.users (count id)',
  todayUsers: 'public.users (count id where created_at >= today)',
  totalChats: 'public.messages (count id)',
  todayChats: 'public.messages (count id where created_at >= today)',
  usage: 'public.ai_usage_events (sum input_tokens/output_tokens/estimated_cost_usd)',
  todayUsage: 'public.ai_usage_events (sum tokens/cost where created_at >= today)',
  abuseFlagsWeekly: 'public.ai_usage_events (count id where abuse_flag=true and created_at >= 7 days ago)',
  overUseUsers: 'public.ai_usage_events (weekly token sum by user_id > 200000)',
  recentLogs: 'public.system_logs (latest 20 rows)',
};

export default async function handler(req: any, res: any) {
  try {
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

    const queryErrors = [
      ['totalUsers', totalUsers.error],
      ['todayUsers', todayUsers.error],
      ['totalChats', totalChats.error],
      ['todayChats', todayChats.error],
      ['usageRows', usageRows.error],
      ['todayUsageRows', todayUsageRows.error],
      ['weeklyUsageRows', weeklyUsageRows.error],
      ['abuseRows', abuseRows.error],
      ['logs', logs.error],
    ]
      .filter(([, error]) => Boolean(error))
      .map(([name, error]) => {
        const e: any = error || {};
        return {
          name,
          message: typeof e.message === 'string' ? e.message : 'Unknown query error',
          code: typeof e.code === 'string' ? e.code : null,
          hint: typeof e.hint === 'string' ? e.hint : null,
        };
      });

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
      sources: DATA_SOURCES,
      queryErrors,
      hasPartialFailure: queryErrors.length > 0,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to load admin overview',
      detail: error?.message || 'Unknown server error',
    });
  }
}

const requiredClientVars = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
const requiredServerVars = ['GEMINI_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

const targetArg = process.argv.find((arg) => arg.startsWith('--target='));
const validationTarget = (targetArg?.split('=')[1] || 'all').toLowerCase();

const isPlaceholder = (value = '') => {
  const normalized = String(value).trim().toLowerCase();
  return (
    !normalized
    || normalized === 'placeholder'
    || normalized === 'placeholder-key'
    || normalized === 'https://placeholder.supabase.co'
    || normalized.includes('your-')
  );
};

const collectMissing = (keys) => keys.filter((key) => isPlaceholder(process.env[key]));

const shouldCheckClient = validationTarget === 'all' || validationTarget === 'client';
const shouldCheckServer = validationTarget === 'all' || validationTarget === 'server';

const missingClient = shouldCheckClient ? collectMissing(requiredClientVars) : [];
const missingServer = shouldCheckServer ? collectMissing(requiredServerVars) : [];

if (missingClient.length === 0 && missingServer.length === 0) {
  console.log(`[env-check] OK: required ${validationTarget} runtime variables are configured.`);
  process.exit(0);
}

const skipValidation = process.env.SKIP_ENV_VALIDATION === '1';
const expectedTargets = [];
if (shouldCheckClient) expectedTargets.push('VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY');
if (shouldCheckServer) expectedTargets.push('SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY');

const report = [
  `[env-check] Missing required ${validationTarget} environment variables for deploy/runtime.`,
  missingClient.length ? `- Client: ${missingClient.join(', ')}` : '',
  missingServer.length ? `- Server: ${missingServer.join(', ')}` : '',
  `Expected variables for this check: ${expectedTargets.join(', ')}.`,
  'Set variables in Vercel Project Settings > Environment Variables.',
  'If you intentionally want to bypass this check in local build, set SKIP_ENV_VALIDATION=1.',
].filter(Boolean).join('\n');

if (skipValidation) {
  console.warn(report);
  console.warn('[env-check] SKIP_ENV_VALIDATION=1 detected. Continuing by request.');
  process.exit(0);
}

console.error(report);
process.exit(1);

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node scripts/run-supabase-cli.mjs <supabase args...>');
  process.exit(1);
}

const cwd = process.cwd();
const envFiles = ['.env.local', '.env'];
const renamedFiles = [];

try {
  for (const filename of envFiles) {
    const source = path.join(cwd, filename);
    if (!fs.existsSync(source)) continue;

    const backup = `${source}.supabase-cli-backup`;
    if (fs.existsSync(backup)) {
      fs.unlinkSync(backup);
    }

    fs.renameSync(source, backup);
    renamedFiles.push({ source, backup });
  }

  const isWindows = process.platform === 'win32';
  const result = isWindows
    ? spawnSync('cmd.exe', ['/c', 'npx', 'supabase', ...args], {
        cwd,
        stdio: 'inherit',
      })
    : spawnSync('npx', ['supabase', ...args], {
        cwd,
        stdio: 'inherit',
      });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 0);
} finally {
  for (const { source, backup } of renamedFiles.reverse()) {
    if (fs.existsSync(backup) && !fs.existsSync(source)) {
      fs.renameSync(backup, source);
    }
  }
}

import fs from 'node:fs';

const failures = [];

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
if (packageJson.dependencies?.next) {
  failures.push('package.json should not depend on next for the Vite app.');
}

const metadata = JSON.parse(fs.readFileSync(new URL('../metadata.json', import.meta.url), 'utf8'));
if (typeof metadata.description === 'string' && /next\.js/i.test(metadata.description)) {
  failures.push('metadata.json description still references Next.js.');
}

const indexHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
if (/"next"\s*:|"next\/"\s*:/.test(indexHtml)) {
  failures.push('index.html still contains next import map entries.');
}

if (failures.length > 0) {
  console.error('[lint] Repository consistency checks failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('[lint] OK: repository consistency checks passed.');

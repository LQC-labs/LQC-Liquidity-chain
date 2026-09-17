// Syntax-check every JavaScript module under dex/scripts.
// Keeps package.json check:scripts stable as the script surface grows.

import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

async function collect(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collect(full));
    else if (entry.isFile() && /\.(?:mjs|js|cjs)$/.test(entry.name) && full !== fileURLToPath(import.meta.url)) files.push(full);
  }
  return files.sort();
}

const files = await collect(scriptsDir);
if (!files.length) throw new Error('NO_SCRIPTS_FOUND');

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Syntax checked ${files.length} script files.`);

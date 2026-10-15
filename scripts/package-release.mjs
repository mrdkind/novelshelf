#!/usr/bin/env node
/* package-release.mjs — بسته‌بندی سورس NovelShelf برای انتشار
 * شامل: سورس کامل + novels + public (بدون node_modules و dist)
 * استفاده: node scripts/package-release.mjs v1.2.0
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2] ?? 'v1.2.0';
const OUT = `/home/z/my-project/download/NovelShelf-${version}.zip`;

const cmd = `cd ${ROOT} && rm -f "${OUT}" && zip -r -q "${OUT}" . \
  -x "node_modules/*" -x "dist/*" -x ".git/*" -x "*.log" \
  -x ".DS_Store" -x "tool-results/*"`;

execSync(cmd, { stdio: 'inherit' });
const listing = execSync(`unzip -l "${OUT}" | tail -1`).toString().trim();
const count = execSync(`unzip -l "${OUT}" | grep -c " 0"`).toString().trim();
console.log('✓ بسته ساخته شد:', OUT);
console.log(listing);

#!/usr/bin/env node
/**
 * build-catalog.mjs — ساخت کاتالوگ سایت از پوشه novels/
 *
 * وظایف:
 *  1) شناسایی پوشه‌های کتاب
 *  2) خواندن و اعتبارسنجی info.json
 *  3) بررسی وجود کاور و EPUBها و استخراج فهرست فصل‌ها از داخل EPUB
 *  4) تولید public/catalog.json با مسیرهای نسبی به ریشه سایت (سازگار با Base Path)
 *  5) گزارش خطاهای خوانا؛ کتاب خراب با هشدار حذف می‌شود (سیاست مستند در README)
 *
 * خروجی تکرارپذیر است و به وضعیت قبلی وابسته نیست.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listNovelFolders,
  inspectNovelFolder,
  inspectEpubFiles,
  fmtSize,
} from './lib/library.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

function argValue(name, fallback) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}
const hasFlag = (name) => args.includes(name);

const novelsDir = path.resolve(ROOT, argValue('--novels-dir', 'novels'));
const outPath = path.resolve(ROOT, argValue('--out', path.join('public', 'catalog.json')));
const strict = hasFlag('--strict'); // با خطای هر کتاب، کل Build شکست می‌خورد

/** گزارش‌های خوانای فارسی */
let errors = 0;
let warnings = 0;
const log = (...m) => console.log(...m);
const err = (slug, msg) => {
  errors += 1;
  console.error(`  ✗ [${slug}] ${msg}`);
};
const warn = (slug, msg) => {
  warnings += 1;
  console.warn(`  ⚠ [${slug}] ${msg}`);
};

async function main() {
  log('╔══════════════════════════════════════════╗');
  log('║  NovelShelf — ساخت کاتالوگ کتابخانه       ║');
  log('╚══════════════════════════════════════════╝');
  log(`پوشه کتاب‌ها: ${path.relative(ROOT, novelsDir) || 'novels/'}`);

  const slugs = listNovelFolders(novelsDir);
  if (slugs.length === 0) {
    log('  ⚠ هیچ پوشه کتابی در novels/ پیدا نشد؛ کاتالوگ خالی تولید می‌شود.');
  }

  /** @type {any[]} */
  const novels = [];
  /** @type {{slug:string, message:string}[]} */
  const skipped = [];

  for (const slug of slugs) {
    log(`\n▶ بررسی «${slug}»`);
    const folderPath = path.join(novelsDir, slug);
    const { info, issues } = await inspectNovelFolder(slug, folderPath, novelsDir);

    for (const issue of issues) {
      if (issue.severity === 'error') err(slug, issue.message);
      else warn(slug, issue.message);
    }
    if (issues.some((i) => i.severity === 'error')) {
      if (strict) {
        console.error(`\nخطا: کتاب «${slug}» نامعتبر است و در حالت --strict انتشار متوقف می‌شود.`);
        process.exit(1);
      }
      skipped.push({ slug, message: 'اطلاعات یا فایل‌های نامعتبر (جزئیات بالا)' });
      continue;
    }

    // --- استخراج متادیتای EPUBها ---
    const volumes = [];
    let bookBroken = false;
    const sortedVols = [...(info.volumes ?? [])].sort(
      (a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || String(a.file).localeCompare(String(b.file)),
    );
    const epubs = await inspectEpubFiles(folderPath, sortedVols);
    sortedVols.forEach((vol, index) => {
      const result = epubs.get(vol.file);
      if (!result) return; // خطای فایل مفقود بالا گزارش شده
      if (!result.ok) {
        err(slug, `جلد «${vol.file}»: ${result.error}`);
        if (strict) {
          console.error('\nخطا: در حالت --strict انتشار متوقف می‌شود.');
          process.exit(1);
        }
        bookBroken = true;
        return;
      }
      const meta = result.meta;
      log(`  ✓ جلد «${vol.file}» — ${meta.spineCount} سند، فهرست: ${meta.tocSource === 'nav' ? 'nav (EPUB 3)' : meta.tocSource === 'ncx' ? 'ncx (EPUB 2)' : 'از spine'}`);
      volumes.push({
        id: vol.file.replace(/\.epub$/i, ''),
        file: `novels/${slug}/${vol.file}`,
        title: typeof vol.title === 'string' && vol.title.trim() ? vol.title.trim() : `جلد ${index + 1}`,
        order: typeof vol.order === 'number' ? vol.order : index + 1,
        size: meta.size,
        spineCount: meta.spineCount,
        tocSource: meta.tocSource,
        language: meta.language || info.language || null,
        title_: meta.title || null,
        chapters: meta.chapters.map((c) => ({ title: c.title, href: c.href })),
      });
    });

    if (bookBroken || volumes.length === 0) {
      if (volumes.length === 0 && !bookBroken) {
        err(slug, 'هیچ جلد قابل استفاده‌ای پیدا نشد.');
      }
      skipped.push({ slug, message: 'فایل EPUB خراب یا مفقود (جزئیات بالا)' });
      continue;
    }

    const coverSize = fs.statSync(path.join(folderPath, info.cover)).size;
    novels.push({
      id: info.id,
      titleOriginal: info.titleOriginal ?? null,
      titleFa: info.titleFa ?? null,
      titleAlt: Array.isArray(info.titleAlt) ? info.titleAlt : [],
      author: info.author,
      translator: info.translator ?? null,
      description: info.description.trim(),
      genres: info.genres,
      language: info.language,
      direction: ['rtl', 'ltr', 'auto'].includes(info.direction) ? info.direction : 'auto',
      status: info.status,
      cover: `novels/${slug}/${info.cover}`,
      coverSize,
      year: Number.isInteger(info.year) ? info.year : null,
      license: info.license ?? null,
      source: info.source ?? null,
      notes: info.notes ?? null,
      addedAt: typeof info.addedAt === 'string' ? info.addedAt : null,
      volumes,
    });
    log(`  ✓ کتاب «${slug}» با ${volumes.length} جلد ثبت شد.`);
  }

  // --- مرتب‌سازی: جدیدترین addedAt، سپس عنوان فارسی ---
  novels.sort((a, b) => {
    const ta = a.addedAt ? Date.parse(a.addedAt) : NaN;
    const tb = b.addedAt ? Date.parse(b.addedAt) : NaN;
    if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return tb - ta;
    if (!Number.isNaN(ta) && Number.isNaN(tb)) return -1;
    if (Number.isNaN(ta) && !Number.isNaN(tb)) return 1;
    return String(a.titleFa ?? a.titleOriginal ?? '').localeCompare(
      String(b.titleFa ?? b.titleOriginal ?? ''),
      'fa',
    );
  });

  const catalog = {
    version: 1,
    generatedAt: new Date().toISOString(),
    novels,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2), 'utf8');

  log('\n─────────────── گزارش ───────────────');
  log(`کتاب‌های منتشرشده: ${novels.length}`);
  for (const n of novels) {
    const chapters = n.volumes.reduce((s, v) => s + v.chapters.length, 0);
    const size = n.volumes.reduce((s, v) => s + (v.size ?? 0), 0);
    log(`  • ${n.id} — ${n.volumes.length} جلد، ${chapters} فصل، ${fmtSize(size)}`);
  }
  if (skipped.length > 0) {
    log(`کتاب‌های حذف‌شده از کاتالوگ: ${skipped.length}`);
    for (const s of skipped) log(`  ✗ ${s.slug}: ${s.message}`);
  }
  log(`هشدارها: ${warnings} | خطاها: ${errors}`);
  log(`خروجی: ${path.relative(ROOT, outPath)}`);

  if (errors > 0 && strict) process.exit(1);
  log('\n✓ کاتالوگ با موفقیت ساخته شد.');
}

main().catch((e) => {
  console.error('خطای غیرمنتظره در ساخت کاتالوگ:', e);
  process.exit(1);
});

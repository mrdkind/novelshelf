#!/usr/bin/env node
/**
 * validate-library.mjs — اعتبارسنجی کامل کتابخانه (شامل بررسی ساختاری EPUBها)
 *
 * موارد بررسی:
 *  - JSON معتبر و فیلدهای اجباری info.json
 *  - یکتا بودن شناسه‌ها و تطابق شناسه با نام پوشه
 *  - وجود کاور و EPUBهای معرفی‌شده + پسوند و نوع فایل
 *  - نام‌های فایل غیرمجاز یا مشکل‌ساز + مسیرهای نسبی امن
 *  - حجم فایل‌ها (هشدار از ۲۵ مگابایت = محدودیت آپلود وب GitHub)
 *  - خطاهای قابل تشخیص ساختار EPUB (پایه؛ جایگزین EPUBCheck نیست)
 *
 * کد خروج: 0 = سالم، 1 = حداقل یک خطا (انتشار در CI متوقف می‌شود)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listNovelFolders,
  inspectNovelFolder,
  inspectEpubFiles,
} from './lib/library.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const novelsDir = path.resolve(ROOT, process.argv[2] ?? 'novels');

async function main() {
  console.log('اعتبارسنجی کتابخانه…');
  const slugs = listNovelFolders(novelsDir);

  let errorCount = 0;
  let warningCount = 0;
  /** @type {string[]} */
  const errorLines = [];

  if (slugs.length === 0) {
    console.warn('⚠ توجه: هیچ کتابی در novels/ وجود ندارد (کاتالوگ خالی منتشر می‌شود).');
  }

  const seenIds = new Map();
  const report = [];

  for (const slug of slugs) {
    const folderPath = path.join(novelsDir, slug);
    const { info, issues } = await inspectNovelFolder(slug, folderPath, novelsDir);

    // EPUBهای موجود را هم ساختاریا بررسی کن
    if (info && Array.isArray(info.volumes)) {
      const epubs = await inspectEpubFiles(folderPath, info.volumes);
      for (const [file, r] of epubs) {
        if (!r.ok) {
          issues.push({ severity: 'error', message: `ساختار EPUB «${file}» نامعتبر: ${r.error}` });
        } else {
          const meta = r.meta;
          if (!meta.chapters.length) {
            issues.push({ severity: 'warning', message: `در «${file}» فهرست مطالب قابل استخراج نبود؛ از spine استفاده می‌شود.` });
          }
        }
      }
    }

    if (info?.id) {
      if (seenIds.has(info.id)) {
        issues.push({
          severity: 'error',
          message: `شناسه «${info.id}» تکراری است؛ قبلاً در پوشه «${seenIds.get(info.id)}» استفاده شده.`,
        });
      } else {
        seenIds.set(info.id, slug);
      }
    }

    for (const issue of issues) {
      if (issue.severity === 'error') {
        errorCount += 1;
        errorLines.push(`  ✗ [${slug}] ${issue.message}`);
      } else {
        warningCount += 1;
        report.push(`  ⚠ [${slug}] ${issue.message}`);
      }
    }
  }

  // --- بررسی تداخل نام فایل خروجی کاتالوگ و مسیر خروجی ---
  const outPublic = path.join(ROOT, 'public');
  if (fs.existsSync(path.join(outPublic, 'catalog.json'))) {
    report.push('  ⚠ فایل public/catalog.json کامیت شده است؛ این فایل در Build تولید می‌شود و باید از مخزن حذف شود.');
  }

  console.log('─────────────── گزارش اعتبارسنجی ───────────────');
  for (const line of report) console.warn(line);
  for (const line of errorLines) console.error(line);

  console.log(`پوشه‌های بررسی‌شده: ${slugs.length}`);
  console.log(`خطاها: ${errorCount} | هشدارها: ${warningCount}`);

  if (errorCount > 0) {
    console.error('\n✗ اعتبارسنجی شکست خورد. موارد بالا را برطرف کنید تا انتشار ادامه یابد.');
    console.error('  راهنما: بخش «عیب‌یابی» در README.md');
    process.exit(1);
  }
  console.log('\n✓ کتابخانه سالم است.');
}

main().catch((e) => {
  console.error('خطای غیرمنتظره در اعتبارسنجی:', e);
  process.exit(1);
});

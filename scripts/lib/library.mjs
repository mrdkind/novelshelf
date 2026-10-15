/**
 * اعتبارسنجی ساختار کتابخانه و فایل‌های info.json.
 * این ماژول بین build-catalog و validate-library مشترک است.
 *
 * سیاست خطا (در README هم مستند شده):
 *  - «خطا» (Error): اطلاعات ناقص/خراب یا فایل‌های مفقود → کتاب از کاتالوگ حذف می‌شود و
 *    validate:library با کد خروج ۱ کل انتشار را متوقف می‌کند.
 *  - «هشدار» (Warning): مشکلات غیربازدارنده مثل حجم زیاد یا نام فایل مشکل‌ساز → فقط گزارش می‌شود.
 */
import fs from 'node:fs';
import path from 'node:path';
import { readEpubMeta, EpubParseError } from './epub-meta.mjs';

export const REQUIRED_ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
export const ALLOWED_COVER_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.avif'];
export const DANGEROUS_NAME_RE = /[\\^:`'"<>|?*\u0000-\u001f]|^\.{1,2}$|\.\./;
export const GITHUB_WEB_UPLOAD_LIMIT = 25 * 1024 * 1024; // 25 MiB محدودیت آپلود وب GitHub
const COVER_SIZE_WARN = 2 * 1024 * 1024;
const EPUB_SIZE_WARN = 25 * 1024 * 1024;

const STATUSES = new Set(['ongoing', 'completed', 'hiatus']);
const DIRECTIONS = new Set(['auto', 'rtl', 'ltr']);

/**
 * @typedef {Object} Issue
 * @property {'error'|'warning'} severity
 * @property {string} message
 */

/**
 * بررسی ساختار info.json یک کتاب.
 * @param {string} slug نام پوشه کتاب
 * @param {string} folderPath مسیر کامل پوشه
 * @param {string} novelsDir مسیر ریشه novels
 * @returns {Promise<{info: any|null, issues: Issue[]}>}
 */
export async function inspectNovelFolder(slug, folderPath, novelsDir) {
  /** @type {Issue[]} */
  const issues = [];
  const infoPath = path.join(folderPath, 'info.json');

  if (!fs.existsSync(infoPath)) {
    issues.push({ severity: 'error', message: 'فایل info.json وجود ندارد.' });
    return { info: null, issues };
  }

  let info;
  try {
    info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
  } catch (e) {
    issues.push({ severity: 'error', message: `info.json قابل تحلیل نیست (JSON نامعتبر): ${e.message}` });
    return { info: null, issues };
  }

  if (typeof info !== 'object' || info === null || Array.isArray(info)) {
    issues.push({ severity: 'error', message: 'info.json باید یک شیء (object) JSON باشد.' });
    return { info: null, issues };
  }

  // --- شناسه ---
  if (typeof info.id !== 'string' || !REQUIRED_ID_RE.test(info.id)) {
    issues.push({
      severity: 'error',
      message: `شناسه «id» نامعتبر است: باید حروف کوچک انگلیسی، عدد و خط تیره و بین ۲ تا ۶۴ کاراکتر باشد (الان: «${String(info.id)}»).`,
    });
  } else if (info.id !== slug) {
    issues.push({
      severity: 'error',
      message: `شناسه کتاب (${info.id}) باید با نام پوشه (${slug}) یکی باشد تا مسیرها قابل پیش‌بینی بمانند.`,
    });
  }

  // --- فیلدهای اجباری متنی ---
  if (!isNonEmptyString(info.titleOriginal) && !isNonEmptyString(info.titleFa)) {
    issues.push({ severity: 'error', message: 'حداقل یکی از «titleOriginal» یا «titleFa» لازم است.' });
  }
  if (!isNonEmptyString(info.author)) {
    issues.push({ severity: 'error', message: 'فیلد «author» (نویسنده) اجباری است.' });
  }
  if (!isNonEmptyString(info.description) || info.description.trim().length < 20) {
    issues.push({ severity: 'error', message: '«description» (خلاصه داستان) اجباری است و باید حداقل ۲۰ نویسه باشد.' });
  }
  if (!Array.isArray(info.genres) || info.genres.length === 0 || !info.genres.every(isNonEmptyString)) {
    issues.push({ severity: 'error', message: '«genres» باید آرایه‌ای غیرخالی از رشته‌ها باشد.' });
  }
  if (!isNonEmptyString(info.language)) {
    issues.push({ severity: 'error', message: '«language» (زبان کتاب، مثل fa یا en) اجباری است.' });
  }
  if (!STATUSES.has(info.status)) {
    issues.push({
      severity: 'error',
      message: `«status» باید یکی از ongoing / completed / hiatus باشد (الان: «${String(info.status)}»).`,
    });
  }
  if (info.direction !== undefined && !DIRECTIONS.has(info.direction)) {
    issues.push({ severity: 'error', message: '«direction» (در صورت تعریف) باید auto / rtl / ltr باشد.' });
  }
  for (const optField of ['titleFa', 'titleOriginal', 'translator', 'notes', 'license', 'source']) {
    if (info[optField] !== undefined && info[optField] !== null && !isNonEmptyString(info[optField])) {
      issues.push({ severity: 'error', message: `فیلد «${optField}» در صورت تعریف باید رشته باشد.` });
    }
  }
  if (info.titleAlt !== undefined && (!Array.isArray(info.titleAlt) || !info.titleAlt.every(isNonEmptyString))) {
    issues.push({ severity: 'error', message: '«titleAlt» باید آرایه‌ای از رشته‌ها باشد.' });
  }
  if (info.year !== undefined && info.year !== null && (!Number.isInteger(info.year) || info.year < 0 || info.year > 3000)) {
    issues.push({ severity: 'warning', message: '«year» یک عدد سال معتبر نیست؛ نادیده گرفته می‌شود.' });
  }
  if (info.addedAt !== undefined && !isNonEmptyString(info.addedAt)) {
    issues.push({ severity: 'warning', message: '«addedAt» باید رشته تاریخ (مثل 2026-10-15) باشد.' });
  }

  // --- کاور ---
  if (!isNonEmptyString(info.cover)) {
    issues.push({ severity: 'error', message: '«cover» (نام فایل کاور) اجباری است.' });
  } else {
    if (path.isAbsolute(info.cover) || DANGEROUS_NAME_RE.test(path.basename(info.cover))) {
      issues.push({ severity: 'error', message: `نام فایل کاور («${info.cover}») معتبر نیست.` });
    } else {
      const coverPath = path.join(folderPath, info.cover);
      if (!fs.existsSync(coverPath) || !fs.statSync(coverPath).isFile()) {
        issues.push({ severity: 'error', message: `فایل کاور «${info.cover}» در پوشه کتاب پیدا نشد.` });
      } else {
        const ext = path.extname(info.cover).toLowerCase();
        if (!ALLOWED_COVER_EXT.includes(ext)) {
          issues.push({
            severity: 'error',
            message: `پسوند کاور «${ext}» مجاز نیست؛ مجاز: ${ALLOWED_COVER_EXT.join('، ')}`,
          });
        }
        const size = fs.statSync(coverPath).size;
        if (size > COVER_SIZE_WARN) {
          issues.push({
            severity: 'warning',
            message: `کاور «${info.cover}» بزرگ‌تر از ۲ مگابایت است (${fmtSize(size)})؛ بهتر است فشرده شود.`,
          });
        }
      }
    }
  }

  // --- جلدها (EPUB) ---
  if (!Array.isArray(info.volumes) || info.volumes.length === 0) {
    issues.push({ severity: 'error', message: '«volumes» باید آرایه‌ای غیرخالی از جلدها باشد.' });
  } else {
    const seenFiles = new Set();
    const seenOrders = new Set();
    info.volumes.forEach((vol, i) => {
      const label = `جلد ${i + 1}`;
      if (typeof vol !== 'object' || vol === null) {
        issues.push({ severity: 'error', message: `${label}: هر جلد باید یک شیء باشد.` });
        return;
      }
      if (!isNonEmptyString(vol.file)) {
        issues.push({ severity: 'error', message: `${label}: «file» (نام فایل EPUB) اجباری است.` });
      } else {
        if (vol.file.includes('/') || path.isAbsolute(vol.file) || DANGEROUS_NAME_RE.test(vol.file)) {
          issues.push({ severity: 'error', message: `${label}: نام فایل «${vol.file}» معتبر نیست (باید فقط نام فایل ساده باشد).` });
        } else if (path.extname(vol.file).toLowerCase() !== '.epub') {
          issues.push({ severity: 'error', message: `${label}: فایل «${vol.file}» باید پسوند .epub داشته باشد.` });
        } else {
          const epubPath = path.join(folderPath, vol.file);
          if (!fs.existsSync(epubPath) || !fs.statSync(epubPath).isFile()) {
            issues.push({ severity: 'error', message: `${label}: فایل EPUB «${vol.file}» در پوشه کتاب پیدا نشد.` });
          } else {
            const size = fs.statSync(epubPath).size;
            if (size > EPUB_SIZE_WARN) {
              issues.push({
                severity: 'warning',
                message: `${label}: فایل «${vol.file}» (${fmtSize(size)}) از حد ۲۵ مگابایت آپلود با رابط وب GitHub بزرگ‌تر است؛ برای آپلود بعدی از Git یا Git LFS استفاده کنید.`,
              });
            }
          }
          if (seenFiles.has(vol.file)) {
            issues.push({ severity: 'error', message: `${label}: فایل «${vol.file}» دو بار تعریف شده است.` });
          }
          seenFiles.add(vol.file);
        }
      }
      if (vol.order !== undefined && (!Number.isInteger(vol.order) || vol.order < 1)) {
        issues.push({ severity: 'error', message: `${label}: «order» باید عدد صحیح مثبت باشد.` });
      } else if (vol.order !== undefined) {
        if (seenOrders.has(vol.order)) {
          issues.push({ severity: 'error', message: `${label}: ترتیب تکراری «order: ${vol.order}» بین جلدها.` });
        }
        seenOrders.add(vol.order);
      }
      if (vol.title !== undefined && vol.title !== null && !isNonEmptyString(vol.title)) {
        issues.push({ severity: 'error', message: `${label}: «title» در صورت تعریف باید رشته باشد.` });
      }
    });
  }

  // --- فایل‌های بی‌استفاده داخل پوشه (هشدار) ---
  const entries = fs.readdirSync(folderPath);
  for (const name of entries) {
    if (name === 'info.json') continue;
    const isCover = info.cover === name;
    const isVolume = Array.isArray(info.volumes) && info.volumes.some((v) => v?.file === name);
    if (!isCover && !isVolume && !name.startsWith('.')) {
      const full = path.join(folderPath, name);
      if (fs.statSync(full).isFile()) {
        issues.push({
          severity: 'warning',
          message: `فایل «${name}» در پوشه کتاب قرار دارد ولی در info.json به آن اشاره نشده؛ در سایت منتشر نمی‌شود.`,
        });
      }
    }
  }

  void novelsDir;
  return { info, issues };
}

/**
 * باز کردن و بررسی ساختاری EPUBهای یک کتاب.
 * @returns {Promise<Map<string, {ok: boolean, meta?: any, error?: string}>>}
 */
export async function inspectEpubFiles(folderPath, volumes) {
  const results = new Map();
  for (const vol of volumes ?? []) {
    if (!vol?.file || path.extname(vol.file).toLowerCase() !== '.epub') continue;
    const epubPath = path.join(folderPath, vol.file);
    if (!fs.existsSync(epubPath)) continue;
    try {
      const buf = fs.readFileSync(epubPath);
      const meta = await readEpubMeta(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      results.set(vol.file, { ok: true, meta });
    } catch (e) {
      const msg = e instanceof EpubParseError ? e.message : `خواندن EPUB ناموفق بود: ${e.message}`;
      results.set(vol.file, { ok: false, error: msg });
    }
  }
  return results;
}

export function isNonEmptyString(x) {
  return typeof x === 'string' && x.trim().length > 0;
}

export function fmtSize(bytes) {
  if (!Number.isFinite(bytes)) return '؟';
  if (bytes < 1024) return `${bytes} بایت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} کیلوبایت`;
  return `${(bytes / 1024 / 1024).toFixed(1)} مگابایت`;
}

/** فهرست پوشه‌های کتاب (فقط دایرکتوری‌های بدون نقطه ابتدایی) */
export function listNovelFolders(novelsDir) {
  if (!fs.existsSync(novelsDir)) return [];
  return fs
    .readdirSync(novelsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, 'en'));
}

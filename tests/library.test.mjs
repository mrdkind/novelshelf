import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { inspectNovelFolder, listNovelFolders } from '../scripts/lib/library.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const FIXTURE_EPUB = path.join(__dirname, 'fixtures', 'valid-epub3.epub');

/** ساخت کتابخانه موقت با پوشه‌های آزمونی */
function makeTempLibrary(cases) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'novelshelf-lib-'));
  for (const c of cases) {
    const folder = path.join(dir, c.slug);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'info.json'), JSON.stringify(c.info, null, 2));
    // پیش‌فرض: کاور و EPUB سالم بساز (مگر آزمون فایل‌های سفارشی داده باشد)
    const files = c.files === undefined ? { 'cover.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>', 'volume-01.epub': fs.readFileSync(FIXTURE_EPUB) } : c.files;
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(folder, name), content);
    }
  }
  return dir;
}

const VALID = {
  id: 'test-book',
  titleFa: 'کتاب آزمونی',
  author: 'نویسنده آزمون',
  description: 'توضیحاتی به اندازه کافی بلند برای قبول شدن در اعتبارسنجی خودکار.',
  genres: ['آزمون'],
  language: 'fa',
  status: 'ongoing',
  cover: 'cover.svg',
  volumes: [{ file: 'volume-01.epub', title: 'جلد ۱', order: 1 }],
};

function errorsOf(issues) {
  return issues.filter((i) => i.severity === 'error');
}

describe('اعتبارسنجی کتابخانه', () => {
  it('فهرست پوشه‌ها فقط دایرکتوری‌ها را می‌گیرد', () => {
    const dir = makeTempLibrary([
      { slug: 'a-book', info: VALID },
      { slug: 'bad-book', info: VALID },
    ]);
    fs.writeFileSync(path.join(dir, 'stray.txt'), 'not a folder');
    fs.mkdirSync(path.join(dir, '.hidden'));
    expect(listNovelFolders(dir)).toEqual(['a-book', 'bad-book']);
  });

  it('کتاب کامل: بدون خطا', async () => {
    const dir = makeTempLibrary([{ slug: 'test-book', info: VALID }]);
    const { issues } = await inspectNovelFolder('test-book', path.join(dir, 'test-book'), dir);
    expect(errorsOf(issues)).toHaveLength(0);
  });

  it('JSON خراب → خطا', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-badjson-'));
    const folder = path.join(dir, 'broken');
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, 'info.json'), '{ invalid json !!');
    const { issues } = await inspectNovelFolder('broken', folder, dir);
    expect(errorsOf(issues).some((i) => i.message.includes('JSON'))).toBe(true);
  });

  it('شناسه تکراری/نامنطبق با پوشه → خطا', async () => {
    const dir = makeTempLibrary([{ slug: 'folder-name', info: { ...VALID, id: 'other-id' } }]);
    const { issues } = await inspectNovelFolder('folder-name', path.join(dir, 'folder-name'), dir);
    expect(errorsOf(issues).some((i) => i.message.includes('یکی باشد'))).toBe(true);
  });

  it('کاور مفقود → خطا', async () => {
    const dir = makeTempLibrary([{ slug: 'test-book', info: VALID, files: {} }]);
    const { issues } = await inspectNovelFolder('test-book', path.join(dir, 'test-book'), dir);
    expect(errorsOf(issues).some((i) => i.message.includes('کاور'))).toBe(true);
  });

  it('EPUB مفقود → خطا', async () => {
    const dir = makeTempLibrary([{ slug: 'test-book', info: VALID, files: { 'cover.svg': '<svg/>' } }]);
    const { issues } = await inspectNovelFolder('test-book', path.join(dir, 'test-book'), dir);
    expect(errorsOf(issues).some((i) => i.message.includes('EPUB'))).toBe(true);
  });

  it('فیلدهای اختیاری خالی نباید خرابی بسازند', async () => {
    const info = {
      ...VALID,
      translator: null,
      titleAlt: ['Alt 1', 'Alt 2'],
      year: null,
      notes: null,
      license: null,
      source: null,
      addedAt: null,
    };
    const dir = makeTempLibrary([{ slug: 'test-book', info }]);
    const { issues } = await inspectNovelFolder('test-book', path.join(dir, 'test-book'), dir);
    expect(errorsOf(issues)).toHaveLength(0);
  });

  it('وضعیت انتشار نامعتبر → خطا', async () => {
    const dir = makeTempLibrary([{ slug: 'test-book', info: { ...VALID, status: 'unknown-status' } }]);
    const { issues } = await inspectNovelFolder('test-book', path.join(dir, 'test-book'), dir);
    expect(errorsOf(issues).some((i) => i.message.includes('status'))).toBe(true);
  });

  it('نام فایل مشکل‌ساز (..) → خطا', async () => {
    const dir = makeTempLibrary([
      { slug: 'test-book', info: { ...VALID, cover: '../evil.svg' } },
    ]);
    const { issues } = await inspectNovelFolder('test-book', path.join(dir, 'test-book'), dir);
    expect(errorsOf(issues).some((i) => i.message.includes('کاور'))).toBe(true);
  });

  it('پسوند غیرمجاز کاور → خطا', async () => {
    const dir = makeTempLibrary([
      { slug: 'test-book', info: { ...VALID, cover: 'cover.bmp' }, files: { 'cover.bmp': 'x' } },
    ]);
    const { issues } = await inspectNovelFolder('test-book', path.join(dir, 'test-book'), dir);
    expect(errorsOf(issues).some((i) => i.message.includes('پسوند'))).toBe(true);
  });

  it('کاور WebP و JPG مجاز هستند', async () => {
    for (const ext of ['cover.webp', 'cover.jpg']) {
      const dir = makeTempLibrary([{ slug: 'test-book', info: { ...VALID, cover: ext }, files: { [ext]: 'x' } }]);
      const { issues } = await inspectNovelFolder('test-book', path.join(dir, 'test-book'), dir);
      expect(errorsOf(issues).some((i) => i.message.includes('پسوند'))).toBe(false);
    }
  });

  it('فایل بی‌استفاده در پوشه → هشدار (نه خطا)', async () => {
    const dir = makeTempLibrary([
      {
        slug: 'test-book',
        info: VALID,
        files: {
          'cover.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
          'volume-01.epub': fs.readFileSync(FIXTURE_EPUB),
          'unused.txt': '؟',
        },
      },
    ]);
    const { issues } = await inspectNovelFolder('test-book', path.join(dir, 'test-book'), dir);
    expect(errorsOf(issues)).toHaveLength(0);
    expect(issues.some((i) => i.severity === 'warning' && i.message.includes('unused.txt'))).toBe(true);
  });
});

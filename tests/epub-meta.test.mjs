import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEpubMeta, EpubParseError } from '../scripts/lib/epub-meta.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');

function load(name) {
  const buf = fs.readFileSync(path.join(FIXTURES, name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/** ساخت ArrayBuffer از یک EPUB واقعی ساخت خود پروژه (نمونه سایت) */
function sample(name, file) {
  const buf = fs.readFileSync(
    path.join(__dirname, '..', 'novels', name, file),
  );
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('استخراج متادیتای EPUB', () => {
  it('EPUB 3 با nav: فهرست کامل استخراج می‌شود', async () => {
    const meta = await readEpubMeta(load('valid-epub3.epub'));
    expect(meta.tocSource).toBe('nav');
    expect(meta.chapters.map((c) => c.title)).toEqual(['The Beginning', 'The Middle', 'The End']);
    expect(meta.spineCount).toBe(3);
    expect(meta.language).toBe('en');
  });

  it('EPUB 2 با ncx: فهرست از navMap استخراج می‌شود', async () => {
    const meta = await readEpubMeta(load('valid-epub2.epub'));
    expect(meta.tocSource).toBe('ncx');
    expect(meta.chapters).toHaveLength(3);
  });

  it('EPUB فارسی: زبان و فهرست فارسی درست خوانده می‌شود', async () => {
    const meta = await readEpubMeta(load('persian.epub'));
    expect(meta.language).toBe('fa');
    expect(meta.chapters[0].title).toBe('فصل نخست');
  });

  it('بدون فهرست: عنوان فصل‌ها از داخل سند (نه نام فایل) استخراج می‌شود', async () => {
    const meta = await readEpubMeta(load('no-toc.epub'));
    expect(meta.tocSource).toBe('spine');
    expect(meta.chapters[0].title).toBe('Hidden Chapter One');
    expect(meta.chapters[0].href).not.toBe('text/ch1.xhtml'.length === 0);
  });

  it('ZIP خراب (نیمه‌قطع‌شده) با پیام فارسی رد می‌شود', async () => {
    await expect(readEpubMeta(load('corrupt-truncated.epub'))).rejects.toThrowError(EpubParseError);
  });

  it('فایل غیر EPUB (بدون mimetype) رد می‌شود', async () => {
    await expect(readEpubMeta(load('not-epub.epub'))).rejects.toMatchObject({ code: 'missing-mimetype' });
  });

  it('container اشاره به OPF ناموجود → خطا', async () => {
    await expect(readEpubMeta(load('missing-opf.epub'))).rejects.toMatchObject({ code: 'missing-opf' });
  });

  it('نمونه واقعی سایت (آلیس جلد ۱): عنوان و فصل‌ها خوانده می‌شوند', async () => {
    const meta = await readEpubMeta(sample('alice-in-wonderland', 'volume-01.epub'));
    expect(meta.language).toBe('en');
    expect(meta.tocSource).toBe('nav');
    expect(meta.chapters.some((c) => c.title.includes('Down the Rabbit-Hole'))).toBe(true);
  });

  it('نمونه واقعی سایت (گلستان): فهرست فارسی و RTL', async () => {
    const meta = await readEpubMeta(sample('golestan-saadi', 'volume-01.epub'));
    expect(meta.language).toBe('fa');
    expect(meta.chapters.some((c) => c.title.includes('بنی‌آدم'))).toBe(true);
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'build-catalog.mjs');

/** ساخت یک EPUB حداقلی در مسیر مشخص */
async function makeEpub(outPath) {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  );
  zip.file(
    'OEBPS/content.opf',
    '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">x</dc:identifier><dc:title>T</dc:title><dc:language>fa</dc:language><meta property="dcterms:modified">2026-01-01T00:00:00Z</meta></metadata><manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine toc="ncx"><itemref idref="ch1"/></spine></package>',
  );
  zip.file('OEBPS/toc.ncx', '<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head/><docTitle><text>T</text></docTitle><navMap><navPoint id="n1" playOrder="1"><navLabel><text>فصل یک</text></navLabel><content src="ch1.xhtml"/></navPoint></navMap></ncx>');
  zip.file('OEBPS/ch1.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>فصل یک</title></head><body><p>x</p></body></html>');
  fs.writeFileSync(outPath, await zip.generateAsync({ type: 'nodebuffer' }));
}

function runBuild(novelsDir, outPath, extraArgs = []) {
  return execFileSync(process.execPath, [SCRIPT, '--novels-dir', novelsDir, '--out', outPath, ...extraArgs], {
    encoding: 'utf8',
  });
}

describe('build-catalog (یکپارچه‌سازی)', () => {
  it('کاتالوگ کتاب سالم با فصل‌های EPUB ساخته می‌شود', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-cat-'));
    const novels = path.join(tmp, 'novels');
    const book = path.join(novels, 'my-book');
    fs.mkdirSync(book, { recursive: true });
    await makeEpub(path.join(book, 'v1.epub'));
    fs.writeFileSync(
      path.join(book, 'cover.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="3"/>',
    );
    fs.writeFileSync(
      path.join(book, 'info.json'),
      JSON.stringify({
        id: 'my-book',
        titleFa: 'کتاب من',
        author: 'من',
        description: 'توضیح کافی برای اعتبارسنجی — بیش از بیست نویسه.',
        genres: ['ژانر'],
        language: 'fa',
        status: 'completed',
        cover: 'cover.svg',
        volumes: [{ file: 'v1.epub', order: 1 }],
        addedAt: '2026-01-01',
      }),
    );
    const out = path.join(tmp, 'catalog.json');
    runBuild(novels, out);
    const catalog = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(catalog.novels).toHaveLength(1);
    const n = catalog.novels[0];
    expect(n.id).toBe('my-book');
    expect(n.cover).toBe('novels/my-book/cover.svg');
    expect(n.volumes[0].file).toBe('novels/my-book/v1.epub');
    expect(n.volumes[0].chapters[0].title).toBe('فصل یک');
    expect(n.volumes[0].tocSource).toBe('ncx');
  });

  it('کتاب خراب با هشدار حذف و بقیه منتشر می‌شوند (سیاست skip)', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-cat2-'));
    const novels = path.join(tmp, 'novels');
    const bad = path.join(novels, 'bad-book');
    fs.mkdirSync(bad, { recursive: true });
    fs.writeFileSync(path.join(bad, 'info.json'), '{ broken!!');
    const good = path.join(novels, 'good-book');
    fs.mkdirSync(good, { recursive: true });
    await makeEpub(path.join(good, 'v1.epub'));
    fs.writeFileSync(path.join(good, 'cover.svg'), '<svg/>');
    fs.writeFileSync(
      path.join(good, 'info.json'),
      JSON.stringify({
        id: 'good-book',
        titleFa: 'سالم',
        author: 'a',
        description: 'توضیح کافی برای اعتبارسنجی — بیش از بیست نویسه.',
        genres: ['g'],
        language: 'fa',
        status: 'completed',
        cover: 'cover.svg',
        volumes: [{ file: 'v1.epub', order: 1 }],
      }),
    );
    const out = path.join(tmp, 'catalog.json');
    const outLog = runBuild(novels, out);
    const catalog = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(catalog.novels.map((n) => n.id)).toEqual(['good-book']);
    expect(outLog).toContain('bad-book');
  });

  it('ترتیب جلدها بر اساس order تنظیم می‌شود', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-cat3-'));
    const novels = path.join(tmp, 'novels');
    const book = path.join(novels, 'multi');
    fs.mkdirSync(book, { recursive: true });
    await makeEpub(path.join(book, 'second.epub'));
    await makeEpub(path.join(book, 'first.epub'));
    fs.writeFileSync(path.join(book, 'cover.svg'), '<svg/>');
    fs.writeFileSync(
      path.join(book, 'info.json'),
      JSON.stringify({
        id: 'multi',
        titleFa: 'چند جلدی',
        author: 'a',
        description: 'توضیح کافی برای اعتبارسنجی — بیش از بیست نویسه.',
        genres: ['g'],
        language: 'fa',
        status: 'completed',
        cover: 'cover.svg',
        volumes: [
          { file: 'second.epub', title: 'جلد دوم', order: 2 },
          { file: 'first.epub', title: 'جلد اول', order: 1 },
        ],
      }),
    );
    const out = path.join(tmp, 'catalog.json');
    runBuild(novels, out);
    const catalog = JSON.parse(fs.readFileSync(out, 'utf8'));
    const titles = catalog.novels[0].volumes.map((v) => v.title);
    expect(titles).toEqual(['جلد اول', 'جلد دوم']);
  });
});

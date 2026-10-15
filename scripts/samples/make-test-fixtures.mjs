#!/usr/bin/env node
/**
 * make-test-fixtures.mjs — تولید نمونه‌های EPUB برای آزمون‌ها در tests/fixtures/
 *
 * نمونه‌ها:
 *  - valid-epub3.epub          : EPUB 3 سالم با nav
 *  - valid-epub2.epub          : EPUB 2 سالم با ncx
 *  - persian.epub              : متن فارسی RTL
 *  - no-toc.epub               : بدون nav/ncx (عنوان از خود سند استخراج می‌شود)
 *  - corrupt-truncated.epub    : ZIP نیمه/خراب
 *  - not-epub.epub             : ZIP ساده بدون mimetype صحیح
 *  - missing-opf.epub          : container به فایل ناموجود اشاره می‌کند
 *  - big-image.epub            : تصویر بزرگ SVG (تست جلوگیری از اسکرول افقی)
 *
 * اجرا: npm run make:fixtures
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, '..', '..', 'tests', 'fixtures');

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';

const CONTAINER = `${XML_HEAD}<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>\n`;

function opf({ language = 'en', tocAttr = 'ncx', withNav = true, withNcx = true, chapters = 3 }) {
  const items = [];
  if (withNav) items.push(`<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`);
  if (withNcx) items.push(`<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`);
  for (let i = 1; i <= chapters; i++) {
    items.push(`<item id="ch${i}" href="text/ch${i}.xhtml" media-type="application/xhtml+xml"/>`);
  }
  const spineRefs = [];
  for (let i = 1; i <= chapters; i++) spineRefs.push(`<itemref idref="ch${i}"/>`);
  return `${XML_HEAD}<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id" xml:lang="${language}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="id">urn:uuid:fixture-${Date.now()}</dc:identifier>
<dc:title>Fixture Book</dc:title>
<dc:language>${language}</dc:language>
<meta property="dcterms:modified">2026-10-15T00:00:00Z</meta>
</metadata>
<manifest>${items.join('')}</manifest>
<spine ${tocAttr ? `toc="${tocAttr}"` : ''}>${spineRefs.join('')}</spine>
</package>\n`;
}

function navXhtml(titles, language = 'en') {
  const lis = titles.map((t, i) => `<li><a href="text/ch${i + 1}.xhtml">${t}</a></li>`).join('');
  return `${XML_HEAD}<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${language}" dir="${language === 'fa' ? 'rtl' : 'ltr'}"><head><title>TOC</title></head><body><nav epub:type="toc"><ol>${lis}</ol></nav></body></html>\n`;
}

function ncxXhtml(titles) {
  const pts = titles
    .map((t, i) => `<navPoint id="np${i}" playOrder="${i + 1}"><navLabel><text>${t}</text></navLabel><content src="text/ch${i + 1}.xhtml"/></navPoint>`)
    .join('');
  return `${XML_HEAD}<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="urn:uuid:fixture"/></head><docTitle><text>Fixture Book</text></docTitle><navMap>${pts}</navMap></ncx>\n`;
}

function chapter(title, body, language = 'en') {
  return `${XML_HEAD}<html xmlns="http://www.w3.org/1999/xhtml" lang="${language}" dir="${language === 'fa' ? 'rtl' : 'ltr'}"><head><title>${title}</title></head><body><h1>${title}</h1>${body}</body></html>\n`;
}

async function pack(name, files, { truncate = false, mimetypeFirst = true, mimetypeContent = 'application/epub+zip' } = {}) {
  const zip = new JSZip();
  if (mimetypeFirst) zip.file('mimetype', mimetypeContent, { compression: 'STORE' });
  for (const [n, c] of files) zip.file(n, c);
  let buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  if (truncate) buf = buf.subarray(0, Math.floor(buf.length * 0.4));
  fs.writeFileSync(path.join(FIXTURES, name), buf);
  console.log(`  ✓ tests/fixtures/${name}`);
}

async function main() {
  fs.mkdirSync(FIXTURES, { recursive: true });

  const enTitles = ['The Beginning', 'The Middle', 'The End'];
  const chFiles = (titles, lang = 'en', bigImg = false) =>
    titles.map((t, i) => [
      `OEBPS/text/ch${i + 1}.xhtml`,
      chapter(
        t,
        lang === 'fa'
          ? `<p>این یک متن آزمونی فارسی است. ${'پاراگراف آزمایشی. '.repeat(30)}</p>` + (bigImg ? `<img src="../img/huge.svg" alt=""/>` : '')
          : `<p>This is fixture text. ${'Sample paragraph. '.repeat(30)}</p>` + (bigImg ? `<img src="../img/huge.svg" alt=""/>` : ''),
        lang,
      ),
    ]);

  // 1) EPUB 3 سالم با nav
  await pack('valid-epub3.epub', [
    ['META-INF/container.xml', CONTAINER],
    ['OEBPS/content.opf', opf({})],
    ['OEBPS/nav.xhtml', navXhtml(enTitles)],
    ['OEBPS/toc.ncx', ncxXhtml(enTitles)],
    ...chFiles(enTitles),
  ]);

  // 2) EPUB 2 سالم با ncx (بدون nav)
  await pack('valid-epub2.epub', [
    ['META-INF/container.xml', CONTAINER],
    ['OEBPS/content.opf', opf({ withNav: false })],
    ['OEBPS/toc.ncx', ncxXhtml(enTitles)],
    ...chFiles(enTitles),
  ]);

  // 3) فارسی RTL
  const faTitles = ['فصل نخست', 'فصل دوم', 'فصل سوم'];
  await pack('persian.epub', [
    ['META-INF/container.xml', CONTAINER],
    ['OEBPS/content.opf', opf({ language: 'fa' })],
    ['OEBPS/nav.xhtml', navXhtml(faTitles, 'fa')],
    ['OEBPS/toc.ncx', ncxXhtml(faTitles)],
    ...chFiles(faTitles, 'fa'),
  ]);

  // 4) بدون فهرست (عنوان از <title> سند)
  const hiddenTitles = ['Hidden Chapter One', 'Hidden Chapter Two'];
  await pack('no-toc.epub', [
    ['META-INF/container.xml', CONTAINER],
    ['OEBPS/content.opf', opf({ withNav: false, withNcx: false, tocAttr: null, chapters: 2 })],
    ...chFiles(hiddenTitles),
  ]);

  // 5) ZIP خراب (نصف اول)
  await pack('corrupt-truncated.epub', [
    ['META-INF/container.xml', CONTAINER],
    ['OEBPS/content.opf', opf({})],
  ], { truncate: true });

  // 6) ZIP ساده (بدون mimetype صحیح)
  await pack('not-epub.epub', [['hello.txt', 'this is not an epub']], { mimetypeFirst: false });

  // 7) container اشاره به OPF ناموجود
  await pack('missing-opf.epub', [
    ['META-INF/container.xml', `${XML_HEAD}<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/absent.opf" media-type="application/oebps-package+xml"/></rootfiles></container>\n`],
    ['OEBPS/content.opf', opf({})],
  ]);

  // 8) تصویر بزرگ برای آزمون اسکرول افقی
  const hugeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="600"><rect width="100%" height="100%" fill="#345"/></svg>\n`;
  await pack('big-image.epub', [
    ['META-INF/container.xml', CONTAINER],
    ['OEBPS/content.opf', opf({ chapters: 1 })],
    ['OEBPS/nav.xhtml', navXhtml(['Wide Image Chapter'])],
    ['OEBPS/toc.ncx', ncxXhtml(['Wide Image Chapter'])],
    ['OEBPS/img/huge.svg', hugeSvg],
    ['OEBPS/text/ch1.xhtml', chapter('Wide Image Chapter', `<p>Before image.</p><img src="../img/huge.svg" alt=""/><p>After image.</p>`)],
  ]);

  console.log('✓ فایل‌های آزمون ساخته شدند.');
}

main().catch((e) => {
  console.error('خطا:', e);
  process.exit(1);
});

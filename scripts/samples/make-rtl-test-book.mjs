/* make-rtl-test-book.mjs — EPUB آزمایشی فارسی بدون صفت dir
 * سناریوی واقعی کتاب‌های کاربر: محتوای فارسی با نشانه‌گذاری LTR/بدون جهت.
 * این کتاب فقط برای تأیید ریشه‌یابی باگ «متن از سمت چپ شروع می‌شود» است. */
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

const OUT = path.resolve('novels/rtl-test');

const chapters = [
  {
    id: 'ch1',
    title: 'آزمون راست‌به‌چپ',
    paras: [
      'این متن آزمایشی است تا ثابت کند جهت سند کتاب به‌درستی از سمت راست صفحه آغاز می‌شود، حتی وقتی فایل EPUB هیچ صفت dir ندارد و نشانه‌گذاری آن چپ‌به‌راست است.',
      'پاراگراف دوم برای بررسی ترازبندی و شکل‌گیری حروف فارسی در جریان درست راست‌به‌چپ قرار داده شده است. اگر این جمله از لبهٔ راست ستون شروع شود، ریشه‌یابی باگ تأیید شده است.',
    ],
  },
  {
    id: 'ch2',
    title: 'فصل دوم آزمون',
    paras: [
      'در فصل دوم نیز همان آزمون تکرار می‌شود تا رفتار در گذر بین فصل‌ها و در حالت صفحه‌بندی‌شده نیز بررسی شود.',
      'پایان متن آزمایشی؛ این فصل برای بررسی دکمهٔ «فصل بعدی» نیز به‌کار می‌رود.',
    ],
  },
];

const xhtml = (c) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="fa" lang="fa">
<head><title>${c.title}</title><link rel="stylesheet" type="text/css" href="../style.css"/></head>
<body>
  <h2>${c.title}</h2>
  ${c.paras.map((p) => `<p>${p}</p>`).join('\n  ')}
</body>
</html>`;

const style = `body { font-family: serif; margin: 1em; line-height: 1.7; }
h2 { text-align: center; }
/* عمداً هیچ قاعدهٔ direction یا text-align برای p وجود ندارد */`;

const zip = new JSZip();
zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);
zip.file('OEBPS/style.css', style);
for (const c of chapters) zip.file(`OEBPS/text/${c.id}.xhtml`, xhtml(c));
zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="fa" lang="fa">
<head><title>فهرست</title></head>
<body><nav epub:type="toc" id="toc"><h2>فهرست</h2><ol>
${chapters.map((c) => `<li><a href="text/${c.id}.xhtml">${c.title}</a></li>`).join('\n')}
</ol></nav></body></html>`);
zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bid" xml:lang="fa">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bid">urn:uuid:rtl-test-0001</dc:identifier>
    <dc:title>آزمون راست‌به‌چپ</dc:title>
    <dc:creator>NovelShelf Test</dc:creator>
    <dc:language>fa</dc:language>
    <meta property="dcterms:modified">2026-10-15T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
    ${chapters.map((c) => `<item id="${c.id}" href="text/${c.id}.xhtml" media-type="application/xhtml+xml"/>`).join('\n    ')}
  </manifest>
  <spine>
    ${chapters.map((c) => `<itemref idref="${c.id}"/>`).join('\n    ')}
  </spine>
</package>`);

fs.mkdirSync(OUT, { recursive: true });
const buf = await zip.generateAsync({ type: 'nodebuffer' });
fs.writeFileSync(path.join(OUT, 'volume-01.epub'), buf);
fs.writeFileSync(path.join(OUT, 'cover.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200"><rect width="800" height="1200" fill="#4a5a3f"/><text x="400" y="600" font-size="60" fill="#fff" text-anchor="middle" font-family="sans-serif">آزمون RTL</text></svg>`);
fs.writeFileSync(path.join(OUT, 'info.json'), JSON.stringify({
  id: 'rtl-test',
  titleOriginal: 'آزمون راست‌به‌چپ',
  titleFa: 'آزمون راست‌به‌چپ (بدون dir)',
  titleAlt: [],
  author: 'NovelShelf Test',
  translator: null,
  description: 'کتاب آزمایشی بدون صفت dir برای تأیید تزریق جهت در کتاب‌خوان.',
  genres: ['آزمون'],
  language: 'fa',
  direction: 'rtl',
  status: 'completed',
  cover: 'cover.svg',
  year: 2026,
  license: 'مالکیت عمومی',
  source: null,
  notes: '',
  addedAt: '2026-10-15',
  volumes: [{ file: 'volume-01.epub', title: 'جلد آزمون', order: 1 }],
}, null, 2));
console.log('✓ rtl-test book created');

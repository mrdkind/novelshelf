#!/usr/bin/env node
/**
 * make-sample-books.mjs — تولید دو کتاب نمونه واقعی با مجوز «مالکیت عمومی»:
 *
 *  1) Alice's Adventures in Wonderland (لوییس کارول، ۱۸۶۵ — مالکیت عمومی)
 *     - دو جلد EPUB (فصل‌های ۱–۴ و ۵–۸)، زبان انگلیسی، تصاویر داخل فصل، لینک داخلی، nav EPUB 3
 *  2) گلستان سعدی (سعدی شیرازی، سده ۷ هجری — مالکیت عمومی)
 *     - یک جلد EPUB، زبان فارسی و راست‌به‌چپ، گزیده‌ای از متن‌های مشهور + معرفی مدرن
 *
 * این کتاب‌ها هم نمونه واقعی سایت هستند و هم نمونه‌های آزمون کتاب‌خوان.
 * اجرا:  npm run make:samples
 * حذف این کتاب‌ها برای انتشار عمومی محتوای شخصی شما آزاد است (README بخش محدودیت‌ها).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const NOVELS = path.join(ROOT, 'novels');

/* ------------------------------------------------------------------ */
/* ابزارهای ساخت EPUB                                                  */
/* ------------------------------------------------------------------ */

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';

function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function containerXml() {
  return `${XML_HEAD}<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;
}

function buildOpf({ bookId, bookTitle, author, language, chapters, images, hasCover }) {
  const items = [
    `    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    `    <item id="css" href="style.css" media-type="text/css"/>`,
  ];
  chapters.forEach((c, i) => {
    items.push(`    <item id="ch${i + 1}" href="text/chapter-${String(i + 1).padStart(2, '0')}.xhtml" media-type="application/xhtml+xml"/>`);
  });
  images.forEach((img, i) => {
    items.push(`    <item id="img${i + 1}" href="images/${img.name}" media-type="image/svg+xml"/>`);
  });
  if (hasCover) {
    items.push(`    <item id="cover-image" href="images/cover.svg" media-type="image/svg+xml" properties="cover-image"/>`);
    items.push(`    <item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>`);
  }

  const manifest = items.join('\n');
  const spine = [
    hasCover ? `    <itemref idref="cover-page"/>` : null,
    ...chapters.map((_, i) => `    <itemref idref="ch${i + 1}"/>`),
  ]
    .filter(Boolean)
    .join('\n');

  return `${XML_HEAD}<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${esc(language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:novelshelf:${esc(bookId)}</dc:identifier>
    <dc:title>${esc(bookTitle)}</dc:title>
    <dc:creator>${esc(author)}</dc:creator>
    <dc:language>${esc(language)}</dc:language>
    <dc:date>2026-10-15</dc:date>
    <meta property="dcterms:modified">2026-10-15T00:00:00Z</meta>
  </metadata>
  <manifest>
${manifest}
  </manifest>
  <spine toc="ncx">
${spine}
  </spine>
</package>
`;
}

function buildNav({ bookTitle, language, chapters, dir }) {
  const lis = chapters
    .map((c, i) => `      <li><a href="text/chapter-${String(i + 1).padStart(2, '0')}.xhtml">${esc(c.title)}</a></li>`)
    .join('\n');
  return `${XML_HEAD}<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${esc(language)}" dir="${esc(dir)}">
<head><title>فهرست مطالب</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>${esc(bookTitle)}</h1>
    <ol>
${lis}
    </ol>
  </nav>
</body>
</html>
`;
}

function buildNcx({ bookId, bookTitle, chapters }) {
  const points = chapters
    .map(
      (c, i) => `    <navPoint id="np${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${esc(c.title)}</text></navLabel>
      <content src="text/chapter-${String(i + 1).padStart(2, '0')}.xhtml"/>
    </navPoint>`,
    )
    .join('\n');
  return `${XML_HEAD}<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:novelshelf:${esc(bookId)}"/>
  </head>
  <docTitle><text>${esc(bookTitle)}</text></docTitle>
  <navMap>
${points}
  </navMap>
</ncx>
`;
}

function chapterXhtml({ title, bodyHtml, language, dir }) {
  return `${XML_HEAD}<html xmlns="http://www.w3.org/1999/xhtml" lang="${esc(language)}" dir="${esc(dir)}">
<head>
  <title>${esc(title)}</title>
  <link rel="stylesheet" type="text/css" href="../style.css"/>
</head>
<body>
  <h2>${esc(title)}</h2>
${bodyHtml}
</body>
</html>
`;
}

const STYLE_CSS = `body { font-family: serif; line-height: 1.8; margin: 1em auto; }
h1, h2 { text-align: center; }
p { margin: 0.6em 0; text-indent: 1.2em; }
p.centered { text-align: center; text-indent: 0; }
p.verse { text-align: center; text-indent: 0; margin: 0.2em 0; }
figure { text-align: center; margin: 1.2em 0; }
figure img { max-width: 100%; height: auto; }
figcaption { font-size: 0.85em; color: #666; }
[dir="rtl"] p { text-align: right; }
[dir="rtl"] h1, [dir="rtl"] h2 { text-align: center; }
`;

/** ساخت فایل EPUB با ترتیب صحیح mimetype */
async function writeEpub(outPath, files) {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  for (const [name, content] of files) {
    zip.file(name, content);
  }
  const buf = await zip.generateAsync({
    type: 'nodebuffer',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  fs.writeFileSync(outPath, buf);
  console.log(`  ✓ ${path.relative(ROOT, outPath)} (${(buf.length / 1024).toFixed(0)} کیلوبایت)`);
}

function svgImage({ width, height, stops, title, subtitle, ornament = '❦' }) {
  const gradient = stops
    .map((s, i) => `<stop offset="${(i / (stops.length - 1)) * 100}%" stop-color="${s}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">${gradient}</linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect x="14" y="14" width="${width - 28}" height="${height - 28}" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="2" rx="10"/>
  <text x="50%" y="38%" font-family="Georgia, serif" font-size="${Math.round(width / 14)}" fill="#fff" text-anchor="middle" font-style="italic">${esc(title)}</text>
  <text x="50%" y="50%" font-family="Tahoma, sans-serif" font-size="${Math.round(width / 22)}" fill="rgba(255,255,255,0.9)" text-anchor="middle">${esc(subtitle)}</text>
  <text x="50%" y="62%" font-family="serif" font-size="${Math.round(width / 16)}" fill="rgba(255,255,255,0.85)" text-anchor="middle">${ornament}</text>
</svg>
`;
}

function coverSvg({ titleFa, titleEn, author, palette }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette[0]}"/>
      <stop offset="55%" stop-color="${palette[1]}"/>
      <stop offset="100%" stop-color="${palette[2]}"/>
    </linearGradient>
    <linearGradient id="spine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgba(0,0,0,0.35)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </linearGradient>
  </defs>
  <rect width="600" height="900" fill="url(#bg)"/>
  <rect width="70" height="900" fill="url(#spine)"/>
  <rect x="24" y="24" width="552" height="852" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="3" rx="14"/>
  <g fill="#ffffff">
    <text x="300" y="330" font-family="Tahoma, sans-serif" font-size="44" font-weight="bold" text-anchor="middle" direction="rtl" unicode-bidi="bidi-override">${esc(titleFa)}</text>
    <text x="300" y="395" font-family="Georgia, serif" font-size="30" font-style="italic" text-anchor="middle">${esc(titleEn)}</text>
    <text x="300" y="470" font-family="serif" font-size="56" text-anchor="middle">❦</text>
    <text x="300" y="760" font-family="Tahoma, sans-serif" font-size="30" text-anchor="middle" direction="rtl">${esc(author)}</text>
    <text x="300" y="810" font-family="Tahoma, sans-serif" font-size="20" fill="rgba(255,255,255,0.75)" text-anchor="middle" direction="rtl">نسخهٔ نمونهٔ کتاب‌خوان NovelShelf</text>
  </g>
</svg>
`;
}

function infoJson(book) {
  return JSON.stringify(book, null, 2) + '\n';
}

/* ------------------------------------------------------------------ */
/* کتاب ۱: ماجراهای آلیس در سرزمین عجایب                               */
/* ------------------------------------------------------------------ */

const ALICE_CHAPTERS_VOL1 = [
  {
    title: 'Chapter 1 — Down the Rabbit-Hole',
    paras: [
      `Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, “and what is the use of a book,” thought Alice, “without pictures or conversations?”`,
      `So she was considering in her own mind (as well as she could, for the hot day made her feel very sleepy and stupid), whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies, when suddenly a White Rabbit with pink eyes ran close by her.`,
      `There was nothing so very remarkable in that; nor did Alice think it so very much out of the way to hear the Rabbit say to itself, “Oh dear! Oh dear! I shall be late!” (when she thought it over afterwards, it occurred to her that she ought to have wondered at this, but at the time it all seemed quite natural); but when the Rabbit actually took a watch out of its waistcoat-pocket, and looked at it, and then hurried on, Alice started to her feet, for it flashed across her mind that she had never before seen a rabbit with either a waistcoat-pocket, or a watch to take out of it, and burning with curiosity, she ran across the field after it, and fortunately was just in time to see it pop down a large rabbit-hole under the hedge.`,
      `In another moment down went Alice after it, never once considering how in the world she was to get out again.`,
    ],
  },
  {
    title: 'Chapter 2 — The Pool of Tears',
    paras: [
      `“Curiouser and curiouser!” cried Alice (she was so much surprised, that for the moment she quite forgot how to speak good English); “now I'm opening out like the largest telescope that ever was! Good-bye, feet!”`,
      `And she went on planning to herself how she would manage it. “They must go by the carrier,” she thought; “and how funny it'll seem, sending presents to one's own feet! And how odd the directions will look!”`,
      `“Alice, dear!” said her sister. “Why, what a long sleep you've had!”`,
      `“Oh, I've had such a curious dream!” said Alice. And she told her sister, as well as she could remember them, all these strange Adventures of hers...`,
    ],
  },
  {
    title: 'Chapter 3 — A Caucus-Race and a Long Tale',
    paras: [
      `They were indeed a queer-looking party that assembled on the bank — the birds with draggled feathers, the animals with their fur clinging close to them, and all dripping wet, cross, and uncomfortable. The first question of course was, how to get dry again: they had a consultation about this, and after a few minutes it seemed quite natural to Alice to find herself talking familiarly with them, as if she had known them all her life.`,
      `“What I was going to say,” said the Dodo in an offended tone, “was, that the best thing to get us dry would be a Caucus-race.”`,
      `“What is a Caucus-race?” said Alice; not that she wanted much to know, but the Dodo had paused as if it thought that somebody ought to speak, and no one else seemed inclined to say anything.`,
      `They began running when they liked, and left off when they liked, so that it was not easy to know when the race was over. However, when they had been running half an hour or so, and were quite dry again, the Dodo suddenly called out “The race is over!”`,
    ],
  },
  {
    title: 'Chapter 4 — The Rabbit Sends in a Little Bill',
    paras: [
      `It was the White Rabbit, trotting slowly back again, and looking anxiously about as it went, as if it had lost something; and she heard it muttering to itself “The Duchess! The Duchess! Oh my dear paws! Oh my fur and whiskers! She'll get me executed, as sure as ferrets are ferrets! Where can I have dropped them, I wonder?”`,
      `Alice guessed in a moment that it was looking for the fan and the pair of white kid gloves, and she very good-naturedly began hunting about for them, but they were nowhere to be seen.`,
      `Soon her eye fell on a little glass box that was lying under the table: she opened it, and found in it a very tiny cake, on which the words “EAT ME” were beautifully marked in currants.`,
    ],
  },
];

const ALICE_CHAPTERS_VOL2 = [
  {
    title: 'Chapter 5 — Advice from a Caterpillar',
    paras: [
      `The Caterpillar and Alice looked at each other for some time in silence: at last the Caterpillar took the hookah out of its mouth, and addressed her in a languid, sleepy voice.`,
      `“Who are you?” said the Caterpillar.`,
      `This was not an encouraging opening for a conversation. Alice replied, rather shyly, “I — I hardly know, sir, just at present — at least I know who I was when I got up this morning, but I think I must have been changed several times since then.”`,
      `“What do you mean by that?” said the Caterpillar sternly. “Explain yourself!”`,
    ],
  },
  {
    title: 'Chapter 6 — Pig and Pepper',
    paras: [
      `For a minute or two she stood looking at the house, and wondering what to do next, when suddenly a footman in livery came running out of the wood — (she considered him to be a footman because he was in livery: otherwise, judging by his face only, she would have called him a fish) — and rapped loudly at the door with his knuckles.`,
      `The door led right into a large kitchen, which was full of smoke from one end to the other: the Duchess was sitting on a three-legged stool in the middle, nursing a baby; the cook was leaning over the fire, stirring a large cauldron which seemed to be full of soup.`,
    ],
  },
  {
    title: 'Chapter 7 — A Mad Tea-Party',
    paras: [
      `There was a table set out under a tree in front of the house, and the March Hare and the Hatter were having tea at it: a Dormouse was sitting between them, fast asleep, and the other two were using it as a cushion, resting their elbows on it, and talking over its head.`,
      `“Have some wine,” the March Hare said in an encouraging tone.`,
      `Alice looked all round the table, but there was nothing on it but tea. “I don't see any wine,” she remarked.`,
      `“There isn't any,” said the March Hare.`,
      `“Then it wasn't very civil of you to offer it,” said Alice angrily.`,
      `The table was a large one, but the three were all crowded together at one corner of it: “No room! No room!” they cried out when they saw Alice coming.`,
    ],
  },
  {
    title: 'Chapter 8 — The Queen\u2019s Croquet-Ground',
    paras: [
      `A large rose-tree stood near the entrance of the garden: the roses growing on it were white, but there were three gardeners at it, busily painting them red. Alice thought this a very curious thing, and she went nearer to watch them.`,
      `“Would you tell me,” said Alice, a little timidly, “why you are painting those roses?”`,
      `Five and Seven said nothing, but looked at Two. Two began in a low voice, “Why the fact is, you see, Miss, this here ought to have been a red rose-tree, and we put a white one in by mistake...”`,
      `When Alice next looked up, the Queen was in front of her, stamping and furious: “What's your name, child?” “My name is Alice, so please your Majesty,” said she very politely.`,
    ],
  },
];

async function makeAlice() {
  const dir = path.join(NOVELS, 'alice-in-wonderland');
  fs.mkdirSync(path.join(dir), { recursive: true });

  // --- کاور ---
  fs.writeFileSync(
    path.join(dir, 'cover.svg'),
    coverSvg({
      titleFa: 'ماجراهای آلیس',
      titleEn: "Alice's Adventures in Wonderland",
      author: 'Lewis Carroll',
      palette: ['#6a3fa0', '#3f2b96', '#1b1464'],
    }),
  );

  // --- تصاویر داخلی ---
  const imgCover = svgImage({ width: 800, height: 1200, stops: ['#6a3fa0', '#1b1464'], title: 'Alice', subtitle: 'Adventures in Wonderland' });
  const imgOrnament = svgImage({ width: 900, height: 320, stops: ['#8e6bd1', '#4b2e83'], title: '❦', subtitle: 'illustration', ornament: 'The White Rabbit hurried by' });
  const imgWide = svgImage({ width: 1400, height: 260, stops: ['#b06ab3', '#4568dc'], title: 'The Pool of Tears', subtitle: 'a wide illustration — no horizontal scroll' });

  const mkChapter = (c, i, extra = '') =>
    chapterXhtml({
      title: c.title,
      language: 'en',
      dir: 'ltr',
      bodyHtml:
        `  <p class="centered"><em>An illustrated sample edition for the NovelShelf reader.</em></p>\n` +
        `  <figure><img src="../images/ornament-${i % 2 === 0 ? 'a' : 'b'}.svg" alt="decorative illustration"/><figcaption>An ornamental illustration inside the chapter.</figcaption></figure>\n` +
        c.paras.map((p) => `  <p>${esc(p)}</p>`).join('\n') +
        extra,
    });

  const extraLink = `\n  <p>Curious readers may continue directly to <a href="chapter-07.xhtml">A Mad Tea-Party</a>, one of the most famous scenes of the book.</p>\n`;

  for (const [volIdx, chapters] of [
    [1, ALICE_CHAPTERS_VOL1],
    [2, ALICE_CHAPTERS_VOL2],
  ]) {
    const files = [];
    files.push(['META-INF/container.xml', containerXml()]);
    files.push([
      'OEBPS/content.opf',
      buildOpf({
        bookId: `alice-vol-${volIdx}`,
        bookTitle: `Alice's Adventures in Wonderland — Volume ${volIdx}`,
        author: 'Lewis Carroll',
        language: 'en',
        chapters,
        images: [],
        hasCover: true,
      }),
    ]);
    files.push(['OEBPS/nav.xhtml', buildNav({ bookTitle: `Alice — Volume ${volIdx}`, language: 'en', chapters, dir: 'ltr' })]);
    files.push(['OEBPS/toc.ncx', buildNcx({ bookId: `alice-vol-${volIdx}`, bookTitle: `Alice — Volume ${volIdx}`, chapters })]);
    files.push(['OEBPS/style.css', STYLE_CSS]);
    files.push(['OEBPS/images/cover.svg', imgCover]);
    files.push(['OEBPS/images/ornament-a.svg', imgOrnament]);
    files.push(['OEBPS/images/ornament-b.svg', imgWide]);
    files.push([
      'OEBPS/cover.xhtml',
      `${XML_HEAD}<html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head><title>Cover</title><style>body{margin:0;text-align:center} img{max-width:100%;height:auto}</style></head><body><img src="images/cover.svg" alt="cover"/></body></html>\n`,
    ]);
    chapters.forEach((c, i) => {
      const isCh3Vol1 = volIdx === 1 && i === 2; // لینک داخلی در فصل ۳ جلد ۱
      files.push([`OEBPS/text/chapter-${String(i + 1).padStart(2, '0')}.xhtml`, mkChapter(c, i, isCh3Vol1 ? extraLink : '')]);
    });
    await writeEpub(path.join(dir, `volume-0${volIdx}.epub`), files);
  }

  fs.writeFileSync(
    path.join(dir, 'info.json'),
    infoJson({
      id: 'alice-in-wonderland',
      titleOriginal: "Alice's Adventures in Wonderland",
      titleFa: 'ماجراهای آلیس در سرزمین عجایب',
      titleAlt: ['Alice in Wonderland'],
      author: 'Lewis Carroll',
      translator: null,
      description:
        'داستان کلاسیک دخترکی که به دنبال خرگوشی سفید در سوراخی می‌افتد و وارد سرزمینی عجیب می‌شود؛ سرزمینی با مهمانی چای دیوانه‌وار، ملکهٔ خشمگین و موجوداتی بی‌نظیر. این نسخهٔ نمونه، متن اصلی مالکیت عمومی (۱۸۶۵) است و برای نمایش قابلیت‌های کتاب‌خوان — تصاویر، لینک داخلی و چندجلدی — به دو جلد تقسیم شده است.',
      genres: ['فانتزی', 'کلاسیک', 'داستان کودکان'],
      language: 'en',
      direction: 'ltr',
      status: 'completed',
      cover: 'cover.svg',
      year: 1865,
      license: 'Public Domain',
      source: null,
      notes: 'متن مالکیت عمومی است؛ برای نمونه‌سازی امکانات کتاب‌خوان به دو جلد تقسیم شده.',
      addedAt: '2026-10-10',
      volumes: [
        { file: 'volume-01.epub', title: 'جلد ۱ — فصل‌های ۱ تا ۴', order: 1 },
        { file: 'volume-02.epub', title: 'جلد ۲ — فصل‌های ۵ تا ۸', order: 2 },
      ],
    }),
  );
  console.log(`  ✓ ${path.relative(ROOT, path.join(dir, 'info.json'))}`);
}

/* ------------------------------------------------------------------ */
/* کتاب ۲: گلستان سعدی (گزیده)                                          */
/* ------------------------------------------------------------------ */

const GOLESTAN_CHAPTERS = [
  {
    title: 'دیباچه — به نام خدایی که جان آفرید',
    paras: [
      `این کتاب، «گزیده‌ای آموزشی» از قطعه‌های مشهور گلستان سعدی است که برای نمایش قابلیت‌های کتاب‌خوان فارسی NovelShelf (راست‌به‌چپ، تایپوگرافی، تصاویر و فهرست مطالب) گردآوری شده است. متن‌ها مالکیت عمومی‌اند.`,
      'گلستان کتابی است منظوم و منثور که سعدی شیرازی در سدهٔ هفتم هجری آن را نگاشت و از پرخواننده‌ترین کتاب‌های ادب فارسی در جهان است.',
      'در آغاز کتاب، سعدی با سرودن این بیت‌ها خدا را می‌ستاید:',
    ],
    verses: ['به نام خدایی که جان آفرید', 'سخن گفتن اندر زبان آفرید', 'خداوند بخشندهٔ دستگیر', 'کریم خطابخش پوزش‌پذیر'],
    images: 1,
  },
  {
    title: 'باب اول — بنی‌آدم اعضای یکدیگرند',
    paras: [
      'مشهورترین سرودهٔ گلستان، که بر ورودی سازمان ملل نیز نقش بسته، همین قطعهٔ کوتاه است؛ بیتی در پیوند انسان‌ها با یکدیگر:',
      '(این قطعه در حکایات باب نخست گلستان آمده است.)',
    ],
    verses: [
      'بنی‌آدم اعضای یکدیگرند',
      'که در آفرینش ز یک گوهرند',
      'چو عضوی به درد آورد روزگار',
      'دگر عضوها را نماند قرار',
      'تو کز محنت دیگران بی‌غمی',
      'نشاید که نامت نهند آدمی',
    ],
    images: 0,
  },
  {
    title: 'باب چهارم — در فضیلت سخن',
    paras: [
      'باب چهارم گلستان «در فضیلت سخن» است؛ سعدی در آن برستیِ سخن و قدرت بیان تأکید می‌کند. از مشهورترین مصرع‌های این باب:',
    ],
    verses: [
      'قوت ناطقی به مغز است نه به شیر',
      'گر قوت ناطقی به شیر خوردی',
      'شیر حلال‌خوار چه گفت آفرین',
    ],
    images: 0,
  },
  {
    title: 'باب پنجم — در عشق و جوانی',
    paras: [
      'باب پنجم به عشق و جوانی پردازد و از لطیف‌ترین بخش‌های گلستان است. این بیت، پاسخ عاشقی به پرسش دربارهٔ دوست داشتن است:',
    ],
    verses: [
      'مرغ باغ ملکوتم نیم از عالم خاک',
      'دو هفته منت یک شب گرو بگذار و برو',
    ],
    images: 1,
  },
  {
    title: 'باب هشتم — دوست آن دانم که گیرد دست دوست',
    paras: ['از باب هشتم (در آداب صحبت)، بیتی که دربارهٔ معنای دوستی واقعی است:'],
    verses: [
      'دوست آن دانم که گیرد دست دوست',
      'در پریشان‌حالی و درماندگی',
    ],
    images: 0,
  },
  {
    title: 'پایان‌بخش — دربارهٔ این گزیده',
    paras: [
      'این گزیده تنها برای نمایش کتاب‌خوان NovelShelf آماده شده است؛ پاراگراف‌های معرفی «مدرن» نوشتهٔ گردآورندهٔ این نسخهٔ نمونه‌اند و اشعار، نقل مستقیم از متن مالکیت عمومی گلستان‌اند.',
      'می‌توانید این کتاب نمونه را با حذف پوشهٔ «novels/golestan-saadi/» از کتابخانهٔ خود بردارید. روش انجام این کار در README توضیح داده شده است.',
      'مطالعهٔ خوش بگذرانید! ❦',
    ],
    verses: [],
    images: 1,
  },
];

async function makeGolestan() {
  const dir = path.join(NOVELS, 'golestan-saadi');
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(
    path.join(dir, 'cover.svg'),
    coverSvg({
      titleFa: 'گلستان سعدی',
      titleEn: 'Golestan of Saadi',
      author: 'سعدی شیرازی',
      palette: ['#0f766e', '#115e59', '#134e4a'],
    }),
  );

  const ornament = svgImage({ width: 900, height: 300, stops: ['#14b8a6', '#0f766e'], title: '❦', subtitle: 'نقش تزئینی' });

  const files = [];
  files.push(['META-INF/container.xml', containerXml()]);
  files.push([
    'OEBPS/content.opf',
    buildOpf({
      bookId: 'golestan-saadi',
      bookTitle: 'گلستان سعدی — گزیده',
      author: 'سعدی شیرازی',
      language: 'fa',
      chapters: GOLESTAN_CHAPTERS,
      images: [],
      hasCover: true,
    }),
  ]);
  files.push(['OEBPS/nav.xhtml', buildNav({ bookTitle: 'گلستان سعدی — گزیده', language: 'fa', chapters: GOLESTAN_CHAPTERS, dir: 'rtl' })]);
  files.push(['OEBPS/toc.ncx', buildNcx({ bookId: 'golestan-saadi', bookTitle: 'گلستان سعدی — گزیده', chapters: GOLESTAN_CHAPTERS })]);
  files.push(['OEBPS/style.css', STYLE_CSS]);
  files.push(['OEBPS/images/cover.svg', coverSvg({ titleFa: 'گلستان سعدی', titleEn: 'Golestan', author: 'سعدی شیرازی', palette: ['#0f766e', '#115e59', '#134e4a'] })]);
  files.push(['OEBPS/images/ornament.svg', ornament]);
  files.push([
    'OEBPS/cover.xhtml',
    `${XML_HEAD}<html xmlns="http://www.w3.org/1999/xhtml" lang="fa" dir="rtl"><head><title>جلد</title><style>body{margin:0;text-align:center} img{max-width:100%;height:auto}</style></head><body><img src="images/cover.svg" alt="جلد"/></body></html>\n`,
  ]);

  GOLESTAN_CHAPTERS.forEach((c, i) => {
    const verseHtml = c.verses.map((v) => `  <p class="verse">${esc(v)}</p>`).join('\n');
    const imgHtml =
      c.images > 0
        ? `\n  <figure><img src="../images/ornament.svg" alt="نقش تزئینی"/><figcaption>تصویری داخل فصل برای آزمون نمایش تصاویر.</figcaption></figure>\n`
        : '';
    const body = c.paras.map((p) => `  <p>${esc(p)}</p>`).join('\n') + imgHtml + (verseHtml ? `\n${verseHtml}\n` : '');
    files.push([`OEBPS/text/chapter-${String(i + 1).padStart(2, '0')}.xhtml`, chapterXhtml({ title: c.title, bodyHtml: body, language: 'fa', dir: 'rtl' })]);
  });

  await writeEpub(path.join(dir, 'volume-01.epub'), files);

  fs.writeFileSync(
    path.join(dir, 'info.json'),
    infoJson({
      id: 'golestan-saadi',
      titleOriginal: 'گلستان',
      titleFa: 'گلستان سعدی',
      titleAlt: ['Golestan', 'Gulistan of Saadi'],
      author: 'سعدی شیرازی',
      translator: null,
      description:
        'گزیده‌ای آموزشی از قطعه‌های مشهور گلستان سعدی — از «بنی‌آدم اعضای یکدیگرند» تا بیت‌های باب‌های عشق و سخن — همراه با معرفی کوتاه هر بخش. این نسخهٔ نمونه برای نمایش تایپوگرافی فارسی، چیدمان راست‌به‌چپ و فهرست مطالب در کتاب‌خوان NovelShelf ساخته شده است.',
      genres: ['ادبیات کلاسیک', 'شعر فارسی', 'حکمت'],
      language: 'fa',
      direction: 'rtl',
      status: 'completed',
      cover: 'cover.svg',
      year: 1258,
      license: 'مالکیت عمومی',
      source: null,
      notes: 'گزیدهٔ نمونه؛ اشعار مالکیت عمومی‌اند و پاراگراف‌های معرفی، نوشتهٔ سازندهٔ این نسخهٔ نمونه است.',
      addedAt: '2026-10-14',
      volumes: [{ file: 'volume-01.epub', title: 'گزیدهٔ گلستان', order: 1 }],
    }),
  );
  console.log(`  ✓ ${path.relative(ROOT, path.join(dir, 'info.json'))}`);
}

/* ------------------------------------------------------------------ */

async function main() {
  console.log('ساخت کتاب‌های نمونه (مالکیت عمومی)…');
  await makeAlice();
  await makeGolestan();
  console.log('✓ کتاب‌های نمونه ساخته شدند.');
}

main().catch((e) => {
  console.error('خطا در ساخت کتاب‌های نمونه:', e);
  process.exit(1);
});

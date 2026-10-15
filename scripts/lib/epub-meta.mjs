/**
 * استخراج متادیتای پایه از فایل EPUB (بدون اجرای هیچ کدی از داخل کتاب).
 *
 * پوشش داده‌شده:
 *  - بررسی mimetype و container.xml
 *  - خواندن OPF (EPUB 2 و 3): metadata، manifest، spine
 *  - استخراج فهرست مطالب از nav.xhtml (EPUB 3) یا toc.ncx (EPUB 2)
 *  - در نبود هر دو، عنوان فصل‌ها از <title>/<h1> خود فایل‌ها استخراج می‌شود (نه از نام فایل)
 *  - تشخیص تصویر کاور داخلی
 *
 * محدودیت مستند: این یک اعتبارسنجی «ساختاری پایه» است و جایگزین EPUBCheck نیست.
 */
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

export class EpubParseError extends Error {
  /** @param {string} code شناسه ماشینی خطا @param {string} message پیام فارسی */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  isArray: (name) =>
    ['item', 'itemref', 'navPoint', 'navLabel', 'li', 'rootfile', 'meta'].includes(name),
});

function asArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function textOf(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node === 'object' && '#text' in node) return String(node['#text']);
  return '';
}

function dirOf(p) {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
}

function joinPath(baseDir, rel) {
  if (!rel) return rel;
  if (/^[a-z][a-z0-9+.-]*:/i.test(rel)) return null; // URL مطلق/اسکیم‌دار → نامعتبر برای ما
  const parts = (baseDir ? baseDir.split('/') : []).concat(rel.split('/'));
  const out = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

function stripFragment(href) {
  const i = href.indexOf('#');
  return i === -1 ? href : href.slice(0, i);
}

/** @param {ArrayBuffer|string} input */
export async function readEpubMeta(input) {
  let zip;
  try {
    zip = await JSZip.loadAsync(input);
  } catch {
    throw new EpubParseError('not-a-zip', 'فایل یک ZIP معتبر نیست (EPUB باید ZIP باشد).');
  }

  // --- mimetype (باید اولین فایل با محتوای دقیق باشد) ---
  const mimetypeFile = zip.file('mimetype');
  if (!mimetypeFile) {
    throw new EpubParseError('missing-mimetype', 'فایل mimetype در ریشه EPUB پیدا نشد.');
  }
  const mimetype = (await mimetypeFile.async('string')).trim();
  if (mimetype !== 'application/epub+zip') {
    throw new EpubParseError('bad-mimetype', `محتوای mimetype نامعتبر است: «${mimetype.slice(0, 60)}»`);
  }

  // --- container.xml ---
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) throw new EpubParseError('missing-container', 'META-INF/container.xml پیدا نشد.');
  let container;
  try {
    container = parser.parse(await containerFile.async('string'));
  } catch {
    throw new EpubParseError('bad-container', 'container.xml قابل تحلیل (XML) نیست.');
  }
  const rootfile = asArray(container?.container?.rootfiles?.rootfile)[0];
  const opfPath = rootfile?.['@full-path'];
  if (!opfPath || !zip.file(opfPath)) {
    throw new EpubParseError('missing-opf', 'مسیر OPF در container.xml تعریف نشده یا فایل آن موجود نیست.');
  }

  // --- OPF ---
  let opf;
  try {
    opf = parser.parse(await zip.file(opfPath).async('string'));
  } catch {
    throw new EpubParseError('bad-opf', 'فایل OPF قابل تحلیل (XML) نیست.');
  }
  const pkg = opf?.package;
  if (!pkg) throw new EpubParseError('bad-opf', 'المان <package> در OPF پیدا نشد.');

  const meta = pkg?.metadata ?? {};
  const title = textOf(asArray(meta.title)[0]).trim();
  const language = textOf(asArray(meta.language)[0]).trim().toLowerCase();
  const creator = textOf(asArray(meta.creator)[0]).trim();

  // --- manifest / spine ---
  const manifestItems = asArray(pkg?.manifest?.item);
  const manifest = new Map();
  for (const item of manifestItems) {
    const id = item?.['@id'];
    const href = item?.['@href'];
    if (!id || !href) continue;
    manifest.set(id, {
      id,
      href: joinPath(dirOf(opfPath), href),
      mediaType: item?.['@media-type'] ?? '',
      properties: (item?.['@properties'] ?? '').split(/\s+/).filter(Boolean),
    });
  }

  const spineRefs = asArray(pkg?.spine?.itemref).map((r) => r?.['@idref']).filter(Boolean);
  if (spineRefs.length === 0) {
    throw new EpubParseError('empty-spine', 'spine خالی است؛ هیچ سندی برای خواندن تعریف نشده.');
  }
  const spineHrefs = spineRefs.map((id) => manifest.get(id)?.href).filter(Boolean);

  // --- کاور داخلی ---
  let coverHref = null;
  for (const item of manifest.values()) {
    if (item.properties.includes('cover-image') && item.mediaType.startsWith('image/')) {
      coverHref = item.href;
      break;
    }
  }
  if (!coverHref) {
    const coverMeta = asArray(meta.meta).find(
      (m) => m?.['@name'] === 'cover' && m?.['@content'],
    );
    const byId = coverMeta ? manifest.get(coverMeta['@content']) : null;
    if (byId && byId.mediaType.startsWith('image/')) coverHref = byId.href;
  }

  // --- فهرست مطالب ---
  let tocSource = 'spine';
  let chapters = null;

  const navItem = [...manifest.values()].find((i) => i.properties.includes('nav'));
  const ncxId = pkg?.spine?.['@toc'];
  const ncxItem = ncxId ? manifest.get(ncxId) : null;
  const ncxFallback = ncxItem ?? [...manifest.values()].find((i) => i.href && i.href.endsWith('.ncx'));

  if (navItem) {
    try {
      chapters = await parseNavDoc(zip, navItem.href, dirOf(navItem.href));
      tocSource = 'nav';
    } catch {
      chapters = null;
    }
  }
  if (!chapters && ncxFallback) {
    try {
      chapters = await parseNcx(zip, ncxFallback.href, dirOf(ncxFallback.href));
      tocSource = 'ncx';
    } catch {
      chapters = null;
    }
  }
  if (!chapters || chapters.length === 0) {
    chapters = await titlesFromSpine(zip, spineHrefs);
    tocSource = 'spine';
  }

  // href فصل‌ها باید در spine وجود داشته باشند؛ موارد تکراری حذف می‌شوند
  const spineSet = new Set(spineHrefs);
  chapters = chapters.filter((c) => c.href && spineSet.has(c.href));
  const seen = new Set();
  chapters = chapters.filter((c) => (seen.has(c.href) ? false : (seen.add(c.href), true)));

  return {
    title,
    language,
    creator,
    opfPath,
    spineCount: spineRefs.length,
    coverHref,
    tocSource,
    chapters,
    size: typeof input !== 'string' && input ? input.byteLength : null,
    hasNcx: Boolean(ncxFallback),
    hasNav: Boolean(navItem),
  };
}

/** nav.xhtml (EPUB 3) */
async function parseNavDoc(zip, navHref, navDir) {
  const file = zip.file(navHref);
  if (!file) throw new EpubParseError('missing-nav', 'فایل nav پیدا نشد.');
  const doc = parser.parse(await file.async('string'));
  const navs = asArray(doc?.html?.body?.nav);
  const tocNav =
    navs.find((n) => String(n?.['@epub:type'] ?? n?.['@type'] ?? '').split(/\s+/).includes('toc')) ?? navs[0];
  if (!tocNav) throw new EpubParseError('empty-nav', 'هیچ <nav>ی در nav سند پیدا نشد.');

  const out = [];
  const walkLi = (li) => {
    const anchor = li?.a;
    if (anchor) {
      const href = anchor?.['@href'];
      const title = textOf(anchor).replace(/\s+/g, ' ').trim();
      if (href && title) {
        const full = joinPath(navDir, stripFragment(href));
        if (full) out.push({ title, href: full });
      }
    }
    const nestedOl = li?.ol;
    for (const innerLi of asArray(nestedOl?.li)) walkLi(innerLi);
  };
  const lis = asArray(tocNav?.ol?.li);
  if (lis.length === 0) throw new EpubParseError('empty-nav', 'فهرست nav خالی است.');
  for (const li of lis) walkLi(li);
  return out;
}

/** toc.ncx (EPUB 2) */
async function parseNcx(zip, ncxHref, ncxDir) {
  const file = zip.file(ncxHref);
  if (!file) throw new EpubParseError('missing-ncx', 'فایل ncx پیدا نشد.');
  const doc = parser.parse(await file.async('string'));
  const out = [];
  const walk = (np) => {
    const title = textOf(asArray(np?.navLabel)[0]?.text).replace(/\s+/g, ' ').trim();
    const src = np?.content?.['@src'];
    if (src && title) {
      const full = joinPath(ncxDir, stripFragment(src));
      if (full) out.push({ title, href: full });
    }
    for (const child of asArray(np?.navPoint)) walk(child);
  };
  const points = asArray(doc?.ncx?.navMap?.navPoint);
  if (points.length === 0) throw new EpubParseError('empty-ncx', 'navMap خالی است.');
  for (const np of points) walk(np);
  return out;
}

/** Fallback: عنوان فصل از داخل خود سند (نه نام فایل) */
async function titlesFromSpine(zip, spineHrefs) {
  const out = [];
  let index = 1;
  for (const href of spineHrefs) {
    let title = '';
    try {
      const file = zip.file(href);
      if (file) {
        const head = (await file.async('string')).slice(0, 8000);
        const m =
          head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ??
          head.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
        if (m) title = m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    } catch {
      title = '';
    }
    out.push({ title: title || `فصل ${index}`, href });
    index += 1;
  }
  return out;
}

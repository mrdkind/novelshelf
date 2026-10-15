import type { CustomFont, ReaderSettings, ReaderTheme } from '@/types';

/* ---------------- پالت تم‌ها ---------------- */

export interface ThemePalette {
  /** پس‌زمینه بدنه کتاب */
  bg: string;
  /** رنگ متن */
  fg: string;
  /** رنگ لینک */
  link: string;
  /** پس‌زمینه نوار ابزار/پنل‌ها (chrome) */
  chrome: string;
  /** رنگ کمکی برای زیرنویس‌ها */
  muted: string;
  /** حاشیه‌ها */
  border: string;
  /** نام فارسی تم */
  label: string;
  /** رنگ پیش‌نمایش (برای سواچ انتخاب تم) */
  swatch: [string, string];
}

export const THEME_PALETTES: Record<Exclude<ReaderTheme, 'custom'>, ThemePalette> = {
  dark: {
    bg: '#14161b', fg: '#d9dde5', link: '#e2a94f',
    chrome: '#1a1e26', muted: '#8b93a5', border: '#2a3140',
    label: 'تاریک', swatch: ['#14161b', '#d9dde5'],
  },
  light: {
    bg: '#fbf9f4', fg: '#2b2e35', link: '#8a5508',
    chrome: '#f2eee3', muted: '#777d8a', border: '#ddd6c6',
    label: 'روشن', swatch: ['#fbf9f4', '#2b2e35'],
  },
  sepia: {
    bg: '#f4ecd8', fg: '#4a4234', link: '#7a5a20',
    chrome: '#ece2c8', muted: '#8a7f68', border: '#ddd0b0',
    label: 'سپیا', swatch: ['#f4ecd8', '#4a4234'],
  },
  midnight: {
    bg: '#0e1526', fg: '#c3cfe3', link: '#7fb4ff',
    chrome: '#111a30', muted: '#7183a3', border: '#233252',
    label: 'نیمه‌شب', swatch: ['#0e1526', '#7fb4ff'],
  },
  mocha: {
    bg: '#221a16', fg: '#e6d5c8', link: '#d9925f',
    chrome: '#2a201a', muted: '#a08c7d', border: '#41332a',
    label: 'موکا', swatch: ['#221a16', '#d9925f'],
  },
  sage: {
    bg: '#eef0e6', fg: '#37402f', link: '#4c7a4f',
    chrome: '#e3e6d7', muted: '#7d8772', border: '#ccd2ba',
    label: 'سبز ملایم', swatch: ['#eef0e6', '#4c7a4f'],
  },
  slate: {
    bg: '#e8eaee', fg: '#2c3138', link: '#3f6c8f',
    chrome: '#dde0e6', muted: '#6f7680', border: '#c6cbd4',
    label: 'خاکستری', swatch: ['#e8eaee', '#3f6c8f'],
  },
};

/** پالت مؤثر — برای تم سفارشی از رنگ‌های کاربر استفاده می‌شود */
export function effectivePalette(s: Pick<ReaderSettings, 'theme' | 'textColor' | 'bgColor' | 'bgImageUrl' | 'bgImageOpacity'>): ThemePalette {
  if (s.theme === 'custom') {
    const bg = s.bgColor ?? '#14161b';
    const fg = s.textColor ?? '#d9dde5';
    // روشنایی پس‌زمینه برای انتخاب رنگ لینک مناسب
    const light = isLightColor(bg);
    return {
      bg,
      fg,
      link: light ? '#8a5508' : '#e2a94f',
      chrome: shadeColor(bg, light ? -8 : 10),
      muted: light ? '#777d8a' : '#8b93a5',
      border: shadeColor(bg, light ? -14 : 18),
      label: 'سفارشی',
      swatch: [bg, fg],
    };
  }
  return THEME_PALETTES[s.theme];
}

/* ---------------- ابزار رنگ ---------------- */

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function isLightColor(hex: string): boolean {
  const rgb = parseHex(hex);
  if (!rgb) return false;
  // درخشندگی ادراکی
  return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 > 0.55;
}

function shadeColor(hex: string, percent: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v + (percent / 100) * 255)));
  return `#${rgb.map((v) => cl(v).toString(16).padStart(2, '0')).join('')}`;
}

/* ---------------- استخراج CSS هر تم ---------------- */

/** CSS پایه برای هر تم مطالعه — بدون دست‌کاری مخرب ساختار کتاب */
export function themeCss(s: ReaderSettings): string {
  const p = effectivePalette(s);
  return `
    html, body { background: ${p.bg} !important; }
    body { color: ${p.fg} !important; }
    a, a:visited { color: ${p.link} !important; }
    /* حفظ تصاویر: جلوگیری از کشیدگی، اسکرول افقی و شکستگی در وسط تصویر */
    img, svg, video, iframe {
      max-width: 100% !important;
      height: auto !important;
      object-fit: contain;
    }
    img { page-break-inside: avoid; break-inside: avoid; }
    pre, table { max-width: 100%; overflow-wrap: break-word; }
    /* خنثی‌سازی پس‌زمینه/رنگ‌های تزریقی کتاب */
    * { text-shadow: none !important; box-shadow: none !important; }
  `;
}

/* ---------------- فونت‌ها ---------------- */

const F = import.meta.env.BASE_URL + 'fonts/';

/** CSS @font-face همه فونت‌های پیش‌فرض */
export const FONT_BASE_CSS = `
  @font-face { font-family: 'Vazirmatn'; src: url('${F}Vazirmatn-Regular.woff2') format('woff2'); font-weight: 400; }
  @font-face { font-family: 'Vazirmatn'; src: url('${F}Vazirmatn-Bold.woff2') format('woff2'); font-weight: 700; }
  @font-face { font-family: 'Sahel'; src: url('${F}Sahel-Regular.woff2') format('woff2'); font-weight: 400; }
  @font-face { font-family: 'Sahel'; src: url('${F}Sahel-Bold.woff2') format('woff2'); font-weight: 700; }
  @font-face { font-family: 'Shabnam'; src: url('${F}Shabnam-Regular.woff2') format('woff2'); font-weight: 400; }
  @font-face { font-family: 'Shabnam'; src: url('${F}Shabnam-Bold.woff2') format('woff2'); font-weight: 700; }
  @font-face { font-family: 'Estedad'; src: url('${F}Estedad-Regular.woff2') format('woff2'); font-weight: 400; }
  @font-face { font-family: 'Estedad'; src: url('${F}Estedad-Bold.woff2') format('woff2'); font-weight: 700; }
  @font-face { font-family: 'Amiri'; src: url('${F}Amiri-Regular.woff2') format('woff2'); font-weight: 400; }
  @font-face { font-family: 'Amiri'; src: url('${F}Amiri-Bold.woff2') format('woff2'); font-weight: 700; }
  @font-face { font-family: 'Noto Naskh Arabic'; src: url('${F}NotoNaskh-Regular.woff2') format('woff2'); font-weight: 400 700; }
`;

/** نام خانواده CSS برای هر فونت */
export function fontStackCss(f: ReaderSettings['fontFamily'], customFonts: CustomFont[]): string | null {
  switch (f) {
    case 'vazirmatn': return "'Vazirmatn', sans-serif";
    case 'sahel': return "'Sahel', 'Vazirmatn', sans-serif";
    case 'shabnam': return "'Shabnam', 'Vazirmatn', sans-serif";
    case 'estedad': return "'Estedad', 'Vazirmatn', sans-serif";
    case 'amiri': return "'Amiri', serif";
    case 'naskh': return "'Noto Naskh Arabic', 'Amiri', serif";
    case 'custom': {
      const cf = customFonts.find((c) => c.id === f) ?? customFonts[0];
      return cf ? `'NS-Custom-${cssSafeId(cf.id)}', 'Vazirmatn', sans-serif` : null;
    }
    default: return null; // فونت خود کتاب
  }
}

function cssSafeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '');
}

/** قالب فایل فونت از پسوند */
export function fontFormatFromName(name: string): CustomFont['format'] {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'woff2') return 'woff2';
  if (ext === 'woff') return 'woff';
  if (ext === 'otf') return 'opentype';
  return 'truetype';
}

/** ساخت CSS فونت سفارشی برای تزریق در سند کتاب */
export function customFontFaceCss(customFonts: CustomFont[]): string {
  return customFonts
    .map((c) => `@font-face { font-family: 'NS-Custom-${cssSafeId(c.id)}'; src: url('${c.dataUrl}') format('${c.format}'); font-weight: 400 800; }`)
    .join('\n');
}

/** ثبت فونت‌های سفارشی در سند اصلی (برای پیش‌نمایش پنل تنظیمات) */
export function registerCustomFontsInDocument(customFonts: CustomFont[]): void {
  if (typeof document === 'undefined') return;
  for (const c of customFonts) {
    const fam = `NS-Custom-${cssSafeId(c.id)}`;
    if (document.fonts && !Array.from(document.fonts).some((f) => f.family === fam)) {
      try {
        const ff = new FontFace(fam, `url(${c.dataUrl})`, { weight: '400 800' });
        void ff.load().then((loaded) => document.fonts.add(loaded)).catch(() => {});
      } catch {
        /* ignore */
      }
    }
  }
}

/* ---------------- CSS اعمال تنظیمات ---------------- */

/** CSS اعمال تنظیمات (فونت، فاصله‌ها، ترازبندی، رنگ سفارشی) */
export function settingsOverrideCss(s: ReaderSettings, customFonts: CustomFont[] = []): string {
  const scrolled = s.readingMode === 'scrolled';
  const lines: string[] = ['body {'];
  lines.push(`  line-height: ${s.lineHeight} !important;`);
  lines.push(`  text-align: ${s.textAlign} !important;`);
  lines.push(`  word-spacing: ${s.wordSpacing}px !important;`);
  // حاشیه و عرض ستون فقط در حالت پیمایشی اعمال می‌شود (در حالت صفحه‌بندی‌شده ساختار ستون‌ها را خراب می‌کند)
  if (scrolled) {
    lines.push(`  padding: ${s.pageMargin}px !important;`);
    lines.push(`  max-width: ${s.maxWidth}rem !important;`);
    lines.push('  margin-inline: auto !important;');
  }
  // رنگ سفارشی متن/پس‌زمینه (تم سفارشی) — پس‌زمینه نیمه‌شفاف برای نمایش تصویر پشت کتاب
  if (s.theme === 'custom' && s.bgImageUrl) {
    lines.push(`  background: ${hexWithAlpha(s.bgColor ?? '#14161b', s.bgImageOpacity)} !important;`);
  }
  lines.push('}');
  const stack = fontStackCss(s.fontFamily, customFonts);
  if (stack) {
    lines.push(`body, p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote { font-family: ${stack} !important; }`);
  }
  lines.push(`p { margin-bottom: ${s.paragraphSpacing}em !important; }`);
  return lines.join('\n');
}

function hexWithAlpha(hex: string, alpha: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha.toFixed(3)})`;
}

/** عرض ستون متن — فقط در حالت پیمایشی به‌صورت واقعی اعمال می‌شود (مستند شده) */
export function columnWidthCss(s: ReaderSettings): string {
  return `#ns-column { max-width: ${s.maxWidth}rem; margin-inline: auto; }`;
}

/** تعیین جهت مؤثر کتاب بر اساس تنظیم و زبان کتاب */
export function effectiveDirection(s: ReaderSettings, bookLanguage: string | null | undefined): 'rtl' | 'ltr' {
  if (s.direction === 'auto') {
    const lang = (bookLanguage ?? '').toLowerCase();
    const rtlLangs = ['fa', 'ar', 'he', 'ur', 'ps', 'ckb', 'sd'];
    return rtlLangs.some((l) => lang.startsWith(l)) ? 'rtl' : 'ltr';
  }
  return s.direction;
}

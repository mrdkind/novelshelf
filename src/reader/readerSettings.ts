import type { ReaderSettings } from '@/types';

/** استخراج CSS پایه برای هر تم مطالعه — بدون دست‌کاری مخرب ساختار کتاب */
export function themeCss(theme: ReaderSettings['theme']): string {
  const palettes: Record<ReaderSettings['theme'], { bg: string; fg: string; link: string }> = {
    dark: { bg: '#14161b', fg: '#d9dde5', link: '#e2a94f' },
    light: { bg: '#fbf9f4', fg: '#2b2e35', link: '#8a5508' },
    sepia: { bg: '#f4ecd8', fg: '#4a4234', link: '#7a5a20' },
  };
  const p = palettes[theme];
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
    /* خنثی‌سازی پس‌زمینه/رنگ‌های تزریقی کتاب با تم تاریک */
    * { text-shadow: none !important; box-shadow: none !important; }
  `;
}

/** CSS اعمال تنظیمات (فونت، فاصله‌ها، ترازبندی) */
export function settingsOverrideCss(s: ReaderSettings): string {
  const scrolled = s.readingMode === 'scrolled';
  const lines: string[] = ['body {'];
  lines.push(`  line-height: ${s.lineHeight} !important;`);
  lines.push(`  text-align: ${s.textAlign} !important;`);
  // حاشیه و عرض ستون فقط در حالت پیمایشی اعمال می‌شود (در حالت صفحه‌بندی‌شده ساختار ستون‌ها را خراب می‌کند)
  if (scrolled) {
    lines.push(`  padding: ${s.pageMargin}px !important;`);
    lines.push(`  max-width: ${s.maxWidth}rem !important;`);
    lines.push('  margin-inline: auto !important;');
  }
  lines.push('}');
  if (s.fontFamily === 'vazirmatn') {
    lines.push(`body, p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote { font-family: 'Vazirmatn', sans-serif !important; }`);
  }
  lines.push(`p { margin-bottom: ${s.paragraphSpacing}em !important; }`);
  return lines.join('\n');
}

/** عرض ستون متن — فقط در حالت پیمایشی به‌صورت واقعی اعمال می‌شود (مستند شده) */
export function columnWidthCss(s: ReaderSettings): string {
  return `#ns-column { max-width: ${s.maxWidth}rem; margin-inline: auto; }`;
}

export const FONT_BASE_CSS = `
  @font-face {
    font-family: 'Vazirmatn';
    src: url('${import.meta.env.BASE_URL}fonts/Vazirmatn-Regular.woff2') format('woff2');
    font-weight: 400;
  }
  @font-face {
    font-family: 'Vazirmatn';
    src: url('${import.meta.env.BASE_URL}fonts/Vazirmatn-Bold.woff2') format('woff2');
    font-weight: 700;
  }
`;

/** تعیین جهت مؤثر کتاب بر اساس تنظیم و زبان کتاب */
export function effectiveDirection(s: ReaderSettings, bookLanguage: string | null | undefined): 'rtl' | 'ltr' {
  if (s.direction === 'auto') {
    const lang = (bookLanguage ?? '').toLowerCase();
    const rtlLangs = ['fa', 'ar', 'he', 'ur', 'ps', 'ckb', 'sd'];
    return rtlLangs.some((l) => lang.startsWith(l)) ? 'rtl' : 'ltr';
  }
  return s.direction;
}

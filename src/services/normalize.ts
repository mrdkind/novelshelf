/**
 * نرمال‌سازی متن فارسی/عربی برای جست‌وجو:
 *  - یکسان‌سازی «ي→ی»، «ك→ک»، همزه‌ها
 *  - حذف اعراب و نیم‌فاصله‌های متغیر
 *  - یکسان‌سازی ارقام فارسی/عربی با لاتین
 *  - حذف فاصله‌های اضافه و یکسان‌سازی حروف بزرگ لاتین
 */
const ARABIC_TO_PERSIAN: Record<string, string> = {
  'ي': 'ی',
  'ك': 'ک',
  'ﻻ': 'لا',
  'أ': 'ا',
  'إ': 'ا',
  'ٱ': 'ا',
  'ة': 'ه',
  'ؤ': 'و',
  'ئ': 'ی',
};

const ZWNJ = /\u200c|\u200f|\u200e|\u202a-\u202e|\u2066-\u2069/g;
const TASHKEEL = /[\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g; // اعراب + کشیده
const AR_DIGITS = /[\u0660-\u0669]/g;
const FA_DIGITS = /[\u06f0-\u06f9]/g;

export function toLatinDigits(s: string): string {
  return s
    .replace(AR_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(FA_DIGITS, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function normalizeFa(input: string): string {
  let s = input ?? '';
  // جایگزینی حروف عربی
  s = s.replace(/[\u0622\u0623\u0625\u0671\u064a\u0643\u0649\u0629\u0624\u0626]/g, (c) => ARABIC_TO_PERSIAN[c] ?? c);
  s = s.replace(ZWNJ, ' ');
  s = s.replace(TASHKEEL, '');
  s = toLatinDigits(s);
  s = s.replace(/[\u0640]/g, ''); // کشیده
  // نیم‌فاصله/خط تیره/زیرخط → فاصله تا ترکیب‌ها هم پیدا شوند
  s = s.replace(/[-_/\\.,:;()[\]{}«»"'`!?*+~=|@#$%^&]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim().toLowerCase();
  return s;
}

/** تطبیق شامل با نرمال‌سازی */
export function faIncludes(haystack: string, needle: string): boolean {
  const h = normalizeFa(haystack);
  const n = normalizeFa(needle);
  if (!n) return true;
  return h.includes(n);
}

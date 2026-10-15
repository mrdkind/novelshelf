/* ابزارهای نگارش فارسی — طبق اسکیل persian-writing
 * اعداد فارسی در متن فارسی الزامی است (اعداد لاتین جریان RTL را به‌هم می‌ریزند). */

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'] as const;

/** تبدیل ارقام لاتین رشته/عدد به ارقام فارسی (۴۵۶ → ۴۵۶) */
export function faDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

/** درصد فارسی: ۰ تا ۱۰۰ با نماد ٪ */
export function faPercent(ratio: number): string {
  return `${faDigits(Math.round(ratio * 100))}٪`;
}

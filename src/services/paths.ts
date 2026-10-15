/**
 * مسیرها و Base Path
 *
 * همه مسیرهای فایل (کاور، EPUB، کاتالوگ) در کاتالوگ «نسبی به ریشه سایت» ذخیره می‌شوند
 * (مثل novels/alice-in-wonderland/cover.svg). این ماژول آن‌ها را با Base Path سازگار
 * با GitHub Pages ترکیب می‌کند؛ چه سایت روی ریشه دامنه باشد چه زیر پوشه مخزن.
 */

/** مقدار base که Vite در Build تزریق می‌کند ('/' یا '/REPO_NAME/') */
export const BASE_URL = import.meta.env.BASE_URL ?? '/';

/** ترکیب مسیر نسبی با Base Path سایت */
export function withBase(relPath: string): string {
  if (/^(https?:)?\/\//i.test(relPath) || relPath.startsWith('data:')) return relPath;
  const clean = relPath.replace(/^\/+/, '');
  const base = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
  return `${base}${clean}`;
}

/** انکد مسیر برای fetch (پشتیبانی از فاصله و حروف غیر لاتین در نام فایل) */
export function fetchUrl(relPath: string): string {
  const url = withBase(relPath);
  // هر سگمنت را جداگانه انکد می‌کنیم تا اسلش‌ها حفظ شوند
  return url
    .split('/')
    .map((seg) => (seg ? encodeURIComponent(seg) : seg))
    .join('/')
    .replace(/%3A/gi, ':');
}

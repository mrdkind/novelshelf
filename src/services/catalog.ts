import type { Catalog, Novel, Volume } from '@/types';
import { CatalogError } from '@/types';
import { fetchUrl } from './paths';

export interface CatalogState {
  catalog: Catalog | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  errorCode: string | null;
}

let cache: Catalog | null = null;
let inflight: Promise<Catalog> | null = null;

/** دریافت catalog.json با تلاش مجدد و مدیریت خطای خوانا */
export async function loadCatalog(forceReload = false): Promise<Catalog> {
  if (cache && !forceReload) return cache;
  if (inflight && !forceReload) return inflight;

  const task = (async () => {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30_000);
        const res = await fetch(fetchUrl('catalog.json'), {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        clearTimeout(timer);
        if (res.status === 404) {
          throw new CatalogError('not-found', 'فهرست کتاب‌ها پیدا نشد؛ احتمالاً کاتالوگ هنوز ساخته نشده است.');
        }
        if (!res.ok) {
          throw new CatalogError('network', `دریافت فهرست کتاب‌ها ناموفق بود (کد ${res.status}).`);
        }
        const data = (await res.json()) as Catalog;
        if (!data || !Array.isArray(data.novels)) {
          throw new CatalogError('parse', 'قالب فهرست کتاب‌ها نامعتبر است.');
        }
        cache = data;
        return data;
      } catch (e) {
        lastError = e;
        if (e instanceof CatalogError) throw e;
        // خطای شبکه → یک تلاش دیگر
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 700));
          continue;
        }
      }
    }
    if (lastError instanceof CatalogError) throw lastError;
    throw new CatalogError('network', 'دریافت فهرست کتاب‌ها ناموفق بود؛ اتصال اینترنت را بررسی کنید.');
  })();

  inflight = task;
  try {
    return await task;
  } finally {
    inflight = null;
  }
}

export function novelById(novels: Novel[], id: string | undefined): Novel | undefined {
  if (!id) return undefined;
  return novels.find((n) => n.id === id);
}

export function volumeById(novel: Novel | undefined, volumeId: string | undefined): Volume | undefined {
  if (!novel || !volumeId) return undefined;
  return novel.volumes.find((v) => v.id === volumeId);
}

export function displayTitle(novel: Novel): string {
  return novel.titleFa ?? novel.titleOriginal ?? novel.id;
}

export function originalTitle(novel: Novel): string | null {
  if (novel.titleFa && novel.titleOriginal && novel.titleFa !== novel.titleOriginal) {
    return novel.titleOriginal;
  }
  return null;
}

/** همه ژانرهای موجود در کاتالوگ با تعداد */
export function collectGenres(novels: Novel[]): Array<{ name: string; count: number }> {
  const map = new Map<string, number>();
  for (const n of novels) {
    for (const g of n.genres ?? []) {
      map.set(g, (map.get(g) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fa'));
}

export function totalChapters(novel: Novel): number {
  return novel.volumes.reduce((s, v) => s + v.chapters.length, 0);
}

export const STATUS_LABELS: Record<Novel['status'], string> = {
  ongoing: 'در حال انتشار',
  completed: 'کامل‌شده',
  hiatus: 'متوقف‌شده',
};

/** متن خطای کاربرپسند بر اساس نوع خطا */
export function catalogErrorMessage(e: unknown): string {
  if (e instanceof CatalogError) return e.message;
  if (e instanceof TypeError) return 'دریافت فهرست کتاب‌ها ناموفق بود؛ اتصال اینترنت را بررسی کنید.';
  return 'خطای غیرمنتظره در دریافت فهرست کتاب‌ها.';
}

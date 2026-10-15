/**
 * دریافت فایل EPUB فقط هنگام درخواست مطالعه + کش درون‌حافظه‌ای برای یک نشست.
 * برای کتاب‌های بزرگ، روند دریافت با خواندن جریانی گزارش می‌شود.
 */

import { fetchUrl } from './paths';
import { faDigits } from './persian';

interface CachedEntry {
  buffer: ArrayBuffer;
  fetchedAt: number;
}

const cache = new Map<string, CachedEntry>();
const MAX_CACHED = 3; // هم‌زمان حداکثر ۳ کتاب در حافظه (مدیریت حافظه در مطالعه طولانی)

export interface DownloadProgress {
  loaded: number;
  total: number | null;
}

export async function loadEpub(
  relPath: string,
  onProgress?: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const cached = cache.get(relPath);
  if (cached) return cached.buffer;

  const url = fetchUrl(relPath);

  const res = await fetch(url, { signal, headers: { Accept: 'application/epub+zip' } });
  if (res.status === 404) {
    throw new Error('فایل کتاب روی سرور پیدا نشد؛ ممکن است EPUB حذف یا نام آن تغییر کرده باشد.');
  }
  if (!res.ok) {
    throw new Error(`دریافت فایل کتاب ناموفق بود (کد ${res.status}).`);
  }

  const totalHeader = res.headers.get('content-length');
  const total = totalHeader ? Number(totalHeader) : null;

  let buffer: ArrayBuffer;
  if (res.body && typeof res.body.getReader === 'function' && onProgress) {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loaded += value.byteLength;
        onProgress({ loaded, total });
      }
    }
    const merged = new Uint8Array(loaded);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }
    buffer = merged.buffer;
  } else {
    buffer = await res.arrayBuffer();
    onProgress?.({ loaded: buffer.byteLength, total: buffer.byteLength });
  }

  // حذف قدیمی‌ترین‌ها برای کنترل مصرف حافظه
  if (cache.size >= MAX_CACHED) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(relPath, { buffer, fetchedAt: Date.now() });
  return buffer;
}

/** آزادسازی منابع پس از خروج از کتاب‌خوان */
export function dropEpub(relPath?: string): void {
  if (relPath) cache.delete(relPath);
  else cache.clear();
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '';
  const d = (v: string) => faDigits(v);
  if (bytes < 1024) return `${d(String(bytes))} بایت`;
  if (bytes < 1024 * 1024) return `${d((bytes / 1024).toFixed(0))} کیلوبایت`;
  return `${d((bytes / 1024 / 1024).toFixed(1))} مگابایت`;
}

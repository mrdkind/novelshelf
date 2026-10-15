/**
 * مخزن‌های داده شخصی (پیشرفت، نشانک، علاقه‌مندی، تاریخچه، تنظیمات).
 * کلیدها پایدار و مبتنی بر شناسه کتاب/جلد/href فصل هستند (نه شماره صفحه).
 */
import { HISTORY_LIMIT, APP_VERSION } from '@/config';
import type {
  BackupFile,
  Bookmark,
  Favorite,
  HistoryEntry,
  ReadChapterRecord,
  ReadingProgress,
} from '@/types';
import { BACKUP_SCHEMA_VERSION } from '@/types';
import * as db from './db';

export function progressKey(bookId: string, volumeId: string): string {
  return `${bookId}::${volumeId}`;
}

export function chapterKey(bookId: string, volumeId: string, href: string): string {
  return `${bookId}::${volumeId}::${href}`;
}

/* ---------------- پیشرفت مطالعه ---------------- */

export async function getProgress(bookId: string, volumeId: string): Promise<ReadingProgress | undefined> {
  return db.get<ReadingProgress>(db.STORES.progress, progressKey(bookId, volumeId));
}

export async function saveProgress(p: ReadingProgress): Promise<void> {
  await db.put(db.STORES.progress, { ...p, key: progressKey(p.bookId, p.volumeId) });
}

export async function getAllProgress(): Promise<ReadingProgress[]> {
  return db.getAll<ReadingProgress>(db.STORES.progress);
}

/* ---------------- نشانک‌ها ---------------- */

export function newBookmark(p: Omit<Bookmark, 'id' | 'createdAt'>): Bookmark {
  const id = `bm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return { ...p, id, createdAt: Date.now() };
}

export async function getBookmarks(bookId: string, volumeId?: string): Promise<Bookmark[]> {
  const all = await db.getByIndex<Bookmark>(db.STORES.bookmarks, 'bookId', bookId);
  const filtered = volumeId ? all.filter((b) => b.volumeId === volumeId) : all;
  return filtered.sort((a, b) => b.createdAt - a.createdAt);
}

export async function addBookmark(b: Bookmark): Promise<void> {
  await db.put(db.STORES.bookmarks, b);
}

export async function removeBookmark(id: string): Promise<void> {
  await db.remove(db.STORES.bookmarks, id);
}

export async function getAllBookmarks(): Promise<Bookmark[]> {
  return db.getAll<Bookmark>(db.STORES.bookmarks);
}

/* ---------------- علاقه‌مندی‌ها ---------------- */

export async function isFavorite(bookId: string): Promise<boolean> {
  return (await db.get<Favorite>(db.STORES.favorites, bookId)) !== undefined;
}

export async function toggleFavorite(bookId: string): Promise<boolean> {
  const existing = await db.get<Favorite>(db.STORES.favorites, bookId);
  if (existing) {
    await db.remove(db.STORES.favorites, bookId);
    return false;
  }
  await db.put<Favorite>(db.STORES.favorites, { bookId, addedAt: Date.now() });
  return true;
}

export async function getAllFavorites(): Promise<Favorite[]> {
  return db.getAll<Favorite>(db.STORES.favorites);
}

/* ---------------- تاریخچه مطالعه ---------------- */

export async function touchHistory(bookId: string, volumeId: string): Promise<void> {
  await db.put<HistoryEntry & { bookId: string }>(db.STORES.history, {
    bookId,
    volumeId,
    updatedAt: Date.now(),
  });
  // سقف تعداد رکوردهای تاریخچه
  const all = await db.getAll<HistoryEntry>(db.STORES.history);
  if (all.length > HISTORY_LIMIT) {
    const sorted = all.sort((a, b) => a.updatedAt - b.updatedAt);
    const extra = sorted.slice(0, all.length - HISTORY_LIMIT);
    for (const e of extra) await db.remove(db.STORES.history, e.bookId);
  }
}

export async function getHistory(): Promise<HistoryEntry[]> {
  const all = await db.getAll<HistoryEntry>(db.STORES.history);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function removeHistoryEntry(bookId: string): Promise<void> {
  await db.remove(db.STORES.history, bookId);
}

/* ---------------- فصل‌های خوانده‌شده ---------------- */

export async function markChapterRead(bookId: string, volumeId: string, href: string): Promise<void> {
  const rec: ReadChapterRecord = { key: chapterKey(bookId, volumeId, href), readAt: Date.now() };
  await db.put(db.STORES.readChapters, rec);
}

export async function unmarkChapterRead(bookId: string, volumeId: string, href: string): Promise<void> {
  await db.remove(db.STORES.readChapters, chapterKey(bookId, volumeId, href));
}

export async function isChapterRead(bookId: string, volumeId: string, href: string): Promise<boolean> {
  return (await db.get<ReadChapterRecord>(db.STORES.readChapters, chapterKey(bookId, volumeId, href))) !== undefined;
}

export async function getReadChaptersOfVolume(bookId: string, volumeId: string): Promise<Set<string>> {
  const all = await db.getAll<ReadChapterRecord>(db.STORES.readChapters);
  const prefix = `${bookId}::${volumeId}::`;
  return new Set(all.filter((r) => r.key.startsWith(prefix)).map((r) => r.key.slice(prefix.length)));
}

/* ---------------- تنظیمات ---------------- */

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const rec = await db.get<{ key: string; value: T }>(db.STORES.settings, key);
  return rec ? rec.value : fallback;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.put(db.STORES.settings, { key, value });
}

/* ---------------- پشتیبان‌گیری (Export/Import) ---------------- */

export async function exportBackup(): Promise<BackupFile> {
  const [progress, bookmarks, favorites, history, readChapters, settings] = await Promise.all([
    db.getAll<ReadingProgress>(db.STORES.progress),
    db.getAll<Bookmark>(db.STORES.bookmarks),
    db.getAll<Favorite>(db.STORES.favorites),
    db.getAll<HistoryEntry>(db.STORES.history),
    db.getAll<ReadChapterRecord>(db.STORES.readChapters),
    db.getAll<{ key: string; value: unknown }>(db.STORES.settings),
  ]);
  return {
    app: 'NovelShelf',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      progress,
      bookmarks,
      favorites,
      history,
      readChapters,
      settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
    },
  };
}

export type ImportMode = 'merge' | 'replace';

export interface ImportResult {
  mode: ImportMode;
  counts: { progress: number; bookmarks: number; favorites: number; history: number; readChapters: number };
}

/** نتیجه اعتبارسنجی فایل پشتیبان */
export function validateBackup(raw: unknown): { ok: true; backup: BackupFile } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'فایل انتخاب‌شده یک پشتیبان معتبر NovelShelf نیست.' };
  }
  const b = raw as Partial<BackupFile>;
  if (b.app !== 'NovelShelf') {
    return { ok: false, error: 'این فایل با پشتیبان‌های NovelShelf همخوان نیست (شناسه app نادرست است).' };
  }
  if (typeof b.schemaVersion !== 'number' || b.schemaVersion > BACKUP_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `نسخهٔ قالب پشتیبان (${String(b.schemaVersion)}) جدیدتر از نسخهٔ پشتیبانی‌شده (${BACKUP_SCHEMA_VERSION}) است؛ برنامه را به‌روزرسانی کنید.`,
    };
  }
  if (!b.data || typeof b.data !== 'object') {
    return { ok: false, error: 'محتوای داده‌های پشتیبان نامعتبر است.' };
  }
  return { ok: true, backup: b as BackupFile };
}

export async function importBackup(backup: BackupFile, mode: ImportMode): Promise<ImportResult> {
  const d = backup.data;
  if (mode === 'replace') {
    // جایگزینی کامل — فقط پس از تأیید صریح کاربر فراخوانی می‌شود
    await Promise.all(Object.values(db.STORES).map((s) => db.clearStore(s)));
  }
  await Promise.all([
    db.bulkPut(db.STORES.progress, d.progress ?? []),
    db.bulkPut(db.STORES.bookmarks, d.bookmarks ?? []),
    db.bulkPut(db.STORES.favorites, d.favorites ?? []),
    db.bulkPut(db.STORES.history, d.history ?? []),
    db.bulkPut(db.STORES.readChapters, d.readChapters ?? []),
    ...Object.entries(d.settings ?? {}).map(([key, value]) =>
      db.put(db.STORES.settings, { key, value }),
    ),
  ]);
  return {
    mode,
    counts: {
      progress: d.progress?.length ?? 0,
      bookmarks: d.bookmarks?.length ?? 0,
      favorites: d.favorites?.length ?? 0,
      history: d.history?.length ?? 0,
      readChapters: d.readChapters?.length ?? 0,
    },
  };
}

export const BACKUP_INFO = { appVersion: APP_VERSION };

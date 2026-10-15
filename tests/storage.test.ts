import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

let repo;

beforeAll(async () => {
  repo = await import('../src/storage/repositories');
});

beforeEach(async () => {
  // بین آزمون‌ها پایه را خالی کن
  const db = await import('../src/storage/db');
  await db.clearAll();
});

describe('لایه ذخیره‌سازی محلی (IndexedDB)', () => {
  it('پیشرفت مطالعه با کلید پایدار ذخیره و خوانده می‌شود', async () => {
    await repo.saveProgress({
      bookId: 'alice',
      volumeId: 'vol-1',
      cfi: 'epubcfi(/6/4!/4/2)',
      href: 'OEBPS/text/ch1.xhtml',
      chapterTitle: 'فصل ۱',
      percentage: 0.42,
      updatedAt: Date.now(),
    });
    const p = await repo.getProgress('alice', 'vol-1');
    expect(p?.percentage).toBe(0.42);
    expect(p?.chapterTitle).toBe('فصل ۱');
  });

  it('نشانک اضافه و حذف می‌شود', async () => {
    const bm = repo.newBookmark({
      bookId: 'alice',
      volumeId: 'vol-1',
      cfi: 'epubcfi(/6/4)',
      href: 'OEBPS/text/ch1.xhtml',
      label: 'نشانک مهم',
    });
    await repo.addBookmark(bm);
    let list = await repo.getBookmarks('alice', 'vol-1');
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe('نشانک مهم');

    await repo.removeBookmark(bm.id);
    list = await repo.getBookmarks('alice', 'vol-1');
    expect(list).toHaveLength(0);
  });

  it('علاقه‌مندی toggle می‌شود', async () => {
    expect(await repo.isFavorite('golestan')).toBe(false);
    const afterAdd = await repo.toggleFavorite('golestan');
    expect(afterAdd).toBe(true);
    const afterRemove = await repo.toggleFavorite('golestan');
    expect(afterRemove).toBe(false);
  });

  it('تاریخچه با سقف تعداد نگه‌داری می‌شود', async () => {
    for (let i = 0; i < 70; i++) {
      await repo.touchHistory(`book-${i}`, 'vol-1');
    }
    const h = await repo.getHistory();
    expect(h.length).toBeLessThanOrEqual(60);
  });

  it('فصل خوانده‌شده ثبت و حذف می‌شود', async () => {
    await repo.markChapterRead('b', 'v', 'OEBPS/text/ch1.xhtml');
    expect(await repo.isChapterRead('b', 'v', 'OEBPS/text/ch1.xhtml')).toBe(true);
    const set = await repo.getReadChaptersOfVolume('b', 'v');
    expect(set.has('OEBPS/text/ch1.xhtml')).toBe(true);
    await repo.unmarkChapterRead('b', 'v', 'OEBPS/text/ch1.xhtml');
    expect(await repo.isChapterRead('b', 'v', 'OEBPS/text/ch1.xhtml')).toBe(false);
  });

  it('تنظیمات ذخیره و بازیابی می‌شوند', async () => {
    await repo.setSetting('reader', { fontSize: 140 });
    const s = await repo.getSetting('reader', { fontSize: 100 });
    expect(s.fontSize).toBe(140);
  });

  it('پشتیبان‌گیری: Export/Import با اعتبارسنجی', async () => {
    await repo.saveProgress({
      bookId: 'b1',
      volumeId: 'v1',
      cfi: 'c',
      href: 'h',
      chapterTitle: 't',
      percentage: 0.5,
      updatedAt: 1,
    });
    const bm = repo.newBookmark({ bookId: 'b1', volumeId: 'v1', cfi: 'c', href: 'h', label: 'L' });
    await repo.addBookmark(bm);

    const backup = await repo.exportBackup();
    expect(backup.app).toBe('NovelShelf');
    expect(backup.data.progress).toHaveLength(1);

    // پاک‌سازی و بازگردانی کامل
    await (await import('../src/storage/db')).clearAll();
    const check = repo.validateBackup(backup);
    expect(check.ok).toBe(true);
    const result = await repo.importBackup(check.backup, 'replace');
    expect(result.counts.progress).toBe(1);
    expect(result.counts.bookmarks).toBe(1);
    expect((await repo.getProgress('b1', 'v1'))?.percentage).toBe(0.5);
  });

  it('فایل پشتیبان نامعتبر رد می‌شود', () => {
    expect(repo.validateBackup(null).ok).toBe(false);
    expect(repo.validateBackup({ app: 'Other' }).ok).toBe(false);
    expect(repo.validateBackup({ app: 'NovelShelf', schemaVersion: 99, data: {} }).ok).toBe(false);
    expect(repo.validateBackup({ app: 'NovelShelf', schemaVersion: 1, data: {} }).ok).toBe(true);
  });
});

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Bookmark, CustomFont, HistoryEntry, ReadingProgress } from '@/types';
import { DEFAULT_READER_SETTINGS, normalizeReaderSettings } from '@/types';
import type { ReaderSettings } from '@/types';
import * as repo from '@/storage/repositories';
import { registerCustomFontsInDocument } from '@/reader/readerSettings';

/**
 * کانتکست داده‌های شخصی کاربر (ذخیره‌شده در مرورگر خود کاربر).
 * هیچ داده‌ای به سرور ارسال نمی‌شود.
 */
interface PersonalDataCtx {
  ready: boolean;
  progress: Map<string, ReadingProgress>;
  bookmarks: Bookmark[];
  favorites: Set<string>;
  history: HistoryEntry[];
  readerSettings: ReaderSettings;
  setReaderSettings: (s: ReaderSettings) => void;
  /** فونت‌های آپلودشده کاربر */
  customFonts: CustomFont[];
  addCustomFont: (f: Omit<CustomFont, 'id' | 'createdAt'>) => Promise<CustomFont>;
  deleteCustomFont: (id: string) => Promise<void>;
  saveProgress: (p: ReadingProgress) => Promise<void>;
  toggleFavorite: (bookId: string) => Promise<void>;
  addBookmark: (b: Omit<Bookmark, 'id' | 'createdAt'>) => Promise<Bookmark>;
  deleteBookmark: (id: string) => Promise<void>;
  touchHistory: (bookId: string, volumeId: string) => Promise<void>;
  removeHistory: (bookId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<PersonalDataCtx | null>(null);

export function PersonalDataProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [progressMap, setProgressMap] = useState<Map<string, ReadingProgress>>(new Map());
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [readerSettings, setReaderSettingsState] = useState<ReaderSettings>(DEFAULT_READER_SETTINGS);
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [progress, bms, favs, hist, settings, fonts] = await Promise.all([
        repo.getAllProgress(),
        repo.getAllBookmarks(),
        repo.getAllFavorites(),
        repo.getHistory(),
        repo.getSetting<ReaderSettings>('reader', DEFAULT_READER_SETTINGS),
        repo.getSetting<CustomFont[]>('customFonts', []),
      ]);
      setProgressMap(new Map(progress.map((p) => [`${p.bookId}::${p.volumeId}`, p])));
      setBookmarks(bms.sort((a, b) => b.createdAt - a.createdAt));
      setFavorites(new Set(favs.map((f) => f.bookId)));
      setHistory(hist);
      setReaderSettingsState(normalizeReaderSettings(settings));
      const fontList = Array.isArray(fonts) ? fonts : [];
      setCustomFonts(fontList);
      registerCustomFontsInDocument(fontList);
    } catch (e) {
      console.warn('خواندن داده‌های محلی ناموفق بود:', e);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addCustomFont = useCallback(async (f: Omit<CustomFont, 'id' | 'createdAt'>) => {
    const font: CustomFont = {
      ...f,
      id: `cf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
    };
    const next = [...customFonts, font].slice(-10); // سقف ۱۰ فونت
    setCustomFonts(next);
    await repo.setSetting('customFonts', next);
    registerCustomFontsInDocument([font]);
    return font;
  }, [customFonts]);

  const deleteCustomFont = useCallback(async (id: string) => {
    const next = customFonts.filter((f) => f.id !== id);
    setCustomFonts(next);
    await repo.setSetting('customFonts', next);
    // اگر فونت حذف‌شده انتخاب فعال بود، به وزیرمتن برگرد
    setReaderSettingsState((s) => {
      if (s.customFontId === id || s.fontFamily === 'custom') {
        const ns = { ...s, fontFamily: 'vazirmatn' as const, customFontId: null };
        void repo.setSetting('reader', ns);
        return ns;
      }
      return s;
    });
  }, [customFonts]);

  const saveProgress = useCallback(async (p: ReadingProgress) => {
    await repo.saveProgress(p);
    setProgressMap((m) => {
      const next = new Map(m);
      next.set(`${p.bookId}::${p.volumeId}`, p);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback(async (bookId: string) => {
    await repo.toggleFavorite(bookId);
    setFavorites((s) => {
      const next = new Set(s);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
      return next;
    });
  }, []);

  const addBookmark = useCallback(async (b: Omit<Bookmark, 'id' | 'createdAt'>) => {
    const bm = repo.newBookmark(b);
    await repo.addBookmark(bm);
    setBookmarks((list) => [bm, ...list]);
    return bm;
  }, []);

  const deleteBookmark = useCallback(async (id: string) => {
    await repo.removeBookmark(id);
    setBookmarks((list) => list.filter((b) => b.id !== id));
  }, []);

  const touchHistory = useCallback(async (bookId: string, volumeId: string) => {
    await repo.touchHistory(bookId, volumeId);
    setHistory(await repo.getHistory());
  }, []);

  const removeHistory = useCallback(async (bookId: string) => {
    await repo.removeHistoryEntry(bookId);
    setHistory(await repo.getHistory());
  }, []);

  const setReaderSettings = useCallback((s: ReaderSettings) => {
    setReaderSettingsState(s);
    void repo.setSetting('reader', s);
  }, []);

  const value = useMemo<PersonalDataCtx>(
    () => ({
      ready,
      progress: progressMap,
      bookmarks,
      favorites,
      history,
      readerSettings,
      setReaderSettings,
      customFonts,
      addCustomFont,
      deleteCustomFont,
      saveProgress,
      toggleFavorite,
      addBookmark,
      deleteBookmark,
      touchHistory,
      removeHistory,
      refresh,
    }),
    [
      ready,
      progressMap,
      bookmarks,
      favorites,
      history,
      readerSettings,
      setReaderSettings,
      customFonts,
      addCustomFont,
      deleteCustomFont,
      saveProgress,
      toggleFavorite,
      addBookmark,
      deleteBookmark,
      touchHistory,
      removeHistory,
      refresh,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePersonalData(): PersonalDataCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePersonalData باید داخل PersonalDataProvider استفاده شود');
  return ctx;
}

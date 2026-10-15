import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import ePub from 'epubjs';
import type { Book, Contents, Rendition, TocItem } from 'epubjs';
import {
  ArrowRight,
  Bookmark as BookmarkIcon,
  BookmarkPlus,
  Check,
  CheckCircle2,
  ChevronLeft,
  List,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  SkipForward,
  X,
  XCircle,
} from 'lucide-react';
import type { Bookmark, CustomFont, Novel, ReaderSettings, Volume } from '@/types';
import { loadEpub, formatBytes } from '@/services/epubLoader';
import {
  customFontFaceCss,
  effectiveDirection,
  effectivePalette,
  FONT_BASE_CSS,
  settingsOverrideCss,
  themeCss,
} from './readerSettings';
import ReaderSettingsPanel from './ReaderSettingsPanel';
import { InlineSpinner } from '@/components/StateBoxes';

interface EpubReaderProps {
  novel: Novel;
  volume: Volume;
  settings: ReaderSettings;
  onSettingsChange: (s: ReaderSettings) => void;
  initialCfi: string | null;
  initialHref: string | null;
  savedPercentage: number | null;
  bookmarks: Bookmark[];
  customFonts: CustomFont[];
  onAddCustomFont: (f: Omit<CustomFont, 'id' | 'createdAt'>) => Promise<CustomFont>;
  onDeleteCustomFont: (id: string) => Promise<void>;
  onAddBookmark: (label: string, cfi: string, href: string) => void;
  onDeleteBookmark: (id: string) => void;
  onProgress: (p: { cfi: string; href: string; chapterTitle: string; percentage: number }) => void;
  onChapterRead: (href: string) => void;
  onNextVolume: () => void;
  nextVolumeTitle: string | null;
  hasNextVolume: boolean;
  onExit: () => void;
}

type Status = 'loading' | 'rendering' | 'ready' | 'error';

interface FlatTocItem {
  title: string;
  href: string;
  depth: number;
}

function flattenToc(items: TocItem[], depth = 0): FlatTocItem[] {
  const out: FlatTocItem[] = [];
  for (const it of items ?? []) {
    const href = (it.href ?? '').split('#')[0];
    const title = it.label?.trim() || it.title?.trim() || href;
    if (href) out.push({ title, href, depth });
    if (it.subitems?.length) out.push(...flattenToc(it.subitems, depth + 1));
  }
  return out;
}

/**
 * تطبیق href فصل با فرم داخلی spine.
 * epub.js مسیرها را نسبت به پوشه OPF نگه می‌دارد (مثل text/ch1.xhtml) در حالی که
 * کاتالوگ مسیر کامل نسبت به ریشه EPUB دارد (مثل OEBPS/text/ch1.xhtml).
 */
function resolveSectionHref(book: Book, href: string): string {
  const items = book.spine?.items ?? [];
  const hit = items.find(
    (i) => i.href === href || i.href.endsWith(`/${href}`) || href.endsWith(`/${i.href}`) || href.endsWith(i.href),
  );
  return hit?.href ?? href;
}

export default function EpubReader(props: EpubReaderProps) {
  const {
    novel,
    volume,
    settings,
    onSettingsChange,
    savedPercentage,
    bookmarks,
    customFonts,
    onAddCustomFont,
    onDeleteCustomFont,
    onAddBookmark,
    onDeleteBookmark,
    onProgress,
    onChapterRead,
    onNextVolume,
    nextVolumeTitle,
    hasNextVolume,
    onExit,
  } = props;

  const shellRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const lastCfiRef = useRef<string | null>(null);
  const lastHrefRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationsStartedRef = useRef(false);
  /** نقطه شروع برای بازسازی‌های بعدی (مثل تغییر جهت/حالت نمایش) — با هر جابه‌جایی به‌روز می‌شود */
  const resumeCfiRef = useRef<string | null>(props.initialCfi);
  const resumeHrefRef = useRef<string | null>(props.initialHref);

  const [status, setStatus] = useState<Status>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [download, setDownload] = useState<{ loaded: number; total: number | null } | null>(null);
  const [percentage, setPercentage] = useState(savedPercentage ?? 0);
  const [currentChapter, setCurrentChapter] = useState('');
  const [toc, setToc] = useState<FlatTocItem[]>([]);
  const [panel, setPanel] = useState<'none' | 'toc' | 'settings' | 'bookmarks'>('none');
  const [chromeVisible, setChromeVisible] = useState(settings.showToolbar);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  /** رسیدن به انتهای فصل جاری (برای نمایش دکمه فصل/جلد بعدی) */
  const [chapterEnd, setChapterEnd] = useState(false);
  const [isLastSection, setIsLastSection] = useState(false);
  const [autoPaused, setAutoPaused] = useState(false);

  const direction = useMemo(
    () => effectiveDirection(settings, volume.language ?? novel.language),
    [settings.direction, volume.language, novel.language],
  );

  const isScrolled = settings.readingMode === 'scrolled';

  /* ---------- اعمال تنظیمات ظاهری روی rendition ----------
   * epub.js هوک inject خودش تم‌های سریال‌شده (رشته CSS) را نادیده می‌گیرد؛
   * بنابراین CSS را مستقیماً در سند هر بخش تزریق می‌کنیم. */
  const cssRef = useRef('');
  const contentsRef = useRef<Set<Contents>>(new Set());

  const injectStyleIntoDoc = useCallback((doc: Document, css: string) => {
    try {
      let style = doc.getElementById('ns-reader-style') as HTMLStyleElement | null;
      if (!style) {
        style = doc.createElement('style');
        style.id = 'ns-reader-style';
        doc.head.appendChild(style);
      }
      style.textContent = css;
    } catch {
      /* ignore */
    }
  }, []);

  const applyVisuals = useCallback(
    (s: ReaderSettings) => {
      cssRef.current =
        FONT_BASE_CSS +
        customFontFaceCss(customFonts) +
        themeCss(s) +
        settingsOverrideCss(s, customFonts);
      cssRef.current += `\nhtml { font-size: ${s.fontSize}%; }`;
      contentsRef.current.forEach((c) => injectStyleIntoDoc(c.document, cssRef.current));
    },
    [customFonts, injectStyleIntoDoc],
  );

  /* ---------- ساخت و نمایش کتاب (با تغییر حالت نمایش یا جهت از نو ساخته می‌شود) ---------- */
  useEffect(() => {
    let destroyed = false;
    let abort: AbortController | null = new AbortController();

    (async () => {
      try {
        setStatus('loading');
        setErrorMsg('');
        // آماده‌سازی CSS پیش از رندر تا content hook اولین بخش را تمیز ببیند
        applyVisuals(settings);
        const buffer = await loadEpub(volume.file, setDownload, abort.signal);
        if (destroyed) return;

        setStatus('rendering');
        // توجه: برای ArrayBuffer نباید openAs تعیین شود؛ epub.js نوع ورودی را خود تشخیص می‌دهد
        const book = ePub(buffer);
        bookRef.current = book;

        const host = hostRef.current;
        if (!host) return;
        host.innerHTML = '';

        const rendition = book.renderTo(host, {
          width: '100%',
          height: isScrolled ? 'auto' : '100%',
          flow: isScrolled ? 'scrolled-doc' : 'paginated',
          manager: 'default',
          /* نکته مهم epub.js: کانستراکتور جهت را با metadata کتاب بازنویسی می‌کند و
           * نام گزینه «defaultDirection» است؛ هر دو را پاس می‌دهیم و بعد از ساخت
           * نیز rendition.direction() را صریحاً فراخوانی می‌کنیم تا انتخاب کاربر
           * همیشه بر جهت metadata کتاب برتری داشته باشد (رفع باگ «RTL کار نمی‌کند»). */
          direction,
          defaultDirection: direction,
          allowScriptedContent: false,
          spread: 'auto',
          minSpreadWidth: 780,
        });
        rendition.direction(direction);
        renditionRef.current = rendition;

        /* --- امنیت، رفتار لینک‌ها/تصاویر و تزریق تم در محتوای کتاب --- */
        rendition.hooks.content.register((contents: Contents) => {
          const doc = contents.document;
          contentsRef.current.add(contents);
          contents.window.addEventListener('unload', () => contentsRef.current.delete(contents));
          // تزریق CSS تم (epub.js تم‌های سریال‌شده را در هوک خودش پشتیبانی نمی‌کند)
          injectStyleIntoDoc(doc, cssRef.current);
          // دفاع در عمق: حذف هر اسکریپت جاسازی‌شده (allowScriptedContent=false هم فعال است)
          doc.querySelectorAll('script').forEach((n) => n.remove());
          // جلوگیری از ارسال فرم‌های کتاب
          doc.addEventListener(
            'submit',
            (e) => {
              e.preventDefault();
              e.stopPropagation();
            },
            true,
          );
          // مدیریت لینک‌ها: داخلی → پرش، خارجی → تب جدید ایمن
          doc.addEventListener(
            'click',
            (ev) => {
              const target = ev.target as HTMLElement | null;
              if (!target) return;

              // بزرگ‌نمایی تصاویر
              const img = target.closest('img') as HTMLImageElement | null;
              if (img && img.src) {
                setLightbox(img.src);
                return;
              }

              const anchor = target.closest('a') as HTMLAnchorElement | null;
              if (!anchor || !anchor.getAttribute('href')) return;
              ev.preventDefault();
              ev.stopPropagation();
              const raw = anchor.getAttribute('href') ?? '';
              if (/^https?:\/\//i.test(raw)) {
                window.open(raw, '_blank', 'noopener,noreferrer');
                return;
              }
              if (raw.startsWith('#')) {
                // لینک داخلی همان فصل
                const currentHref = lastHrefRef.current;
                if (currentHref) void rendition.display(`${currentHref}${raw}`).catch(() => {});
                return;
              }
              if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return; // schemeهای دیگر نادیده
              void rendition.display(resolveSectionHref(bookRef.current as Book, raw)).catch(() => {});
            },
            true,
          );
        });

        /* --- ردیابی پیشرفت و تشخیص انتهای فصل --- */
        rendition.on('relocated', (locationArg: unknown) => {
          const loc = locationArg as {
            start?: {
              href?: string;
              index?: number;
              percentage?: number;
              cfi?: string;
              displayed?: { page?: number; total?: number };
            };
            end?: { displayed?: { page?: number; total?: number }; index?: number };
            at?: string;
            cfi?: string;
            atEnd?: boolean;
          };
          const cfi: string | undefined = loc?.start?.cfi ?? loc?.at ?? loc?.cfi ?? lastCfiRef.current ?? undefined;
          const href = loc?.start?.href ?? null;
          const total = Math.max(1, volume.spineCount);

          // درصد: مکان‌های تولیدشده (دقیق) > جایگاه فصل در spine > مقدار خود رویداد
          let pct: number | undefined;
          if (bookRef.current && cfi && bookRef.current.locations.total > 0) {
            const viaLocations = bookRef.current.locations.percentageFromCfi(cfi);
            if (typeof viaLocations === 'number' && !Number.isNaN(viaLocations)) pct = viaLocations;
          }
          if ((pct === undefined || Number.isNaN(pct)) && bookRef.current && href) {
            const items = bookRef.current.spine.items ?? [];
            const idx = items.findIndex((i) => i.href === href || href.endsWith(i.href));
            pct = idx >= 0 ? Math.min(0.999, Math.max(0, (idx + 0.5) / Math.max(1, items.length || total))) : undefined;
          }
          if (pct === undefined || Number.isNaN(pct)) {
            const fromEvent = loc?.start?.percentage;
            pct = typeof fromEvent === 'number' && !Number.isNaN(fromEvent) ? fromEvent : 0;
          }

          if (cfi) lastCfiRef.current = cfi;
          if (href) lastHrefRef.current = href;
          if (cfi) resumeCfiRef.current = cfi;
          if (href) resumeHrefRef.current = href;

          setPercentage(pct);

          /* --- تشخیص انتهای فصل (حالت صفحه‌بندی‌شده) ---
           * displayed.page === displayed.total یعنی آخرین صفحه فصل جاری */
          const disp = loc?.end?.displayed ?? loc?.start?.displayed;
          const page = disp?.page ?? 0;
          const pageTotal = disp?.total ?? 0;
          const atSectionEnd = pageTotal > 0 && page >= pageTotal;
          const spineItems = bookRef.current?.spine.items ?? [];
          const startIndex = loc?.start?.index ?? -1;
          const last = spineItems.length > 0 && startIndex >= spineItems.length - 1;
          if (isScrolled) {
            // در حالت پیمایشی، اسکرول به ته ظرف تشخیص داده می‌شود (listener جداگانه)
            setIsLastSection(last);
          } else {
            setChapterEnd(Boolean(atSectionEnd) || Boolean(loc?.atEnd));
            setIsLastSection(last);
          }

          // عنوان فصل جاری از TOC خود کتاب یا کاتالوگ
          if (href) {
            const match =
              tocRef.current.find((t) => href.endsWith(t.href) || t.href.endsWith(href)) ??
              volumeRef.current.chapters.find((c) => href.endsWith(c.href));
            const chapterTitle = match?.title ?? '';
            setCurrentChapter(chapterTitle);
            if (cfi && href && lastReadHrefRef.current !== href) {
              lastReadHrefRef.current = href;
              onChapterRead(href);
            }
            if (cfi && href) {
              scheduleSave(cfi, href, chapterTitle, pct);
            }
          }
          setIsBookmarked(Boolean(cfi && bookmarksRef.current.some((b) => b.cfi === cfi)));
        });

        setToc([]);
        try {
          const nav = (await book.loaded.navigation) as { toc: TocItem[] };
          if (!destroyed) setToc(flattenToc(nav?.toc ?? []));
        } catch {
          setToc(volumeRef.current.chapters.map((c) => ({ title: c.title, href: c.href, depth: 0 })));
        }

        /* --- نقطه شروع: آخرین CFI (پس از بازسازی) > CFI ذخیره‌شده > فصل درخواستی > ابتدای جلد --- */
        const startTarget = resumeCfiRef.current
          ? resumeCfiRef.current
          : resumeHrefRef.current
            ? resolveSectionHref(book, resumeHrefRef.current)
            : undefined;
        const withTimeout = <T,>(p: Promise<T>, ms: number, msg: string): Promise<T> =>
          Promise.race([
            p,
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
          ]);
        await withTimeout(rendition.display(startTarget), 45_000, 'آماده‌سازی کتاب بیش از حد طول کشید.')
          .catch(() => rendition.display())
          .catch(() => {
            throw new Error('نمایش کتاب ناموفق بود؛ فایل EPUB ممکن است ناسازگار باشد.');
          });

        if (destroyed) return;
        setStatus('ready');

        /* --- تولید مکان‌ها در پس‌زمینه برای درصد دقیق (فقط کتاب‌های متوسط) --- */
        if (!locationsStartedRef.current && volume.spineCount <= 220) {
          locationsStartedRef.current = true;
          setTimeout(() => {
            bookRef.current?.locations
              .generate(1100)
              .then(() => {})
              .catch(() => {});
          }, 1400);
        }
      } catch (e) {
        if (destroyed) return;
        console.error('خطای بازکردن EPUB:', e);
        setErrorMsg(e instanceof Error ? e.message : 'خطای نامشخص');
        setStatus('error');
      }
    })();

    return () => {
      destroyed = true;
      abort?.abort();
      abort = null;
      flushSave();
      contentsRef.current.clear();
      const rendition = renditionRef.current;
      renditionRef.current = null;
      try {
        rendition?.destroy();
      } catch {
        /* ignore */
      }
      const book = bookRef.current;
      bookRef.current = null;
      try {
        book?.destroy();
      } catch {
        /* ignore */
      }
    };
    // توجه: تغییر readingMode و direction باعث بازسازی کامل می‌شود (سازگاری بر ظاهر ترجیح داده شده)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume.file, settings.readingMode, direction]);

  /* ---------- باز اعمال تنظیمات ظاهری بدون بازسازی ---------- */
  useEffect(() => {
    applyVisuals(settings);
  }, [settings, applyVisuals]);

  useEffect(() => {
    setChromeVisible(settings.showToolbar);
  }, [settings.showToolbar]);

  /* ---------- ذخیره پیشرفت (debounce + flush) ---------- */
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const tocRef = useRef<FlatTocItem[]>([]);
  tocRef.current = toc;
  const bookmarksRef = useRef<Bookmark[]>([]);
  bookmarksRef.current = bookmarks;
  const lastReadHrefRef = useRef<string | null>(null);
  const pendingRef = useRef<{ cfi: string; href: string; chapterTitle: string; percentage: number } | null>(null);

  const scheduleSave = useCallback(
    (cfi: string, href: string, chapterTitle: string, pct: number) => {
      pendingRef.current = { cfi, href, chapterTitle, percentage: pct };
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => flushSave(), 800);
    },
    [],
  );

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const p = pendingRef.current;
    if (p) {
      onProgress(p);
      pendingRef.current = null;
    }
  }, [onProgress]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushSave();
    };
    const onBeforeUnload = () => flushSave();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [flushSave]);

  /* ---------- ناوبری ---------- */
  const goNext = useCallback(() => {
    void renditionRef.current?.next().catch(() => {});
  }, []);
  const goPrev = useCallback(() => {
    void renditionRef.current?.prev().catch(() => {});
  }, []);

  const jumpTo = useCallback(async (target: string) => {
    const r = renditionRef.current;
    const book = bookRef.current;
    if (!r) return;
    setPanel('none');
    const resolved = target.startsWith('epubcfi') || !book ? target : resolveSectionHref(book, target);
    await r.display(resolved).catch(() => {});
  }, []);

  const seekPercentage = useCallback((pct: number) => {
    const book = bookRef.current;
    const r = renditionRef.current;
    if (!book || !r) return;
    try {
      const cfi = book.locations.total > 0 ? book.locations.cfiFromPercentage(pct) : null;
      if (cfi) {
        void r.display(cfi).catch(() => {});
        return;
      }
      const items = book.spine.items;
      const idx = Math.min(items.length - 1, Math.max(0, Math.round(pct * (items.length - 1))));
      const href = items[idx]?.href;
      if (href) void r.display(href).catch(() => {});
    } catch {
      /* ignore */
    }
  }, []);

  /* ---------- دکمه فصل/جلد بعدی در انتهای فصل ---------- */
  const handleNextChapter = useCallback(() => {
    setPanel('none');
    if (isLastSection) {
      flushSave();
      onNextVolume();
    } else {
      goNext();
    }
  }, [isLastSection, flushSave, onNextVolume, goNext]);

  /* ---------- تشخیص انتهای فصل در حالت پیمایشی (اسکرول به ته) ---------- */
  useEffect(() => {
    if (!isScrolled || status !== 'ready') return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 72;
      setChapterEnd(atBottom);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [isScrolled, status, currentChapter]);

  /* ---------- اسکرول خودکار ---------- */
  const autoPausedRef = useRef(false);
  autoPausedRef.current = autoPaused;
  const lastInteractionRef = useRef(0);

  useEffect(() => {
    if (!settings.autoScroll || status !== 'ready') return;

    // حالت پیمایشی: پیمایش نرم پیکسلی
    if (isScrolled) {
      let raf = 0;
      let last = performance.now();
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick);
        const el = scrollContainerRef.current;
        if (!el) return;
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        // توقف موقت هنگام تعامل کاربر یا باز بودن پنل یا توقف دستی
        const idle = now - lastInteractionRef.current > 3500;
        if (autoPausedRef.current || panel !== 'none' || !idle) return;
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
        if (atBottom) return;
        el.scrollTop += settings.autoScrollSpeed * dt;
      };
      raf = requestAnimationFrame(tick);

      const markInteraction = () => {
        lastInteractionRef.current = performance.now();
      };
      const el = scrollContainerRef.current;
      el?.addEventListener('touchstart', markInteraction, { passive: true });
      el?.addEventListener('wheel', markInteraction, { passive: true });
      el?.addEventListener('pointerdown', markInteraction);
      return () => {
        cancelAnimationFrame(raf);
        el?.removeEventListener('touchstart', markInteraction);
        el?.removeEventListener('wheel', markInteraction);
        el?.removeEventListener('pointerdown', markInteraction);
      };
    }

    // حالت صفحه‌بندی‌شده: ورق‌زدن خودکار
    const intervalMs = Math.max(4000, 150_000 / Math.max(1, settings.autoScrollSpeed));
    const timer = setInterval(() => {
      if (autoPausedRef.current || panel !== 'none') return;
      const now = performance.now();
      if (now - lastInteractionRef.current < 6000) return;
      goNext();
    }, intervalMs);
    const markInteraction = () => {
      lastInteractionRef.current = performance.now();
    };
    window.addEventListener('touchstart', markInteraction, { passive: true });
    window.addEventListener('wheel', markInteraction, { passive: true });
    return () => {
      clearInterval(timer);
      window.removeEventListener('touchstart', markInteraction);
      window.removeEventListener('wheel', markInteraction);
    };
  }, [settings.autoScroll, settings.autoScrollSpeed, isScrolled, status, panel, goNext]);

  /* ---------- کلیدهای میان‌بر ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          direction === 'rtl' ? goNext() : goPrev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          direction === 'rtl' ? goPrev() : goNext();
          break;
        case ' ':
          if (settings.readingMode === 'paginated') {
            e.preventDefault();
            goNext();
          }
          break;
        case 't':
        case 'T':
          setPanel((p) => (p === 'toc' ? 'none' : 'toc'));
          break;
        case 's':
        case 'S':
          setPanel((p) => (p === 'settings' ? 'none' : 'settings'));
          break;
        case 'm':
        case 'M':
          setPanel((p) => (p === 'bookmarks' ? 'none' : 'bookmarks'));
          break;
        case 'b':
        case 'B':
          void handleAddBookmark();
          break;
        case 'f':
        case 'F':
          void toggleFullscreen();
          break;
        case 'h':
        case 'H':
          setChromeVisible((v) => !v);
          break;
        case 'Escape':
          if (lightbox) setLightbox(null);
          else if (panel !== 'none') setPanel('none');
          else onExit();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction, settings.readingMode, panel, lightbox, goNext, goPrev]);

  /* ---------- تمام‌صفحه ---------- */
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await shellRef.current?.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      /* پشتیبانی نمی‌شود */
    }
  }, []);

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  /* ---------- نشانک ---------- */
  const handleAddBookmark = useCallback(async () => {
    const cfi = lastCfiRef.current;
    if (!cfi) return;
    const label = currentChapter || `نشانک در ${Math.round(percentage * 100)}٪`;
    onAddBookmark(label, cfi, lastHrefRef.current ?? '');
  }, [currentChapter, percentage, onAddBookmark]);

  /* ---------- لمس و کشیدن (فقط حالت صفحه‌بندی‌شده) ---------- */
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || settings.readingMode !== 'paginated') return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
    const movedLeft = dx < 0;
    if (movedLeft) direction === 'rtl' ? goPrev() : goNext();
    else direction === 'rtl' ? goNext() : goPrev();
  };

  /* ---------- رندر ---------- */
  const percentLabel = `${Math.round(percentage * 100)}٪`;
  const pal = useMemo(() => effectivePalette(settings), [settings.theme, settings.textColor, settings.bgColor, settings.bgImageOpacity]);

  const shellVars = {
    '--reader-bg': pal.bg,
    '--reader-chrome': pal.chrome,
    '--reader-fg': pal.fg,
    '--reader-muted': pal.muted,
    '--reader-border': pal.border,
    ...(settings.bgImageUrl
      ? {
          backgroundImage: `url(${settings.bgImageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }
      : {}),
  } as React.CSSProperties;

  return (
    <div className={`reader-shell theme-${settings.theme}`} style={shellVars} ref={shellRef} dir="rtl">
      {/* نوار بالایی */}
      {chromeVisible && (
        <div className="reader-toolbar">
          <button type="button" className="tbtn" onClick={onExit} aria-label="بازگشت به صفحه کتاب" title="بازگشت">
            <ArrowRight size={19} />
          </button>
          <span className="title" title={novel.titleFa ?? novel.titleOriginal ?? novel.id}>
            {novel.titleFa ?? novel.titleOriginal ?? novel.id}
          </span>
          <span className="chapter">{currentChapter || volume.title}</span>
          <div className="spacer" />
          <button type="button" className="tbtn" onClick={() => setPanel((p) => (p === 'toc' ? 'none' : 'toc'))} aria-label="فهرست مطالب" title="فهرست مطالب (T)">
            <List size={19} />
          </button>
          <button
            type="button"
            className={`tbtn ${isBookmarked ? 'active-bookmark' : ''}`}
            onClick={() => void handleAddBookmark()}
            aria-label="افزودن نشانک"
            title="افزودن نشانک (B)"
          >
            {isBookmarked ? <Check size={19} /> : <BookmarkPlus size={19} />}
          </button>
          <button type="button" className="tbtn" onClick={() => setPanel((p) => (p === 'bookmarks' ? 'none' : 'bookmarks'))} aria-label="نشانک‌ها" title="نشانک‌ها (M)">
            <BookmarkIcon size={19} />
          </button>
          <button type="button" className="tbtn" onClick={() => setPanel((p) => (p === 'settings' ? 'none' : 'settings'))} aria-label="تنظیمات نمایش" title="تنظیمات (S)">
            <Settings2 size={19} />
          </button>
          <button type="button" className="tbtn" onClick={() => void toggleFullscreen()} aria-label="تمام‌صفحه" title="تمام‌صفحه (F)">
            {isFullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
          </button>
        </div>
      )}

      {/* نوار پیشرفت */}
      {chromeVisible && (
        <div className="reader-progressbar" aria-hidden="true">
          <div className="fill" style={{ width: `${percentage * 100}%` }} />
        </div>
      )}

      {/* بدنه کتاب */}
      <div className="reader-body" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div
          ref={scrollContainerRef}
          className={`reader-container ${isScrolled ? 'scrolled' : ''}`}
          style={isScrolled ? { paddingBlock: '1rem' } : undefined}
        >
          <div
            ref={hostRef}
            className="rendition-host"
            style={isScrolled ? { width: '100%' } : { height: '100%', width: '100%' }}
          />
        </div>

        {/* نواحی لمسی — فقط حالت صفحه‌بندی‌شده */}
        {/* منطق فیزیکی کتاب: جهت خواندن به سمت inline-end است؛
            بنابراین لبه inline-end = بعدی، لبه inline-start = قبلی */}
        {settings.readingMode === 'paginated' && status === 'ready' && (
          <>
            <button
              type="button"
              className="tap-zone start"
              aria-label="قبلی"
              onClick={goPrev}
            />
            <button
              type="button"
              className="tap-zone end"
              aria-label="بعدی"
              onClick={goNext}
            />
          </>
        )}

        {/* حالت‌های بارگذاری/خطا */}
        {(status === 'loading' || status === 'rendering') && (
          <div className="reader-load">
            <div className="inner">
              <InlineSpinner size={30} />
              <strong>{status === 'loading' ? 'در حال دریافت کتاب…' : 'در حال آماده‌سازی صفحه…'}</strong>
              {status === 'loading' && download && (
                <span style={{ color: 'var(--reader-muted)', fontSize: '0.85rem' }}>
                  {formatBytes(download.loaded)}
                  {download.total ? ` از ${formatBytes(download.total)}` : ''}
                </span>
              )}
              <span style={{ color: 'var(--reader-muted)', fontSize: '0.8rem' }}>{volume.title}</span>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="reader-load">
            <div className="inner">
              <div style={{ fontSize: '2.2rem' }}>📖</div>
              <strong>بازکردن کتاب ناموفق بود</strong>
              <p style={{ color: 'var(--reader-muted)', fontSize: '0.9rem', margin: 0 }}>
                {errorMsg || 'فایل EPUB قابل خواندن نیست.'}
                <br />
                اگر فایل دارای DRM یا رمزگذاری ناسازگار است، در مرورگر پشتیبانی نمی‌شود. اتصال اینترنت را بررسی کنید و
                دوباره تلاش کنید.
              </p>
              <div className="reader-error-actions">
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => window.location.reload()}
                >
                  <RotateCcw size={15} /> تلاش مجدد
                </button>
                <button type="button" className="btn" onClick={onExit}>
                  بازگشت به کتاب
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* دکمه فصل/جلد بعدی — در هر دو حالت پنهان/نمایانِ کنترل‌ها دیده می‌شود */}
      {status === 'ready' && chapterEnd && panel === 'none' && (
        <button type="button" className={`next-chapter-btn ${chromeVisible ? 'with-chrome' : ''}`} onClick={handleNextChapter}>
          {isLastSection ? (
            hasNextVolume ? (
              <>
                <SkipForward size={16} /> جلد بعدی: {nextVolumeTitle}
              </>
            ) : (
              <>
                <CheckCircle2 size={16} /> پایان این جلد — بازگشت به کتاب
              </>
            )
          ) : (
            <>
              <SkipForward size={16} /> فصل بعدی
            </>
          )}
        </button>
      )}

      {/* نشانگر اسکرول خودکار */}
      {status === 'ready' && settings.autoScroll && isScrolled && (
        <div
          className={`autoscroll-pill ${chromeVisible ? 'with-chrome' : ''} ${chapterEnd ? 'stacked' : ''}`}
        >
          <button
            type="button"
            className="pill-btn"
            onClick={() => setAutoPaused((p) => !p)}
            aria-label={autoPaused ? 'ادامه اسکرول خودکار' : 'توقف موقت اسکرول خودکار'}
          >
            {autoPaused ? <Play size={14} /> : <Pause size={14} />}
            <span>{autoPaused ? 'ادامه' : 'توقف'}</span>
          </button>
          <button
            type="button"
            className="pill-btn stop"
            onClick={() => onSettingsChange({ ...settings, autoScroll: false })}
            aria-label="خاموش‌کردن اسکرول خودکار"
          >
            <XCircle size={14} />
          </button>
        </div>
      )}

      {/* نوار وضعیت و پرش */}
      {chromeVisible && (
        <div className="reader-statusbar">
          {/* بر اساس درخواست کاربر: فلش راست‌نما = بعدی، فلش چپ‌نما = قبلی */}
          <button type="button" className="tbtn" onClick={goNext} aria-label="بعدی" title="بعدی">
            <ChevronLeft size={20} style={{ transform: 'scaleX(-1)' }} />
          </button>
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(percentage * 1000)}
            aria-label="پرش در کتاب"
            onChange={(e) => {
              const pct = Number(e.target.value) / 1000;
              setPercentage(pct);
              seekPercentage(pct);
            }}
          />
          <span className="pct">{percentLabel}</span>
          <button type="button" className="tbtn" onClick={goPrev} aria-label="قبلی" title="قبلی">
            <ChevronLeft size={20} />
          </button>
        </div>
      )}

      {/* راهنمای مخفی‌کردن کنترل‌ها */}
      {status === 'ready' && !chromeVisible && !chapterEnd && (
        <button type="button" className="reader-hint" onClick={() => setChromeVisible(true)}>
          نمایش کنترل‌ها (H)
        </button>
      )}

      {/* ---------- پنل فهرست مطالب ---------- */}
      {panel === 'toc' && (
        <aside className="reader-panel" aria-label="فهرست مطالب">
          <h3>
            <List size={17} /> فهرست مطالب
            <button type="button" className="tbtn panel-close" onClick={() => setPanel('none')} aria-label="بستن">
              <X size={18} />
            </button>
          </h3>
          <div className="panel-content">
            {toc.length === 0 && <p style={{ color: 'var(--reader-muted)', fontSize: '0.85rem', padding: '0 0.5rem' }}>فهرست مطالبی برای این جلد در دسترس نیست.</p>}
            {toc.map((item, i) => (
              <div
                key={`${item.href}-${i}`}
                className={`toc-item ${(currentChapter && currentChapter === item.title) ? 'current' : ''}`}
                style={{ paddingInlineStart: `${0.7 + item.depth * 0.9}rem` }}
                onClick={() => void jumpTo(item.href)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && void jumpTo(item.href)}
              >
                <span className="idx">{i + 1}</span>
                {item.title}
              </div>
            ))}
          </div>
        </aside>
      )}

      {/* ---------- پنل نشانک‌ها ---------- */}
      {panel === 'bookmarks' && (
        <aside className="reader-panel" aria-label="نشانک‌ها">
          <h3>
            <BookmarkIcon size={17} /> نشانک‌های این جلد
            <button type="button" className="tbtn panel-close" onClick={() => setPanel('none')} aria-label="بستن">
              <X size={18} />
            </button>
          </h3>
          <div className="panel-content">
            <button
              type="button"
              className="btn primary block"
              style={{ marginBottom: '0.8rem' }}
              onClick={() => void handleAddBookmark()}
            >
              <BookmarkPlus size={15} /> نشانک در محل فعلی
            </button>
            {bookmarks.length === 0 && (
              <p style={{ color: 'var(--reader-muted)', fontSize: '0.85rem', padding: '0 0.5rem' }}>
                هنوز نشانکی ندارید. با کلید B یا دکمه بالا، محل فعلی را ذخیره کنید.
              </p>
            )}
            {bookmarks.map((b) => (
              <div key={b.id} className="bookmark-item">
                <div className="bi-label" onClick={() => void jumpTo(b.cfi)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && void jumpTo(b.cfi)}>
                  <div className="l">{b.label}</div>
                  <div className="d">{new Date(b.createdAt).toLocaleString('fa-IR')}</div>
                </div>
                <button type="button" className="del" aria-label="حذف نشانک" onClick={() => onDeleteBookmark(b.id)}>
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        </aside>
      )}

      {/* ---------- پنل تنظیمات (بازطراحی کامل) ---------- */}
      {panel === 'settings' && (
        <aside className="reader-panel wide" aria-label="تنظیمات نمایش">
          <h3>
            <Settings2 size={17} /> تنظیمات نمایش
            <button type="button" className="tbtn panel-close" onClick={() => setPanel('none')} aria-label="بستن">
              <X size={18} />
            </button>
          </h3>
          <div className="panel-content">
            <ReaderSettingsPanel
              settings={settings}
              onSettingsChange={onSettingsChange}
              customFonts={customFonts}
              onAddCustomFont={onAddCustomFont}
              onDeleteCustomFont={onDeleteCustomFont}
              isScrolled={isScrolled}
              onReset={() => {
                onSettingsChange({
                  ...settings,
                  theme: 'dark',
                  fontSize: 100,
                  lineHeight: 1.8,
                  paragraphSpacing: 0.8,
                  wordSpacing: 0,
                  fontFamily: 'vazirmatn',
                  customFontId: null,
                  maxWidth: 42,
                  pageMargin: 24,
                  textAlign: 'justify',
                  direction: 'rtl',
                  readingMode: 'scrolled',
                  textColor: null,
                  bgColor: null,
                  bgImageUrl: null,
                  bgImageOpacity: 0.35,
                  autoScroll: false,
                  autoScrollSpeed: 40,
                });
                setPanel('none');
              }}
            />
          </div>
        </aside>
      )}

      {/* ---------- بزرگ‌نمایی تصویر ---------- */}
      {lightbox && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(5, 6, 8, 0.92)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 90,
            padding: '1.5rem',
            cursor: 'zoom-out',
          }}
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-label="نمایش تصویر در اندازه کامل"
        >
          <img
            src={lightbox}
            alt=""
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }}
          />
          <button
            type="button"
            className="tbtn"
            style={{ position: 'fixed', top: 12, insetInlineEnd: 12, color: '#fff' }}
            aria-label="بستن تصویر"
            onClick={() => setLightbox(null)}
          >
            <X size={22} />
          </button>
        </div>
      )}
    </div>
  );
}

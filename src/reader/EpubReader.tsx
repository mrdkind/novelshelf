import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import ePub from 'epubjs';
import type { Book, Contents, Rendition, TocItem } from 'epubjs';
import {
  ArrowRight,
  Bookmark as BookmarkIcon,
  BookmarkPlus,
  Check,
  List,
  Maximize,
  Minimize,
  RotateCcw,
  Settings2,
  X,
} from 'lucide-react';
import type { Bookmark, Novel, ReaderSettings, Volume } from '@/types';
import { loadEpub, formatBytes } from '@/services/epubLoader';
import {
  effectiveDirection,
  settingsOverrideCss,
  themeCss,
  FONT_BASE_CSS,
} from './readerSettings';
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
  onAddBookmark: (label: string, cfi: string, href: string) => void;
  onDeleteBookmark: (id: string) => void;
  onProgress: (p: { cfi: string; href: string; chapterTitle: string; percentage: number }) => void;
  onChapterRead: (href: string) => void;
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
    onAddBookmark,
    onDeleteBookmark,
    onProgress,
    onChapterRead,
    onExit,
  } = props;

  const shellRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const lastCfiRef = useRef<string | null>(null);
  const lastHrefRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationsStartedRef = useRef(false);
  /** نقطه شروع برای بازسازی‌های بعدی (مثل تغییر حالت نمایش) — با هر جابه‌جایی به‌روز می‌شود */
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

  const direction = useMemo(
    () => effectiveDirection(settings, volume.language ?? novel.language),
    [settings.direction, volume.language, novel.language],
  );

  /* ---------- اعمال تنظیمات ظاهری روی rendition ----------
   * epub.js هوک inject خودش تم‌های سریال‌شده (رشته CSS) را نادیده می‌گیرد؛
   * بنابراین CSS را مستقیماً در سند هر بخش تزریق می‌کنیم. */
  const themeCounterRef = useRef(0);
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
      themeCounterRef.current += 1;
      cssRef.current = FONT_BASE_CSS + themeCss(s.theme) + settingsOverrideCss(s);
      cssRef.current += `\nhtml { font-size: ${s.fontSize}%; }`;
      contentsRef.current.forEach((c) => injectStyleIntoDoc(c.document, cssRef.current));
    },
    [injectStyleIntoDoc],
  );

  /* ---------- ساخت و نمایش کتاب (با تغییر حالت نمایش از نو ساخته می‌شود) ---------- */
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

        const isScrolled = settings.readingMode === 'scrolled';
        const rendition = book.renderTo(host, {
          width: '100%',
          height: isScrolled ? 'auto' : '100%',
          flow: isScrolled ? 'scrolled-doc' : 'paginated',
          manager: 'default',
          direction,
          allowScriptedContent: false,
          spread: 'auto',
          minSpreadWidth: 780,
        });
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

        /* --- ردیابی پیشرفت --- */
        rendition.on('relocated', (locationArg: unknown) => {
          const loc = locationArg as {
            start?: { href?: string; index?: number; percentage?: number; cfi?: string };
            at?: string;
            cfi?: string;
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
            book.locations
              .generate(1100)
              .then(() => {
                // پس از آماده‌شدن مکان‌ها، درصد بعدی جابه‌جایی دقیق می‌شود
              })
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
    // توجه: تغییر readingMode باعث بازسازی کامل می‌شود (سازگاری بر ظاهر ترجیح داده شده)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume.file, settings.readingMode]);

  /* ---------- باز اعمال تنظیمات ظاهری بدون بازسازی ---------- */
  useEffect(() => {
    applyVisuals(settings);
  }, [settings.theme, settings.fontSize, settings.lineHeight, settings.paragraphSpacing, settings.fontFamily, settings.textAlign, settings.pageMargin, settings.readingMode, applyVisuals, settings]);

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

  /* ---------- لمس و کشیدن ---------- */
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

  return (
    <div className={`reader-shell theme-${settings.theme}`} ref={shellRef} dir="rtl">
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
      <div className={`reader-body ${settings.readingMode === 'scrolled' ? '' : ''}`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div
          className={`reader-container ${settings.readingMode === 'scrolled' ? 'scrolled' : ''}`}
          style={settings.readingMode === 'scrolled' ? { paddingBlock: '1rem' } : undefined}
        >
          <div
            ref={hostRef}
            className="rendition-host"
            style={settings.readingMode === 'scrolled' ? { width: '100%' } : { height: '100%', width: '100%' }}
          />
        </div>

        {/* نواحی لمسی — فقط حالت صفحه‌بندی‌شده */}
        {settings.readingMode === 'paginated' && status === 'ready' && (
          <>
            <button
              type="button"
              className="tap-zone left"
              aria-label={direction === 'rtl' ? 'بعدی' : 'قبلی'}
              onClick={() => (direction === 'rtl' ? goNext() : goPrev())}
            />
            <button
              type="button"
              className="tap-zone right"
              aria-label={direction === 'rtl' ? 'قبلی' : 'بعدی'}
              onClick={() => (direction === 'rtl' ? goPrev() : goNext())}
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

      {/* نوار وضعیت و پرش */}
      {chromeVisible && (
        <div className="reader-statusbar">
          <button type="button" className="tbtn" onClick={goPrev} aria-label="قبلی" title="قبلی">
            <ArrowRight size={18} style={{ transform: direction === 'rtl' ? 'none' : 'scaleX(-1)' }} />
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
          <button type="button" className="tbtn" onClick={goNext} aria-label="بعدی" title="بعدی">
            <ArrowRight size={18} style={{ transform: direction === 'rtl' ? 'scaleX(-1)' : 'none' }} />
          </button>
        </div>
      )}

      {/* راهنمای مخفی‌کردن کنترل‌ها */}
      {status === 'ready' && !chromeVisible && (
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

      {/* ---------- پنل تنظیمات ---------- */}
      {panel === 'settings' && (
        <aside className="reader-panel" aria-label="تنظیمات نمایش">
          <h3>
            <Settings2 size={17} /> تنظیمات نمایش
            <button type="button" className="tbtn panel-close" onClick={() => setPanel('none')} aria-label="بستن">
              <X size={18} />
            </button>
          </h3>
          <div className="panel-content">
            <div className="setting-group">
              <div className="glabel">تم مطالعه</div>
              <div className="seg-group">
                {(['dark', 'light', 'sepia'] as const).map((t) => (
                  <button key={t} type="button" className={`seg-btn ${settings.theme === t ? 'on' : ''}`} onClick={() => onSettingsChange({ ...settings, theme: t })}>
                    {t === 'dark' ? 'تاریک' : t === 'light' ? 'روشن' : 'سپیا'}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-group">
              <div className="glabel">حالت نمایش</div>
              <div className="seg-group">
                <button type="button" className={`seg-btn ${settings.readingMode === 'paginated' ? 'on' : ''}`} onClick={() => onSettingsChange({ ...settings, readingMode: 'paginated' })}>
                  صفحه‌بندی‌شده
                </button>
                <button type="button" className={`seg-btn ${settings.readingMode === 'scrolled' ? 'on' : ''}`} onClick={() => onSettingsChange({ ...settings, readingMode: 'scrolled' })}>
                  پیمایشی
                </button>
              </div>
            </div>

            <div className="setting-group">
              <div className="glabel">اندازه فونت ({settings.fontSize}٪)</div>
              <input
                type="range"
                className="setting-slider"
                min={70}
                max={220}
                step={5}
                value={settings.fontSize}
                onChange={(e) => onSettingsChange({ ...settings, fontSize: Number(e.target.value) })}
                aria-label="اندازه فونت"
              />
            </div>

            <div className="setting-group">
              <div className="glabel">فاصله خطوط ({settings.lineHeight.toFixed(1)})</div>
              <input
                type="range"
                className="setting-slider"
                min={1.3}
                max={2.6}
                step={0.1}
                value={settings.lineHeight}
                onChange={(e) => onSettingsChange({ ...settings, lineHeight: Number(e.target.value) })}
                aria-label="فاصله خطوط"
              />
            </div>

            <div className="setting-group">
              <div className="glabel">فاصله پاراگراف‌ها ({settings.paragraphSpacing.toFixed(1)}em)</div>
              <input
                type="range"
                className="setting-slider"
                min={0}
                max={2}
                step={0.1}
                value={settings.paragraphSpacing}
                onChange={(e) => onSettingsChange({ ...settings, paragraphSpacing: Number(e.target.value) })}
                aria-label="فاصله پاراگراف‌ها"
              />
            </div>

            <div className="setting-group">
              <div className="glabel">عرض ستون متن {settings.readingMode === 'paginated' ? '(در حالت پیمایشی اعمال می‌شود)' : `(${settings.maxWidth}rem)`}</div>
              <input
                type="range"
                className="setting-slider"
                min={28}
                max={70}
                step={2}
                value={settings.maxWidth}
                onChange={(e) => onSettingsChange({ ...settings, maxWidth: Number(e.target.value) })}
                aria-label="عرض ستون متن"
              />
            </div>

            <div className="setting-group">
              <div className="glabel">حاشیه صفحه {settings.readingMode === 'paginated' ? '(در حالت پیمایشی اعمال می‌شود)' : `(${settings.pageMargin}px)`}</div>
              <input
                type="range"
                className="setting-slider"
                min={0}
                max={72}
                step={4}
                value={settings.pageMargin}
                onChange={(e) => onSettingsChange({ ...settings, pageMargin: Number(e.target.value) })}
                aria-label="حاشیه صفحه"
              />
            </div>

            <div className="setting-group">
              <div className="glabel">جهت متن</div>
              <div className="seg-group">
                <button type="button" className={`seg-btn ${settings.direction === 'auto' ? 'on' : ''}`} onClick={() => onSettingsChange({ ...settings, direction: 'auto' })}>
                  خودکار
                </button>
                <button type="button" className={`seg-btn ${settings.direction === 'rtl' ? 'on' : ''}`} onClick={() => onSettingsChange({ ...settings, direction: 'rtl' })}>
                  راست‌به‌چپ
                </button>
                <button type="button" className={`seg-btn ${settings.direction === 'ltr' ? 'on' : ''}`} onClick={() => onSettingsChange({ ...settings, direction: 'ltr' })}>
                  چپ‌به‌راست
                </button>
              </div>
            </div>

            <div className="setting-group">
              <div className="glabel">ترازبندی متن</div>
              <div className="seg-group">
                {(['justify', 'start', 'center'] as const).map((a) => (
                  <button key={a} type="button" className={`seg-btn ${settings.textAlign === a ? 'on' : ''}`} onClick={() => onSettingsChange({ ...settings, textAlign: a })}>
                    {a === 'justify' ? 'هم‌تراز' : a === 'start' ? 'ابتدای سطر' : 'وسط'}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-group">
              <div className="glabel">فونت</div>
              <div className="seg-group">
                <button type="button" className={`seg-btn ${settings.fontFamily === 'default' ? 'on' : ''}`} onClick={() => onSettingsChange({ ...settings, fontFamily: 'default' })}>
                  فونت کتاب
                </button>
                <button type="button" className={`seg-btn ${settings.fontFamily === 'vazirmatn' ? 'on' : ''}`} onClick={() => onSettingsChange({ ...settings, fontFamily: 'vazirmatn' })}>
                  وزیرمتن
                </button>
              </div>
            </div>

            <div className="setting-group">
              <div className="glabel">نوار ابزار</div>
              <div className="seg-group">
                <button type="button" className={`seg-btn ${settings.showToolbar ? 'on' : ''}`} onClick={() => onSettingsChange({ ...settings, showToolbar: true })}>
                  نمایش دائمی
                </button>
                <button type="button" className={`seg-btn ${!settings.showToolbar ? 'on' : ''}`} onClick={() => onSettingsChange({ ...settings, showToolbar: false })}>
                  شروع مخفی
                </button>
              </div>
            </div>
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

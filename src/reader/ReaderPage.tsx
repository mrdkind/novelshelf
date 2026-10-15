import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Novel, Volume } from '@/types';
import { novelById, volumeById } from '@/services/catalog';
import { useCatalog } from '@/hooks/useCatalog';
import { usePersonalData } from '@/hooks/usePersonalData';
import { markChapterRead } from '@/storage/repositories';
import { ErrorBox, LoadingBox } from '@/components/StateBoxes';
import EpubReader from './EpubReader';
import { useDocumentTitle } from '@/hooks/misc';

export default function ReaderPage() {
  const { bookId, volumeId } = useParams<{ bookId: string; volumeId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { novels, status, error, reload } = useCatalog();
  const personal = usePersonalData();

  const novel = useMemo(() => novelById(novels, bookId), [novels, bookId]);
  const volume = useMemo(() => volumeById(novel, volumeId), [novel, volumeId]);
  useDocumentTitle(novel ? `${novel.titleFa ?? novel.titleOriginal ?? novel.id} — خواندن` : undefined);

  /**
   * رفع بهم‌ریختگی موبایل هنگام ورود/بازگشت:
   * هنگام باز بودن کتاب‌خوان، اسکرول بدنه صفحه قفل و هنگام خروج
   * دقیقاً به همان موقعیت قبلی بازگردانده می‌شود.
   */
  useEffect(() => {
    const savedY = window.scrollY;
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'contain';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.overscrollBehavior = prevOverscroll;
      // بازگردانی موقعیت اسکرول صفحه زیرین پس از آرام‌شدن چیدمان
      requestAnimationFrame(() => {
        window.scrollTo(0, savedY);
      });
    };
  }, []);

  const initialCfi = params.get('cfi');
  const initialHref = params.get('ch');

  /* --- ناوبری جلد قبلی/بعدی (برای دکمه پایان جلد) --- */
  const volumeList = useMemo(
    () => (novel ? [...novel.volumes].sort((a, b) => a.order - b.order) : []),
    [novel],
  );
  const volumeIndex = useMemo(
    () => volumeList.findIndex((v) => v.id === volumeId),
    [volumeList, volumeId],
  );
  const nextVolume = volumeIndex >= 0 ? (volumeList[volumeIndex + 1] ?? null) : null;

  const exit = useCallback(() => {
    navigate(`/novel/${bookId}`);
  }, [navigate, bookId]);

  const handleNextVolume = useCallback(() => {
    if (nextVolume) {
      navigate(`/read/${bookId}/${nextVolume.id}`);
    } else {
      navigate(`/novel/${bookId}`);
    }
  }, [navigate, bookId, nextVolume]);

  const handleProgress = useCallback(
    (p: { cfi: string; href: string; chapterTitle: string; percentage: number }) => {
      if (!bookId || !volumeId) return;
      void personal.saveProgress({
        bookId,
        volumeId,
        cfi: p.cfi,
        href: p.href,
        chapterTitle: p.chapterTitle,
        percentage: p.percentage,
        updatedAt: Date.now(),
      });
      void personal.touchHistory(bookId, volumeId);
    },
    [bookId, volumeId, personal],
  );

  const handleChapterRead = useCallback(
    (href: string) => {
      if (!bookId || !volumeId) return;
      void markChapterRead(bookId, volumeId, href);
    },
    [bookId, volumeId],
  );

  const handleAddBookmark = useCallback(
    (label: string, cfi: string, href: string) => {
      if (!bookId || !volumeId) return;
      void personal.addBookmark({ bookId, volumeId, cfi, href, label });
    },
    [bookId, volumeId, personal],
  );

  const handleDeleteBookmark = useCallback(
    (id: string) => {
      void personal.deleteBookmark(id);
    },
    [personal],
  );

  if (status === 'loading') return <LoadingBox label="در حال دریافت اطلاعات کتاب…" />;
  // مهم: قبل از تعیین نقطه شروع، داده‌های محلی (پیشرفت) باید خوانده شده باشند
  if (!personal.ready) return <LoadingBox label="در حال بازیابی محل مطالعه…" />;
  if (status === 'error') {
    return (
      <ErrorBox kind="network" title="کتابخانه در دسترس نیست" message={error ?? ''} onRetry={reload} />
    );
  }
  if (!novel) {
    return (
      <ErrorBox
        kind="missing"
        title="کتاب پیدا نشد"
        message={`کتابی با شناسه «${bookId}» وجود ندارد یا حذف شده است.`}
      />
    );
  }
  if (!volume) {
    return (
      <ErrorBox
        kind="missing"
        title="جلد پیدا نشد"
        message={`جلدی با شناسه «${volumeId}» در کتاب «${novel.titleFa ?? novel.id}» وجود ندارد.`}
      />
    );
  }

  // محل شروع: ?cfi= > ?ch= > پیشرفت ذخیره‌شده
  const saved = personal.progress.get(`${novel.id}::${volume.id}`);
  const startCfi = initialCfi ?? (initialHref ? null : (saved?.cfi ?? null));
  const startHref = initialHref ?? (initialCfi ? null : (saved?.href ?? null));

  return (
    <EpubReader
      key={`${novel.id}-${volume.id}`}
      novel={novel as Novel}
      volume={volume as Volume}
      settings={personal.readerSettings}
      onSettingsChange={personal.setReaderSettings}
      initialCfi={startCfi}
      initialHref={startHref}
      savedPercentage={saved?.percentage ?? null}
      bookmarks={personal.bookmarks.filter((b) => b.bookId === novel.id && b.volumeId === volume.id)}
      customFonts={personal.customFonts}
      onAddCustomFont={personal.addCustomFont}
      onDeleteCustomFont={personal.deleteCustomFont}
      onAddBookmark={handleAddBookmark}
      onDeleteBookmark={handleDeleteBookmark}
      onProgress={handleProgress}
      onChapterRead={handleChapterRead}
      onNextVolume={handleNextVolume}
      nextVolumeTitle={nextVolume?.title ?? null}
      hasNextVolume={Boolean(nextVolume)}
      onExit={exit}
    />
  );
}

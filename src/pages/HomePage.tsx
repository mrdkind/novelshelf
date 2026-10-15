import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Clock3,
  Compass,
  Heart,
  LibraryBig,
  Play,
  Sparkles,
  Tags,
  Trophy,
} from 'lucide-react';
import { useCatalog } from '@/hooks/useCatalog';
import { usePersonalData } from '@/hooks/usePersonalData';
import { collectGenres, displayTitle } from '@/services/catalog';
import { BookGrid, BookCard } from '@/components/BookCard';
import { BookGridSkeleton, EmptyBox, ErrorBox } from '@/components/StateBoxes';
import { CoverImage } from '@/components/CoverImage';
import { useDocumentTitle } from '@/hooks/misc';
import { SITE_NAME } from '@/config';

/** یک ردیف از کارت‌های کتاب با عنوان سکشن */
function Section({
  title,
  icon,
  moreTo,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  moreTo?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="section" aria-label={title}>
      <div className="section-head">
        <h2>
          {icon}
          {title}
        </h2>
        {moreTo && (
          <Link className="more" to={moreTo}>
            مشاهده همه ←
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function ContinueReading() {
  const { novels, status } = useCatalog();
  const { progress, ready } = usePersonalData();

  const items = useMemo(() => {
    const entries = [...progress.values()]
      .filter((p) => p.percentage < 0.999)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 6);
    return entries
      .map((p) => {
        const novel = novels.find((n) => n.id === p.bookId);
        const volume = novel?.volumes.find((v) => v.id === p.volumeId);
        if (!novel || !volume) return null;
        return { p, novel, volume };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [progress, novels]);

  if (!ready || status === 'loading') return null;
  if (items.length === 0) return null;

  return (
    <Section title="ادامه مطالعه" icon={<Clock3 size={19} />}>
      <div className="resume-list">
        {items.map(({ p, novel, volume }) => (
          <Link
            key={`${p.bookId}::${p.volumeId}`}
            className="resume-card"
            to={`/read/${novel.id}/${volume.id}`}
          >
            <div className="cover-thumb">
              <CoverImage src={novel.cover} alt={displayTitle(novel)} />
            </div>
            <div className="info">
              <span className="t">{displayTitle(novel)}</span>
              <span className="s">
                {volume.title}؛ {p.chapterTitle || 'فصل جاری'}
              </span>
              <span className="p card-progress">
                <span className="progress-track">
                  <span className="progress-fill" style={{ width: `${Math.round(p.percentage * 100)}%` }} />
                </span>
                <span className="progress-label">{Math.round(p.percentage * 100)}٪ خوانده‌شده</span>
              </span>
            </div>
          </Link>
        ))}
      </div>
    </Section>
  );
}

export default function HomePage() {
  useDocumentTitle();
  const { novels, status, error, reload } = useCatalog();
  const { favorites, ready } = usePersonalData();

  const recent = useMemo(() => [...novels].slice(0, 8), [novels]);
  const completed = useMemo(() => novels.filter((n) => n.status === 'completed').slice(0, 8), [novels]);
  const ongoing = useMemo(() => novels.filter((n) => n.status === 'ongoing').slice(0, 8), [novels]);
  const genres = useMemo(() => collectGenres(novels).slice(0, 12), [novels]);
  const favoriteNovels = useMemo(
    () => novels.filter((n) => favorites.has(n.id)).slice(0, 8),
    [novels, favorites],
  );

  if (status === 'loading') {
    return (
      <div>
        <div className="skeleton" style={{ height: 150, borderRadius: 22, marginBottom: '2rem' }} />
        <BookGridSkeleton />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <ErrorBox
        kind="network"
        title="کتابخانه در دسترس نیست"
        message={error ?? 'خطای نامشخص در دریافت فهرست کتاب‌ها.'}
        onRetry={reload}
      />
    );
  }

  const isEmpty = novels.length === 0;

  return (
    <div>
      {/* هیرو */}
      <div className="hero">
        <h1>
          به {SITE_NAME} خوش آمدید
          <Sparkles size={22} style={{ color: 'var(--accent)', verticalAlign: 'middle', marginInlineStart: '0.4rem' }} />
        </h1>
        <p>
          کتابخانه آنلاین مطالعه ناول و کتاب‌های EPUB، بدون ثبت‌نام و مستقیم در مرورگر. نشانک‌ها، پیشرفت مطالعه و
          تنظیمات شما به‌صورت امن در همین مرورگر ذخیره می‌شوند.
        </p>
        <div className="actions">
          <Link to="/library" className="btn primary">
            <LibraryBig size={17} />
            ورود به کتابخانه
          </Link>
          <Link to="/guide" className="btn">
            <Compass size={17} />
            راهنمای استفاده
          </Link>
        </div>
      </div>

      {isEmpty && (
        <div className="section">
          <EmptyBox
            title="کتابخانه هنوز خالی است"
            message="هیچ کتابی در پوشه novels/ مخزن پیدا نشد. با اضافه‌کردن اولین EPUB و فایل info.json، کتابخانه به‌صورت خودکار ساخته می‌شود. راهنمای کامل در صفحه راهنما و README پروژه موجود است."
            action={
              <Link to="/guide" className="btn primary">
                مشاهده راهنمای افزودن کتاب
              </Link>
            }
          />
        </div>
      )}

      {!isEmpty && (
        <>
          <ContinueReading />

          <Section title="تازه‌ترین کتاب‌ها" icon={<BookOpen size={19} />} moreTo="/library">
            <BookGrid novels={recent} favorites={ready ? favorites : undefined} />
          </Section>

          {ongoing.length > 0 && (
            <Section title="در حال انتشار" icon={<Play size={19} />} moreTo="/library">
              <div className="book-grid">
                {ongoing.map((n) => (
                  <BookCard key={n.id} novel={n} favorite={ready ? favorites.has(n.id) : undefined} />
                ))}
              </div>
            </Section>
          )}

          {completed.length > 0 && (
            <Section title="کتاب‌های کامل‌شده" icon={<Trophy size={19} />} moreTo="/library">
              <BookGrid novels={completed} favorites={ready ? favorites : undefined} />
            </Section>
          )}

          {favoriteNovels.length > 0 && (
            <Section title="علاقه‌مندی‌های شما" icon={<Heart size={19} />} moreTo="/favorites">
              <BookGrid novels={favoriteNovels} favorites={favorites} />
            </Section>
          )}

          {genres.length > 0 && (
            <Section title="ژانرها" icon={<Tags size={19} />}>
              <div className="chip-row">
                {genres.map((g) => (
                  <Link key={g.name} to={`/library?genre=${encodeURIComponent(g.name)}`} className="chip clickable" style={{ textDecoration: 'none' }}>
                    {g.name}
                    <span className="genre-count">{g.count}</span>
                  </Link>
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import type { Novel } from '@/types';
import { STATUS_LABELS } from '@/services/catalog';
import { CoverImage } from './CoverImage';
import type { ReadingProgress } from '@/types';

export const STATUS_LABEL = STATUS_LABELS;

function StatusBadgeInline({ status }: { status: Novel['status'] }) {
  return <span className={`status-badge ${status}`}>{STATUS_LABEL[status]}</span>;
}

interface BookCardProps {
  novel: Novel;
  progress?: ReadingProgress;
  favorite?: boolean;
}

/** کارت کتاب — همه اجزای اختیاری در نبود داده پنهان می‌شوند (بدون داده ساختگی) */
export const BookCard = memo(function BookCard({ novel, progress, favorite }: BookCardProps) {
  const title = novel.titleFa ?? novel.titleOriginal ?? novel.id;
  const genreChips = (novel.genres ?? []).slice(0, 2);

  return (
    <article className="book-card">
      <div className="cover-wrap">
        <CoverImage src={novel.cover} alt={title} />
        {novel.status === 'completed' && <span className="cover-badge">کامل‌شده</span>}
        {favorite && (
          <span className="fav-badge" title="در علاقه‌مندی‌ها">
            <Heart size={15} fill="currentColor" />
          </span>
        )}
      </div>
      <div className="card-body">
        <div className="card-title">{title}</div>
        <div className="card-meta">
          <StatusBadgeInline status={novel.status} />
        </div>
        <div className="card-meta" style={{ marginTop: 0 }}>
          {novel.author}
        </div>
        {genreChips.length > 0 && (
          <div className="card-genres">
            {genreChips.map((g) => (
              <span key={g} className="chip">
                {g}
              </span>
            ))}
          </div>
        )}
        {progress && (
          <div className="card-progress">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${Math.round(progress.percentage * 100)}%` }} />
            </div>
            <div className="progress-label">ادامه مطالعه — {Math.round(progress.percentage * 100)}٪</div>
          </div>
        )}
      </div>
      <Link className="card-link" to={`/novel/${novel.id}`} aria-label={`جزئیات ${title}`} />
    </article>
  );
});

export function BookGrid({
  novels,
  progressMap,
  favorites,
}: {
  novels: Novel[];
  /** نقشه پیشرفت با کلید bookId::volumeId (مستقیم از مخزن) */
  progressMap?: Map<string, ReadingProgress>;
  favorites?: Set<string>;
}) {
  // آخرین پیشرفت هر کتاب (بر اساس آخرین زمان مطالعه)
  const byBook = new Map<string, ReadingProgress>();
  if (progressMap) {
    for (const p of progressMap.values()) {
      const prev = byBook.get(p.bookId);
      if (!prev || prev.updatedAt < p.updatedAt) byBook.set(p.bookId, p);
    }
  }
  return (
    <div className="book-grid">
      {novels.map((n) => (
        <BookCard key={n.id} novel={n} progress={byBook.get(n.id)} favorite={favorites?.has(n.id)} />
      ))}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Filter, LibraryBig, X } from 'lucide-react';
import { useCatalog } from '@/hooks/useCatalog';
import { usePersonalData } from '@/hooks/usePersonalData';
import { collectGenres } from '@/services/catalog';
import { searchNovels } from '@/services/search';
import type { SearchFilters, SortOption, StatusFilter } from '@/services/search';
import { BookGrid } from '@/components/BookCard';
import { BookGridSkeleton, EmptyBox, ErrorBox } from '@/components/StateBoxes';
import { useDocumentTitle } from '@/hooks/misc';

const SORT_LABELS: Record<SortOption, string> = {
  added: 'جدیدترین اضافه‌شده',
  titleAsc: 'عنوان (الفبایی)',
  title: 'عنوان (معکوس)',
};

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'همه وضعیت‌ها',
  ongoing: 'در حال انتشار',
  completed: 'کامل‌شده',
  hiatus: 'متوقف‌شده',
};

export default function LibraryPage() {
  useDocumentTitle('کتابخانه');
  const { novels, status, error, reload } = useCatalog();
  const { progress, favorites } = usePersonalData();
  const [params, setParams] = useSearchParams();

  const [filters, setFilters] = useState<SearchFilters>({
    query: params.get('q') ?? '',
    genre: params.get('genre'),
    status: (params.get('status') as StatusFilter) ?? 'all',
    sort: (params.get('sort') as SortOption) ?? 'added',
  });

  // همگام‌سازی از URL (مثلاً جست‌وجوی سریع سربرگ)
  useEffect(() => {
    setFilters((f) => ({
      ...f,
      query: params.get('q') ?? '',
      genre: params.get('genre') ?? null,
      status: (params.get('status') as StatusFilter) ?? 'all',
      sort: (params.get('sort') as SortOption) ?? f.sort,
    }));
  }, [params]);

  const update = (patch: Partial<SearchFilters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    const sp = new URLSearchParams();
    if (next.query.trim()) sp.set('q', next.query.trim());
    if (next.genre) sp.set('genre', next.genre);
    if (next.status !== 'all') sp.set('status', next.status);
    if (next.sort !== 'added') sp.set('sort', next.sort);
    setParams(sp, { replace: true });
  };

  const results = useMemo(() => searchNovels(novels, filters), [novels, filters]);
  const genres = useMemo(() => collectGenres(novels), [novels]);
  const hasActiveFilters = Boolean(filters.query.trim() || filters.genre || filters.status !== 'all');

  if (status === 'loading') return <BookGridSkeleton count={10} />;
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

  return (
    <div>
      <div className="section-head" style={{ marginBottom: '1rem' }}>
        <h2>
          <LibraryBig size={21} />
          کتابخانه
        </h2>
      </div>

      <div className="toolbar" role="search">
        <div className="search-grow">
          <input
            className="input"
            type="search"
            placeholder="جست‌وجو در عنوان فارسی، عنوان اصلی، عنوان جایگزین و نویسنده…"
            aria-label="جست‌وجوی کتاب‌ها"
            value={filters.query}
            onChange={(e) => update({ query: e.target.value })}
          />
          {filters.query && (
            <button
              type="button"
              className="icon-btn clear-btn"
              style={{ position: 'absolute', insetInlineEnd: '0.4rem', top: '50%', transform: 'translateY(-50%)', width: 30, height: 30 }}
              aria-label="پاک‌کردن جست‌وجو"
              onClick={() => update({ query: '' })}
            >
              <X size={15} />
            </button>
          )}
        </div>

        <select
          className="select"
          style={{ width: 'auto' }}
          value={filters.status}
          aria-label="فیلتر وضعیت انتشار"
          onChange={(e) => update({ status: e.target.value as StatusFilter })}
        >
          {(Object.keys(STATUS_FILTER_LABELS) as StatusFilter[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_FILTER_LABELS[s]}
            </option>
          ))}
        </select>

        <select
          className="select"
          style={{ width: 'auto' }}
          value={filters.sort}
          aria-label="مرتب‌سازی"
          onChange={(e) => update({ sort: e.target.value as SortOption })}
        >
          {(Object.keys(SORT_LABELS) as SortOption[]).map((s) => (
            <option key={s} value={s}>
              {SORT_LABELS[s]}
            </option>
          ))}
        </select>

        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
          <Filter size={15} />
          {results.length} نتیجه
        </span>
      </div>

      {genres.length > 0 && (
        <div className="chip-row" aria-label="فیلتر ژانر">
          <button type="button" className={`chip clickable ${!filters.genre ? 'active' : ''}`} onClick={() => update({ genre: null })}>
            همه ژانرها
          </button>
          {genres.map((g) => (
            <button
              key={g.name}
              type="button"
              className={`chip clickable ${filters.genre === g.name ? 'active' : ''}`}
              onClick={() => update({ genre: filters.genre === g.name ? null : g.name })}
            >
              {g.name}
              <span className="genre-count">{g.count}</span>
            </button>
          ))}
        </div>
      )}

      {results.length === 0 ? (
        novels.length === 0 ? (
          <EmptyBox
            title="کتابخانه خالی است"
            message="هنوز کتابی به مخزن اضافه نشده است. با افزودن یک پوشه کتاب در novels/ و ثبت تغییرات، کتاب به‌صورت خودکار منتشر می‌شود."
          />
        ) : hasActiveFilters ? (
          <EmptyBox
            title="نتیجه‌ای پیدا نشد"
            message="هیچ کتابی با این جست‌وجو یا فیلترها وجود ندارد. عبارت دیگری را امتحان کنید یا فیلترها را پاک کنید."
            action={
              <button
                type="button"
                className="btn"
                onClick={() => update({ query: '', genre: null, status: 'all' })}
              >
                پاک‌کردن فیلترها
              </button>
            }
          />
        ) : null
      ) : (
        <BookGrid novels={results} progressMap={progress} favorites={favorites} />
      )}
    </div>
  );
}

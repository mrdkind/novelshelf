import type { Novel } from '@/types';
import { normalizeFa } from './normalize';
import { displayTitle } from './catalog';

export type SortOption = 'added' | 'title' | 'titleAsc';
export type StatusFilter = 'all' | Novel['status'];

export interface SearchFilters {
  query: string;
  genre: string | null;
  status: StatusFilter;
  sort: SortOption;
}

export const DEFAULT_FILTERS: SearchFilters = {
  query: '',
  genre: null,
  status: 'all',
  sort: 'added',
};

/**
 * جست‌وجو و فیلتر کتاب‌ها — کاملاً سمت مرورگر.
 * جست‌وجو در: عنوان فارسی، عنوان اصلی، عنوان‌های جایگزین و نام نویسنده (با نرمال‌سازی فارسی).
 */
export function searchNovels(novels: Novel[], filters: SearchFilters): Novel[] {
  const q = normalizeFa(filters.query);

  const result = novels.filter((n) => {
    if (filters.genre && !(n.genres ?? []).includes(filters.genre)) return false;
    if (filters.status !== 'all' && n.status !== filters.status) return false;
    if (!q) return true;
    const fields = [
      n.titleFa,
      n.titleOriginal,
      n.author,
      n.translator,
      ...(n.titleAlt ?? []),
    ];
    return fields.some((f) => f && normalizeFa(f).includes(q));
  });

  switch (filters.sort) {
    case 'title':
      return result.sort((a, b) =>
        displayTitle(b).localeCompare(displayTitle(a), 'fa'),
      );
    case 'titleAsc':
      return result.sort((a, b) =>
        displayTitle(a).localeCompare(displayTitle(b), 'fa'),
      );
    case 'added':
    default: {
      const time = (n: Novel) => {
        const t = n.addedAt ? Date.parse(n.addedAt) : NaN;
        return Number.isNaN(t) ? 0 : t;
      };
      return result.sort((a, b) => time(b) - time(a));
    }
  }
}

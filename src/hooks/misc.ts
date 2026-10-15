import { useEffect, useState } from 'react';

export function useDebounced<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function useDocumentTitle(title?: string): void {
  useEffect(() => {
    document.title = title ? `${title} — NovelShelf` : 'NovelShelf — کتابخانه ناول';
  }, [title]);
}

/** قفل اسکرول صفحه هنگام باز بودن پنل/مودال */
export function useScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [locked]);
}

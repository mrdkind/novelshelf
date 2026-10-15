/** مدل داده‌های مشترک پروژه NovelShelf */

export type PublishStatus = 'ongoing' | 'completed' | 'hiatus';
export type TextDirection = 'auto' | 'rtl' | 'ltr';
export type TocSource = 'nav' | 'ncx' | 'spine';

/** یک فصل استخراج‌شده از EPUB (در زمان Build) */
export interface ChapterRef {
  title: string;
  /** href نسبت به ریشه داخلی EPUB */
  href: string;
}

/** یک جلد (فایل EPUB) از یک ناول */
export interface Volume {
  /** شناسه پایدار: نام فایل بدون پسوند */
  id: string;
  /** مسیر نسبی به ریشه سایت: novels/<slug>/<file>.epub */
  file: string;
  title: string;
  order: number;
  size: number | null;
  spineCount: number;
  tocSource: TocSource;
  language: string | null;
  /** فهرست فصل‌ها استخراج‌شده از EPUB */
  chapters: ChapterRef[];
}

/** یک ناول (کتاب) */
export interface Novel {
  id: string;
  titleOriginal: string | null;
  titleFa: string | null;
  titleAlt: string[];
  author: string;
  translator: string | null;
  description: string;
  genres: string[];
  language: string;
  direction: TextDirection;
  status: PublishStatus;
  /** مسیر نسبی کاور به ریشه سایت */
  cover: string;
  coverSize: number;
  year: number | null;
  license: string | null;
  source: string | null;
  notes: string | null;
  addedAt: string | null;
  volumes: Volume[];
}

export interface Catalog {
  version: number;
  generatedAt: string;
  novels: Novel[];
}

/* ---------------- مدل‌های ذخیره‌سازی محلی ---------------- */

/** پیشرفت مطالعه یک جلد */
export interface ReadingProgress {
  bookId: string;
  volumeId: string;
  /** CFI جاری برای بازگشت دقیق */
  cfi: string;
  /** href فصل جاری */
  href: string;
  /** عنوان فصل جاری (برای نمایش) */
  chapterTitle: string;
  /** درصد تقریبی 0..1 */
  percentage: number;
  updatedAt: number;
}

export interface Bookmark {
  id: string;
  bookId: string;
  volumeId: string;
  cfi: string;
  href: string;
  label: string;
  createdAt: number;
}

export interface Favorite {
  bookId: string;
  addedAt: number;
}

export interface HistoryEntry {
  bookId: string;
  volumeId: string;
  updatedAt: number;
}

export interface ReadChapterRecord {
  key: string;
  readAt: number;
}

/** تنظیمات کتاب‌خوان */
export interface ReaderSettings {
  theme: 'dark' | 'light' | 'sepia';
  /** درصد اندازه فونت (100 = پیش‌فرض) */
  fontSize: number;
  lineHeight: number;
  /** فاصله پاراگراف‌ها بر حسب em */
  paragraphSpacing: number;
  /** فونت کتاب: default = فونت خود کتاب */
  fontFamily: 'default' | 'vazirmatn';
  /** عرض ستون متن (فقط حالت پیمایشی) بر حسب rem */
  maxWidth: number;
  /** حاشیه صفحه (فقط حالت پیمایشی) بر حسب px */
  pageMargin: number;
  textAlign: 'justify' | 'start' | 'center';
  direction: TextDirection;
  /** حالت نمایش: paginated = صفحه‌بندی‌شده، scrolled = پیمایشی */
  readingMode: 'paginated' | 'scrolled';
  showToolbar: boolean;
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  theme: 'dark',
  fontSize: 100,
  lineHeight: 1.8,
  paragraphSpacing: 0.8,
  fontFamily: 'default',
  maxWidth: 42,
  pageMargin: 24,
  textAlign: 'justify',
  direction: 'auto',
  readingMode: 'paginated',
  showToolbar: true,
};

export interface SiteSettings {
  theme: 'dark' | 'light';
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  theme: 'dark',
};

/* ---------------- Export/Import ---------------- */

export interface BackupFile {
  app: 'NovelShelf';
  schemaVersion: number;
  exportedAt: string;
  data: {
    progress: ReadingProgress[];
    bookmarks: Bookmark[];
    favorites: Favorite[];
    history: HistoryEntry[];
    readChapters: ReadChapterRecord[];
    settings: Record<string, unknown>;
  };
}

export const BACKUP_SCHEMA_VERSION = 1;

/* ---------------- خطاها ---------------- */

export type CatalogErrorCode =
  | 'network'
  | 'not-found'
  | 'parse'
  | 'unknown';

export class CatalogError extends Error {
  code: CatalogErrorCode;
  constructor(code: CatalogErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

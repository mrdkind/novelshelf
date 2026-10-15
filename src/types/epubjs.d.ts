/** تعاریف نوع برای epub.js (حداقل سطح API مورد استفاده در پروژه) */
declare module 'epubjs' {
  export interface EpubOptions {
    openAs?: 'epub' | 'pdf';
    encoding?: string;
    replacements?: 'none' | 'base64' | 'blobUrl';
    canonical?: string | ((path: string) => string);
  }

  export interface TocItem {
    id?: string;
    href: string;
    label?: string;
    title?: string;
    subitems?: TocItem[];
    parent?: TocItem;
  }

  export interface Location {
    start: { index?: number; href?: string; page?: number; percentage?: number; displayed?: { page: number; total: number } };
    end: Record<string, unknown>;
    at?: unknown;
  }

  export interface RenderOptions {
    width?: number | string;
    height?: number | string;
    flow?: 'paginated' | 'scrolled' | 'scrolled-doc' | 'scrolled-continuous';
    manager?: 'default' | 'continuous';
    spread?: string | number;
    direction?: 'ltr' | 'rtl';
    /** جهت پیش‌فرض — epub.js در کانستراکتور از این گزینه استفاده می‌کند (نه direction) */
    defaultDirection?: 'ltr' | 'rtl';
    allowScriptedContent?: boolean;
    snap?: boolean | Record<string, unknown>;
    minSpreadWidth?: number;
    stylesheet?: string;
  }

  export interface Themes {
    register(name: string, css: string): void;
    registerCss(name: string, css: string): void;
    select(name: string): void;
    fontSize(size: string): void;
    override(selector: string, css: string | Record<string, string>, priority?: boolean): void;
  }

  export interface Contents {
    document: Document;
    window: Window;
    on(type: string, handler: (event: unknown) => void): void;
  }

  export class Book {
    loaded: Record<string, Promise<unknown>>;
    spine: {
      get(target?: string | number): { href: string; cfiFromElement?: unknown } | undefined;
      items: Array<{ href: string }>;
    };
    locations: {
      generate(chars?: number): Promise<number>;
      cfiFromPercentage(percentage: number): string | null;
      percentageFromCfi(cfi: string): number | null;
      total: number;
    };
    metadata: Record<string, string>;
    canRender?: boolean;
    constructor(urlOrData?: string | ArrayBuffer, options?: EpubOptions);
    open(input: string | ArrayBuffer, what?: string): Promise<void>;
    renderTo(element: string | HTMLElement, options: RenderOptions): Rendition;
    ready: Promise<void>;
    destroy(): void;
  }

  export class Rendition {
    themes: Themes;
    constructor(book: Book, options: RenderOptions);
    display(target?: string): Promise<unknown>;
    prev(): Promise<unknown>;
    next(): Promise<unknown>;
    currentLocation(): Location | null;
    direction(dir: 'ltr' | 'rtl'): void;
    on(type: string, handler: (...args: unknown[]) => void): void;
    off(type: string, handler?: (...args: unknown[]) => void): void;
    clear(): void;
    destroy(): void;
    hooks: {
      content: { register(fn: (contents: Contents, view: unknown) => void): void };
    };
  }

  export function ePub(urlOrData?: string | ArrayBuffer, options?: EpubOptions): Book;
  export default ePub;
}

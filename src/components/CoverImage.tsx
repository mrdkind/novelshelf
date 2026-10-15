import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { fetchUrl } from '@/services/paths';

interface CoverImageProps {
  src: string;
  alt: string;
  /** className برای ظرف */
  className?: string;
  eager?: boolean;
}

/**
 * تصویر کاور با Lazy Loading، نسبت ثابت ۲:۳ و جایگزین خطا —
 * خطای بارگذاری تصویر هرگز چیدمان را خراب نمی‌کند.
 */
export function CoverImage({ src, alt, className, eager = false }: CoverImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div className={className ? `cover-fallback ${className}` : 'cover-fallback'} role="img" aria-label={alt}>
        <div>
          <ImageOff size={26} style={{ margin: '0 auto 0.4rem', opacity: 0.7 }} />
          <div>{alt}</div>
          <div style={{ fontSize: '0.7rem', fontWeight: 400, opacity: 0.7, marginTop: '0.2rem' }}>کاور در دسترس نیست</div>
        </div>
      </div>
    );
  }

  return (
    <img
      className={className}
      src={fetchUrl(src)}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

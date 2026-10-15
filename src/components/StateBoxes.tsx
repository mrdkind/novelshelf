import { AlertTriangle, BookX, Loader2, SearchX, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';

export function LoadingBox({ label = 'در حال بارگذاری…' }: { label?: string }) {
  return (
    <div className="state-box" role="status">
      <div className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function EmptyBox({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return (
    <div className="state-box">
      <div className="ico" aria-hidden="true">
        <SearchX size={30} />
      </div>
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  );
}

export function ErrorBox({
  title,
  message,
  onRetry,
  kind = 'error',
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  kind?: 'error' | 'network' | 'missing';
}) {
  const Icon = kind === 'network' ? WifiOff : kind === 'missing' ? BookX : AlertTriangle;
  return (
    <div className={`state-box error`} role="alert">
      <div className="ico" aria-hidden="true">
        <Icon size={30} />
      </div>
      <h3>{title}</h3>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="btn primary" onClick={onRetry}>
          تلاش مجدد
        </button>
      )}
    </div>
  );
}

/** اسکلت گرید کتاب‌ها هنگام بارگذاری کاتالوگ */
export function BookGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="book-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <div className="skeleton" style={{ aspectRatio: '2/3', borderRadius: 16 }} />
          <div className="skeleton" style={{ height: 14, marginTop: 10, borderRadius: 8 }} />
          <div className="skeleton" style={{ height: 11, marginTop: 6, width: '70%', borderRadius: 8 }} />
        </div>
      ))}
    </div>
  );
}

export function InlineSpinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="spin-ico" style={{ animation: 'spin 0.9s linear infinite' }} aria-hidden="true" />;
}

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** مرز خطا: به‌جای صفحه سفید، پیام کاربرپسند فارسی نمایش می‌دهد */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('خطای غیرمنتظره:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: '2rem', textAlign: 'center' }}>
          <div style={{ maxWidth: 480 }}>
            <div style={{ fontSize: '2.6rem', marginBottom: '0.6rem' }}>😕</div>
            <h1 style={{ fontSize: '1.2rem', margin: '0 0 0.6rem' }}>مشکلی پیش آمد</h1>
            <p style={{ color: 'var(--muted)', fontSize: '0.92rem' }}>
              یک خطای غیرمنتظره رخ داد. صفحه را دوباره بارگذاری کنید. اگر خطا تکرار شد، داده‌های مرورگر را از
              تنظیمات مدیریت کنید یا گزارش مشکل را در مخزن پروژه ثبت کنید.
            </p>
            <button
              type="button"
              className="btn primary"
              style={{ marginTop: '1rem' }}
              onClick={() => window.location.reload()}
            >
              بارگذاری مجدد
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

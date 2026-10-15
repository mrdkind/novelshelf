import { Link } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/misc';

export default function NotFoundPage() {
  useDocumentTitle('صفحه پیدا نشد');
  return (
    <div className="notfound">
      <div>
        <div className="code">404</div>
        <h1 style={{ fontSize: '1.2rem', margin: '0.4rem 0 0.6rem' }}>این صفحه در کتابخانه وجود ندارد</h1>
        <p style={{ color: 'var(--muted)', maxWidth: '46ch', margin: '0 auto 1.2rem' }}>
          ممکن است نشانی اشتباه باشد یا کتاب/صفحه موردنظر حذف شده باشد. از کتابخانه شروع کنید.
        </p>
        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/" className="btn primary">
            صفحه اصلی
          </Link>
          <Link to="/library" className="btn">
            کتابخانه
          </Link>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { BookOpen, Menu, Moon, Sun, Search } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { SITE_NAME, SITE_TAGLINE, REPO_URL } from '@/config';
import { useTheme } from '@/hooks/useTheme';
import { useDebounced } from '@/hooks/misc';
import { useEffect } from 'react';

const NAV_ITEMS = [
  { to: '/', label: 'خانه', end: true },
  { to: '/library', label: 'کتابخانه' },
  { to: '/favorites', label: 'علاقه‌مندی‌ها' },
  { to: '/history', label: 'تاریخچه' },
  { to: '/settings', label: 'تنظیمات' },
  { to: '/guide', label: 'راهنما' },
  { to: '/about', label: 'درباره' },
];

function Header() {
  const { theme, toggle } = useTheme();
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query, 350);
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // جست‌وجوی زنده: با تغییر عبارت به کتابخانه منتقل شو
  useEffect(() => {
    if (!debounced.trim()) return;
    navigate(`/library?q=${encodeURIComponent(debounced.trim())}`, { replace: location.pathname === '/library' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // بستن منوی موبایل هنگام تغییر مسیر
  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link to="/" className="brand" aria-label={`${SITE_NAME} — صفحه اصلی`}>
          <span className="logo" aria-hidden="true">
            <BookOpen size={21} strokeWidth={2.2} />
          </span>
          <span>
            {SITE_NAME}
            <small>{SITE_TAGLINE}</small>
          </span>
        </Link>

        <nav className={`main-nav ${menuOpen ? 'open' : ''}`} aria-label="منوی اصلی">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="header-actions">
          <div className="header-search">
            <input
              type="search"
              placeholder="جست‌وجوی سریع…"
              aria-label="جست‌وجوی سریع کتاب‌ها"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="search-ico" aria-hidden="true">
              <Search size={16} />
            </span>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'تغییر به تم روشن' : 'تغییر به تم تاریک'}
            title={theme === 'dark' ? 'تم روشن' : 'تم تاریک'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            type="button"
            className="icon-btn menu-toggle"
            aria-label={menuOpen ? 'بستن منو' : 'بازکردن منو'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Menu size={19} />
          </button>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <strong>{SITE_NAME}</strong>
          <p style={{ margin: '0.3rem 0 0', maxWidth: '46ch' }}>
            کتابخانه‌ای رایگان برای مطالعه آنلاین ناول و فایل‌های EPUB. تمام تنظیمات، نشانک‌ها و پیشرفت مطالعه شما فقط
            در مرورگر خودتان ذخیره می‌شود و به هیچ سروری ارسال نمی‌گردد.
          </p>
        </div>
        <div className="footer-links" aria-label="پیوندها">
          <Link to="/library">کتابخانه</Link>
          <Link to="/guide">راهنمای استفاده</Link>
          <Link to="/about">درباره پروژه</Link>
          <Link to="/settings">تنظیمات و داده‌ها</Link>
          {REPO_URL && (
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              مخزن GitHub
            </a>
          )}
        </div>
        <div>
          <p style={{ margin: 0 }}>
            حقوق نشر کتاب‌ها نزد ناشران و مولفان آن‌هاست؛ این سایت فقط کتاب‌هایی با مجوز انتشار عمومی را میزبانی می‌کند.
          </p>
        </div>
      </div>
    </footer>
  );
}

/** پیمایش به بالای صفحه هنگام تغییر مسیر */
function ScrollToTop() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname, search]);
  return null;
}

export function Layout() {
  return (
    <div className="app-shell">
      <ScrollToTop />
      <Header />
      <main className="site-main">
        <div className="container">
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  );
}

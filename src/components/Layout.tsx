import { useState } from 'react';
import { BookOpen, Clock, Home, Library, Menu, Moon, Search, Settings, Heart, Sun } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { SITE_NAME, SITE_TAGLINE, REPO_URL } from '@/config';
import { useTheme } from '@/hooks/useTheme';
import { useDebounced } from '@/hooks/misc';
import { useEffect } from 'react';

const NAV_ITEMS = [
  { to: '/', label: 'خانه', icon: Home, end: true },
  { to: '/library', label: 'کتابخانه', icon: Library },
  { to: '/favorites', label: 'علاقه‌مندی‌ها', icon: Heart },
  { to: '/history', label: 'تاریخچه', icon: Clock },
  { to: '/settings', label: 'تنظیمات', icon: Settings },
];

const BOTTOM_NAV_ITEMS = [
  { to: '/', label: 'خانه', icon: Home, end: true },
  { to: '/library', label: 'کتابخانه', icon: Library },
  { to: '/favorites', label: 'علاقه‌مندی', icon: Heart },
  { to: '/history', label: 'تاریخچه', icon: Clock },
  { to: '/settings', label: 'تنظیمات', icon: Settings },
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
              <item.icon size={16} aria-hidden="true" />
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

/** نوار ناوبری پایین — فقط موبایل */
function BottomNav() {
  const location = useLocation();
  return (
    <nav className="bottom-nav" aria-label="ناوبری موبایل">
      {BOTTOM_NAV_ITEMS.map((item) => {
        const active = item.end ? location.pathname === item.to : location.pathname.startsWith(item.to);
        return (
          <Link key={item.to} to={item.to} className={`bn-item ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
            <item.icon size={20} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
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

/**
 * مدیریت اسکرول هوشمند:
 * - PUSH/REPLACE → پرش به بالای صفحه
 * - POP (دکمه بازگشت) → بازیابی دقیق موقعیت قبلی از حافظه جلسه
 * این کار «بهم‌ریختن صفحه» هنگام برگشت از صفحات دیگر (به‌ویژه کتاب‌خوان) را در موبایل برطرف می‌کند.
 */
function ScrollManager() {
  const { pathname, search } = useLocation();
  const navType = useNavigationType();
  const key = `${pathname}${search}`;

  useEffect(() => {
    if (navType === 'POP') {
      const saved = sessionStorage.getItem(`ns-scroll:${key}`);
      const y = saved ? Number(saved) : 0;
      // پس از رندر و آرام‌شدن چیدمان بازیابی شود
      requestAnimationFrame(() => window.scrollTo(0, y));
    } else {
      window.scrollTo(0, 0);
    }
    const onScroll = () => {
      try {
        sessionStorage.setItem(`ns-scroll:${key}`, String(Math.round(window.scrollY)));
      } catch {
        /* حافظه پر است — نادیده */
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [key, navType]);

  return null;
}

export function Layout() {
  return (
    <div className="app-shell">
      <ScrollManager />
      <Header />
      <main className="site-main">
        <div className="container">
          <Outlet />
        </div>
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}

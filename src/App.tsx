import { HashRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '@/hooks/useTheme';
import { CatalogProvider } from '@/hooks/useCatalog';
import { PersonalDataProvider } from '@/hooks/usePersonalData';
import { ToastProvider } from '@/components/Toast';
import { Layout } from '@/components/Layout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import HomePage from '@/pages/HomePage';
import LibraryPage from '@/pages/LibraryPage';
import NovelDetailPage from '@/pages/NovelDetailPage';
import ReaderPage from '@/reader/ReaderPage';
import FavoritesPage from '@/pages/FavoritesPage';
import HistoryPage from '@/pages/HistoryPage';
import SettingsPage from '@/pages/SettingsPage';
import AboutPage from '@/pages/AboutPage';
import GuidePage from '@/pages/GuidePage';
import NotFoundPage from '@/pages/NotFoundPage';

/**
 * از HashRouter استفاده شده تا لینک‌های مستقیم و Refresh صفحات داخلی روی
 * GitHub Pages بدون 404 کار کنند (مستند در README).
 */
export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <CatalogProvider>
            <PersonalDataProvider>
              <HashRouter>
                <Routes>
                  <Route element={<Layout />}>
                    <Route index element={<HomePage />} />
                    <Route path="library" element={<LibraryPage />} />
                    <Route path="novel/:novelId" element={<NovelDetailPage />} />
                    <Route path="favorites" element={<FavoritesPage />} />
                    <Route path="history" element={<HistoryPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                    <Route path="about" element={<AboutPage />} />
                    <Route path="guide" element={<GuidePage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                  {/* کتاب‌خوان بدون Layout (تمام‌صفحه) */}
                  <Route path="read/:bookId/:volumeId" element={<ReaderPage />} />
                </Routes>
              </HashRouter>
            </PersonalDataProvider>
          </CatalogProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

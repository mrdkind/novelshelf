import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  Calendar,
  ChevronDown,
  ChevronUp,
  FileText,
  Globe,
  Heart,
  Languages,
  Layers,
  Play,
  ShieldCheck,
  Tag,
  User,
} from 'lucide-react';
import { novelById, displayTitle, originalTitle, STATUS_LABELS, totalChapters } from '@/services/catalog';
import { useCatalog } from '@/hooks/useCatalog';
import { usePersonalData } from '@/hooks/usePersonalData';
import * as repo from '@/storage/repositories';
import { CoverImage } from '@/components/CoverImage';
import { ErrorBox, LoadingBox } from '@/components/StateBoxes';
import { ConfirmDialog } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { useDocumentTitle } from '@/hooks/misc';
import { formatBytes } from '@/services/epubLoader';

export default function NovelDetailPage() {
  const { novelId } = useParams<{ novelId: string }>();
  const { novels, status, error, reload } = useCatalog();
  const personal = usePersonalData();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [readChapters, setReadChapters] = useState<Map<string, Set<string>>>(new Map());
  const [bookmarkDlgOpen, setBookmarkDlgOpen] = useState(false);
  const [confirmRemoveBookmarks, setConfirmRemoveBookmarks] = useState(false);

  const novel = useMemo(() => novelById(novels, novelId), [novels, novelId]);
  const title = novel ? displayTitle(novel) : 'کتاب';
  useDocumentTitle(title);

  // آخرین پیشرفت در این کتاب
  const latestProgress = useMemo(() => {
    if (!novel) return null;
    let latest = null;
    for (const vol of novel.volumes) {
      const p = personal.progress.get(`${novel.id}::${vol.id}`);
      if (p && (!latest || p.updatedAt > latest.p.updatedAt)) latest = { p, vol };
    }
    return latest;
  }, [novel, personal.progress]);

  // فصل‌های خوانده‌شده هر جلد
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!novel) return;
      const map = new Map<string, Set<string>>();
      for (const vol of novel.volumes) {
        const set = await repo.getReadChaptersOfVolume(novel.id, vol.id);
        map.set(vol.id, set);
      }
      if (!cancelled) setReadChapters(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [novel]);

  const bookBookmarks = useMemo(
    () => personal.bookmarks.filter((b) => b.bookId === novelId),
    [personal.bookmarks, novelId],
  );

  if (status === 'loading') return <LoadingBox />;
  if (status === 'error') {
    return (
      <ErrorBox kind="network" title="کتابخانه در دسترس نیست" message={error ?? ''} onRetry={reload} />
    );
  }
  if (!novel) {
    return (
      <ErrorBox
        kind="missing"
        title="کتاب پیدا نشد"
        message={`کتابی با شناسه «${novelId}» در کتابخانه وجود ندارد. ممکن است حذف شده باشد یا نشانی اشتباه باشد.`}
      />
    );
  }

  const isFav = personal.favorites.has(novel.id);
  const orig = originalTitle(novel);

  const toggleVolume = (volId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(volId)) next.delete(volId);
      else next.add(volId);
      return next;
    });
  };

  const startReading = (volumeId?: string) => {
    const target = volumeId ?? latestProgress?.vol.id ?? novel.volumes[0]?.id;
    if (target) navigate(`/read/${novel.id}/${target}`);
  };

  const toggleChapterRead = async (volumeId: string, href: string) => {
    const wasRead = readChapters.get(volumeId)?.has(href);
    if (wasRead) {
      await repo.unmarkChapterRead(novel.id, volumeId, href);
    } else {
      await repo.markChapterRead(novel.id, volumeId, href);
    }
    const set = await repo.getReadChaptersOfVolume(novel.id, volumeId);
    setReadChapters((m) => new Map(m).set(volumeId, set));
  };

  return (
    <div>
      <button type="button" className="btn ghost small" onClick={() => navigate(-1)} style={{ marginBottom: '1rem' }}>
        <ArrowRight size={16} style={{ transform: 'scaleX(-1)' }} />
        بازگشت
      </button>

      <div className="novel-hero">
        <div className="novel-cover">
          <CoverImage src={novel.cover} alt={title} eager />
        </div>
        <div className="novel-info">
          <h1>{title}</h1>
          {orig && <div className="orig-title">{orig}</div>}

          <div className="meta-grid">
            <span className="m">
              <User size={15} /> {novel.author}
            </span>
            {novel.translator && (
              <span className="m">
                <Languages size={15} /> مترجم: {novel.translator}
              </span>
            )}
            <span className={`status-badge ${novel.status}`}>{STATUS_LABELS[novel.status]}</span>
            {novel.year && (
              <span className="m">
                <Calendar size={15} /> {novel.year}
              </span>
            )}
            <span className="m">
              <Layers size={15} /> {novel.volumes.length} جلد — {totalChapters(novel)} فصل
            </span>
            <span className="m">
              <Globe size={15} /> {novel.language.toUpperCase()}
            </span>
            {novel.license && (
              <span className="m">
                <ShieldCheck size={15} /> {novel.license}
              </span>
            )}
          </div>

          <div className="chip-row" style={{ margin: '0.6rem 0 0.9rem' }}>
            {novel.genres.map((g) => (
              <Link key={g} to={`/library?genre=${encodeURIComponent(g)}`} className="chip" style={{ textDecoration: 'none' }}>
                {g}
              </Link>
            ))}
          </div>

          <p className="novel-desc">{novel.description}</p>

          {novel.notes && (
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              <Tag size={13} style={{ verticalAlign: 'middle' }} /> {novel.notes}
            </p>
          )}

          <div className="novel-actions">
            <button type="button" className="btn primary" onClick={() => startReading()}>
              {latestProgress ? (
                <>
                  <Play size={16} /> ادامه مطالعه {latestProgress.p.chapterTitle ? `— ${latestProgress.p.chapterTitle}` : ''}
                </>
              ) : (
                <>
                  <BookOpen size={16} /> شروع مطالعه
                </>
              )}
            </button>
            <button
              type="button"
              className={`btn ${isFav ? 'primary' : ''}`}
              onClick={async () => {
                await personal.toggleFavorite(novel.id);
                toast(isFav ? 'از علاقه‌مندی‌ها حذف شد' : 'به علاقه‌مندی‌ها اضافه شد', isFav ? 'info' : 'success');
              }}
              aria-pressed={isFav}
            >
              <Heart size={16} fill={isFav ? 'currentColor' : 'none'} />
              {isFav ? 'حذف از علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها'}
            </button>
            {bookBookmarks.length > 0 && (
              <button type="button" className="btn" onClick={() => setBookmarkDlgOpen(true)}>
                <Bookmark size={16} /> نشانک‌ها ({bookBookmarks.length})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* جلدها و فصل‌ها */}
      <section className="section" aria-label="جلدها">
        <div className="section-head">
          <h2>
            <Layers size={19} /> جلدها
          </h2>
        </div>

        {novel.volumes.map((vol) => {
          const isOpen = expanded.has(vol.id) || novel.volumes.length === 1;
          const readSet = readChapters.get(vol.id) ?? new Set<string>();
          const currentVolProgress = personal.progress.get(`${novel.id}::${vol.id}`);
          const currentHref = currentVolProgress?.href;

          return (
            <div key={vol.id} className="volume-block">
              <div className="volume-head">
                <h3>
                  <BookOpen size={17} /> {vol.title}
                </h3>
                <span className="sub">
                  {vol.chapters.length} فصل {vol.size ? `— ${formatBytes(vol.size)}` : ''}
                  {readSet.size > 0 ? ` — ${readSet.size} خوانده‌شده` : ''}
                </span>
                <div className="actions">
                  <button type="button" className="btn small primary" onClick={() => startReading(vol.id)}>
                    <Play size={14} /> خواندن
                  </button>
                  {novel.volumes.length > 1 && (
                    <button type="button" className="collapse-toggle" onClick={() => toggleVolume(vol.id)} aria-expanded={isOpen}>
                      {isOpen ? (
                        <>
                          بستن فهرست <ChevronUp size={14} />
                        </>
                      ) : (
                        <>
                          فهرست فصل‌ها <ChevronDown size={14} />
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {isOpen && (
                <div className="chapter-list">
                  {vol.chapters.map((ch, i) => {
                    const isRead = readSet.has(ch.href);
                    const isCurrent = currentHref === ch.href;
                    return (
                      <div
                        key={ch.href}
                        className={`chapter-item ${isRead ? 'read' : ''}`}
                        onClick={() => navigate(`/read/${novel.id}/${vol.id}?ch=${encodeURIComponent(ch.href)}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            navigate(`/read/${novel.id}/${vol.id}?ch=${encodeURIComponent(ch.href)}`);
                          }
                        }}
                        role="link"
                        tabIndex={0}
                      >
                        <span className="num">{i + 1}.</span>
                        <span className="title">{ch.title}</span>
                        {isCurrent && <span className="reading">در حال خواندن</span>}
                        <button
                          type="button"
                          className="icon-btn"
                          style={{ width: 28, height: 28, border: 'none', background: 'transparent' }}
                          title={isRead ? 'علامت‌گذاری به عنوان نخوانده' : 'علامت‌گذاری به عنوان خوانده‌شده'}
                          aria-label={isRead ? 'حذف علامت خوانده‌شده' : 'علامت‌گذاری خوانده‌شده'}
                          onClick={(e) => {
                            e.stopPropagation();
                            void toggleChapterRead(vol.id, ch.href);
                          }}
                        >
                          <FileText size={14} color={isRead ? 'var(--ok)' : 'var(--muted)'} />
                        </button>
                        {isRead && (
                          <span className="check">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* دیالوگ نشانک‌های این کتاب */}
      <ConfirmDialog
        open={confirmRemoveBookmarks}
        title="حذف همه نشانک‌های این کتاب؟"
        message="همه نشانک‌های این کتاب از مرورگر شما حذف می‌شوند. این عمل قابل بازگشت نیست."
        confirmLabel="حذف نشانک‌ها"
        danger
        onConfirm={async () => {
          setConfirmRemoveBookmarks(false);
          for (const b of bookBookmarks) await personal.deleteBookmark(b.id);
          toast('نشانک‌ها حذف شدند', 'success');
        }}
        onCancel={() => setConfirmRemoveBookmarks(false)}
      />

      {bookmarkDlgOpen && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setBookmarkDlgOpen(false)}>
          <div className="modal" style={{ width: 'min(520px, 100%)' }} role="dialog" aria-modal="true" aria-label="نشانک‌های کتاب">
            <h3>
              <Bookmark size={17} style={{ verticalAlign: 'middle' }} /> نشانک‌های «{title}»
            </h3>
            <div style={{ maxHeight: '50vh', overflowY: 'auto', margin: '0.8rem 0 1rem' }}>
              {bookBookmarks.map((b) => {
                const vol = novel.volumes.find((v) => v.id === b.volumeId);
                return (
                  <div key={b.id} className="bookmark-item" style={{ color: 'var(--text)' }}>
                    <div
                      className="bi-label"
                      onClick={() => {
                        setBookmarkDlgOpen(false);
                        navigate(`/read/${novel.id}/${b.volumeId}?cfi=${encodeURIComponent(b.cfi)}`);
                      }}
                    >
                      <div className="l">{b.label}</div>
                      <div className="d">
                        {vol?.title ?? b.volumeId} — {new Date(b.createdAt).toLocaleDateString('fa-IR')}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="del"
                      aria-label="حذف نشانک"
                      onClick={async () => {
                        await personal.deleteBookmark(b.id);
                        toast('نشانک حذف شد', 'success');
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="btn ghost" onClick={() => setBookmarkDlgOpen(false)}>
                بستن
              </button>
              <button type="button" className="btn danger" onClick={() => setConfirmRemoveBookmarks(true)}>
                حذف همه نشانک‌ها
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

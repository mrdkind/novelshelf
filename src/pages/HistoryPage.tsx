import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { History, Play, Trash2 } from 'lucide-react';
import { useCatalog } from '@/hooks/useCatalog';
import { usePersonalData } from '@/hooks/usePersonalData';
import { CoverImage } from '@/components/CoverImage';
import { ConfirmDialog } from '@/components/Modal';
import { EmptyBox, LoadingBox } from '@/components/StateBoxes';
import { useToast } from '@/components/Toast';
import { useDocumentTitle } from '@/hooks/misc';
import { displayTitle } from '@/services/catalog';

export default function HistoryPage() {
  useDocumentTitle('تاریخچه مطالعه');
  const { novels, status } = useCatalog();
  const { history, ready, removeHistory, progress } = usePersonalData();
  const { toast } = useToast();
  const [confirmClear, setConfirmClear] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  const rows = useMemo(() => {
    return history
      .map((h) => {
        const novel = novels.find((n) => n.id === h.bookId);
        const volume = novel?.volumes.find((v) => v.id === h.volumeId);
        if (!novel || !volume) return null;
        return { h, novel, volume };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [history, novels]);

  if (status === 'loading' || !ready) return <LoadingBox />;

  return (
    <div>
      <div className="section-head">
        <h2>
          <History size={20} /> تاریخچه مطالعه
        </h2>
        {rows.length > 0 && (
          <button type="button" className="btn danger small" style={{ marginInlineStart: 'auto' }} onClick={() => setConfirmClear(true)}>
            <Trash2 size={14} /> پاک‌کردن کل تاریخچه
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyBox
          title="تاریخچه خالی است"
          message="با شروع مطالعه هر کتاب، آخرین جلد و زمان مطالعه شما در این صفحه ثبت می‌شود."
        />
      ) : (
        <div>
          {rows.map(({ h, novel, volume }) => {
            const title = displayTitle(novel);
            const pct = progress.get(`${novel.id}::${volume.id}`)?.percentage ?? null;
            return (
              <div key={h.bookId} className="history-item">
                <div style={{ width: 44, aspectRatio: '2/3', borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: 'var(--surface-2)' }}>
                  <CoverImage src={novel.cover} alt={title} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <Link to={`/novel/${novel.id}`} style={{ fontWeight: 700, color: 'var(--text)' }}>
                    {title}
                  </Link>
                  <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{volume.title}</div>
                  {pct !== null && (
                    <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>پیشرفت: {Math.round(pct * 100)}٪</div>
                  )}
                </div>
                <span className="when">{new Date(h.updatedAt).toLocaleString('fa-IR')}</span>
                <Link to={`/read/${novel.id}/${volume.id}`} className="btn small primary" aria-label={`ادامه ${title}`}>
                  <Play size={13} /> ادامه
                </Link>
                <button
                  type="button"
                  className="del"
                  aria-label={`حذف ${title} از تاریخچه`}
                  onClick={() => setPendingRemove(h.bookId)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirmClear}
        title="پاک‌کردن کل تاریخچه؟"
        message="همه رکوردهای تاریخچه مطالعه از مرورگر شما حذف می‌شوند. پیشرفت مطالعه و نشانک‌ها باقی می‌مانند."
        confirmLabel="پاک‌کردن"
        danger
        onConfirm={async () => {
          setConfirmClear(false);
          for (const r of rows) await removeHistory(r.h.bookId);
          toast('تاریخچه پاک شد', 'success');
        }}
        onCancel={() => setConfirmClear(false)}
      />

      <ConfirmDialog
        open={pendingRemove !== null}
        title="حذف از تاریخچه؟"
        message="این کتاب از تاریخچه مطالعه حذف می‌شود."
        confirmLabel="حذف"
        danger
        onConfirm={async () => {
          if (pendingRemove) {
            await removeHistory(pendingRemove);
            toast('از تاریخچه حذف شد', 'success');
          }
          setPendingRemove(null);
        }}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  );
}

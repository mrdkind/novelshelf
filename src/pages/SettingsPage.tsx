import { useRef, useState } from 'react';
import {
  BookText,
  Database,
  DownloadCloud,
  Eraser,
  Moon,
  RotateCcw,
  ShieldCheck,
  Sun,
  UploadCloud,
} from 'lucide-react';
import { usePersonalData } from '@/hooks/usePersonalData';
import { useTheme } from '@/hooks/useTheme';
import type { ReaderSettings } from '@/types';
import { DEFAULT_READER_SETTINGS } from '@/types';
import * as repo from '@/storage/repositories';
import { clearAll } from '@/storage/db';
import { ConfirmDialog } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { useDocumentTitle } from '@/hooks/misc';

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className="toggle-switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  );
}

export default function SettingsPage() {
  useDocumentTitle('تنظیمات');
  const personal = usePersonalData();
  const { theme, toggle: toggleTheme } = useTheme();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [pendingImport, setPendingImport] = useState<{ file: File; mode: repo.ImportMode } | null>(null);
  const [confirmClear, setConfirmClear] = useState<'all' | 'history' | null>(null);
  const [pendingReset, setPendingReset] = useState(false);

  const s = personal.readerSettings;
  const setS = (patch: Partial<ReaderSettings>) => {
    personal.setReaderSettings({ ...s, ...patch });
  };

  const doExport = async () => {
    try {
      const backup = await repo.exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `novelshelf-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('فایل پشتیبان دانلود شد', 'success');
    } catch {
      toast('ساخت فایل پشتیبان ناموفق بود', 'error');
    }
  };

  const onImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const raw: unknown = JSON.parse(text);
      const check = repo.validateBackup(raw);
      if (!check.ok) {
        toast(check.error, 'error');
        return;
      }
      // حالت پیش‌فرض: ادغام بدون حذف داده‌های فعلی (هیچ داده‌ای بدون تأیید پاک نمی‌شود)
      setPendingImport({ file, mode: 'merge' });
    } catch {
      toast('فایل انتخاب‌شده یک JSON معتبر نیست.', 'error');
    }
  };

  const runImport = async () => {
    if (!pendingImport) return;
    try {
      const text = await pendingImport.file.text();
      const check = repo.validateBackup(JSON.parse(text));
      if (!check.ok) {
        toast(check.error, 'error');
        return;
      }
      const result = await repo.importBackup(check.backup, pendingImport.mode);
      await personal.refresh();
      toast(
        `اطلاعات با موفقیت وارد شد (${result.counts.progress} پیشرفت، ${result.counts.bookmarks} نشانک، ${result.counts.favorites} علاقه‌مندی)`,
        'success',
      );
    } catch {
      toast('واردکردن اطلاعات ناموفق بود.', 'error');
    } finally {
      setPendingImport(null);
    }
  };

  return (
    <div>
      <div className="section-head">
        <h2>تنظیمات</h2>
      </div>

      {/* ظاهر سایت */}
      <div className="settings-card">
        <h2>
          <Sun size={19} /> ظاهر سایت
        </h2>
        <div className="setting-row">
          <div>
            <div className="label">تم سایت</div>
            <div className="hint">تم تاریک پیش‌فرض است و برای مطالعه طولانی آرام‌تر است.</div>
          </div>
          <div className="control">
            <button type="button" className="btn small" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              {theme === 'dark' ? 'تغییر به روشن' : 'تغییر به تاریک'}
            </button>
          </div>
        </div>
      </div>

      {/* تنظیمات پیش‌فرض کتاب‌خوان */}
      <div className="settings-card">
        <h2>
          <BookText size={19} /> تنظیمات پیش‌فرض کتاب‌خوان
        </h2>
        <p className="desc">
          این تنظیمات در همه کتاب‌ها اعمال می‌شود. داخل کتاب‌خوان هم می‌توانید آن‌ها را لحظه‌ای تغییر دهید؛ تغییرات
          برای مراجعه بعدی ذخیره می‌شوند.
        </p>

        <div className="setting-row">
          <div className="label">تم مطالعه</div>
          <div className="control seg-group" role="group" aria-label="تم مطالعه">
            {(['dark', 'light', 'sepia'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`seg-btn ${s.theme === t ? 'on' : ''}`}
                onClick={() => setS({ theme: t })}
              >
                {t === 'dark' ? 'تاریک' : t === 'light' ? 'روشن' : 'سپیا'}
              </button>
            ))}
          </div>
        </div>

        <div className="setting-row">
          <div>
            <div className="label">حالت نمایش</div>
            <div className="hint">صفحه‌بندی‌شده شبیه کتاب‌خوان است؛ پیمایشی برای فصل‌های بلند مناسب‌تر است.</div>
          </div>
          <div className="control seg-group" role="group" aria-label="حالت نمایش">
            <button
              type="button"
              className={`seg-btn ${s.readingMode === 'paginated' ? 'on' : ''}`}
              onClick={() => setS({ readingMode: 'paginated' })}
            >
              صفحه‌بندی‌شده
            </button>
            <button
              type="button"
              className={`seg-btn ${s.readingMode === 'scrolled' ? 'on' : ''}`}
              onClick={() => setS({ readingMode: 'scrolled' })}
            >
              پیمایشی
            </button>
          </div>
        </div>

        <div className="setting-row">
          <div className="label">جهت متن پیش‌فرض</div>
          <div className="control seg-group" role="group" aria-label="جهت متن">
            {(['auto', 'rtl', 'ltr'] as const).map((d) => (
              <button key={d} type="button" className={`seg-btn ${s.direction === d ? 'on' : ''}`} onClick={() => setS({ direction: d })}>
                {d === 'auto' ? 'خودکار' : d === 'rtl' ? 'راست‌به‌چپ' : 'چپ‌به‌راست'}
              </button>
            ))}
          </div>
        </div>

        <div className="setting-row">
          <div className="label">ترازبندی متن</div>
          <div className="control seg-group" role="group" aria-label="ترازبندی متن">
            {(['justify', 'start', 'center'] as const).map((a) => (
              <button key={a} type="button" className={`seg-btn ${s.textAlign === a ? 'on' : ''}`} onClick={() => setS({ textAlign: a })}>
                {a === 'justify' ? 'هم‌تراز' : a === 'start' ? 'ابتدای سطر' : 'وسط'}
              </button>
            ))}
          </div>
        </div>

        <div className="setting-row">
          <div className="label">نوار ابزار کتاب‌خوان</div>
          <div className="control">
            <Toggle checked={s.showToolbar} onChange={(v) => setS({ showToolbar: v })} label="نمایش نوار ابزار" />
          </div>
        </div>
      </div>

      {/* داده‌های شخصی */}
      <div className="settings-card">
        <h2>
          <Database size={19} /> داده‌های من
        </h2>
        <p className="desc">
          پیشرفت مطالعه، نشانک‌ها، علاقه‌مندی‌ها و تنظیمات شما فقط در مرورگر همین دستگاه ذخیره شده‌اند و به‌صورت
          خودکار بین دستگاه‌ها همگام نمی‌شوند. با پاک‌کردن داده‌های سایت در مرورگر، این اطلاعات از بین می‌روند؛
          برای جابه‌جایی دستگاه، از خروجی‌گرفتن استفاده کنید.
        </p>

        <div className="setting-row">
          <div>
            <div className="label">خروجی‌گرفتن (Export)</div>
            <div className="hint">یک فایل JSON شامل همه اطلاعات شخصی شما دانلود می‌شود.</div>
          </div>
          <div className="control">
            <button type="button" className="btn" onClick={doExport}>
              <DownloadCloud size={15} /> دانلود پشتیبان
            </button>
          </div>
        </div>

        <div className="setting-row">
          <div>
            <div className="label">واردکردن (Import)</div>
            <div className="hint">فایل پشتیبان NovelShelf را انتخاب کنید. به‌صورت پیش‌فرض با اطلاعات فعلی ادغام می‌شود.</div>
          </div>
          <div className="control">
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              <UploadCloud size={15} /> انتخاب فایل پشتیبان
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImportFile(f);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        <div className="setting-row">
          <div>
            <div className="label">بازگردانی تنظیمات کتاب‌خوان</div>
            <div className="hint">همه تنظیمات مطالعه به حالت پیش‌فرض برمی‌گردند.</div>
          </div>
          <div className="control">
            <button type="button" className="btn" onClick={() => setPendingReset(true)}>
              <RotateCcw size={15} /> بازنشانی
            </button>
          </div>
        </div>

        <div className="setting-row">
          <div>
            <div className="label">پاک‌کردن داده‌ها</div>
            <div className="hint">حذف تاریخچه یا کل داده‌های شخصی از مرورگر.</div>
          </div>
          <div className="control">
            <button type="button" className="btn" onClick={() => setConfirmClear('history')}>
              <Eraser size={15} /> پاک‌کردن تاریخچه
            </button>
            <button type="button" className="btn danger" onClick={() => setConfirmClear('all')}>
              <Eraser size={15} /> پاک‌کردن همه
            </button>
          </div>
        </div>
      </div>

      {/* حریم خصوصی */}
      <div className="settings-card">
        <h2>
          <ShieldCheck size={19} /> حریم خصوصی
        </h2>
        <p className="desc" style={{ marginBottom: 0 }}>
          هیچ‌کدام از اطلاعات شخصی شما به سرور ارسال نمی‌شود. همه داده‌ها در IndexedDB مرورگر خودتان ذخیره می‌شوند و
          فقط روی همین دستگاه باقی می‌مانند. برای آگاهی بیشتر، صفحه «درباره» را ببینید.
        </p>
      </div>

      {/* دیالوگ‌ها */}
      <ConfirmDialog
        open={pendingImport !== null}
        title="واردکردن اطلاعات"
        message={
          pendingImport?.mode === 'merge'
            ? 'فایل پشتیبان با اطلاعات فعلی شما ادغام می‌شود؛ هیچ داده‌ای حذف نمی‌گردد. ادامه می‌دهید؟'
            : 'با جایگزینی کامل، همه داده‌های فعلی شما حذف و با فایل پشتیبان عوض می‌شود. ادامه می‌دهید؟'
        }
        confirmLabel={pendingImport?.mode === 'merge' ? 'ادغام و واردکردن' : 'جایگزینی کامل'}
        danger={pendingImport?.mode === 'replace'}
        onConfirm={() => void runImport()}
        onCancel={() => setPendingImport(null)}
      />

      <ConfirmDialog
        open={pendingReset}
        title="بازنشانی تنظیمات کتاب‌خوان؟"
        message="همه تنظیمات مطالعه (تم، اندازه فونت، فاصله‌ها و…) به حالت پیش‌فرض برمی‌گردند."
        confirmLabel="بازنشانی"
        onConfirm={() => {
          personal.setReaderSettings(DEFAULT_READER_SETTINGS);
          setPendingReset(false);
          toast('تنظیمات کتاب‌خوان بازنشانی شد', 'success');
        }}
        onCancel={() => setPendingReset(false)}
      />

      <ConfirmDialog
        open={confirmClear === 'history'}
        title="پاک‌کردن تاریخچه مطالعه؟"
        message="فهرست «آخرین مطالعه‌ها» پاک می‌شود؛ نشانک‌ها و پیشرفت مطالعه باقی می‌مانند."
        confirmLabel="پاک‌کردن"
        danger
        onConfirm={async () => {
          setConfirmClear(null);
          for (const h of personal.history) await repo.removeHistoryEntry(h.bookId);
          await personal.refresh();
          toast('تاریخچه پاک شد', 'success');
        }}
        onCancel={() => setConfirmClear(null)}
      />

      <ConfirmDialog
        open={confirmClear === 'all'}
        title="پاک‌کردن همه داده‌های شخصی؟"
        message="پیشرفت مطالعه، نشانک‌ها، علاقه‌مندی‌ها، تاریخچه و تنظیمات شما به‌طور کامل از مرورگر حذف می‌شوند. این عمل قابل بازگشت نیست."
        confirmLabel="همه را پاک کن"
        danger
        onConfirm={async () => {
          setConfirmClear(null);
          await clearAll();
          await personal.refresh();
          toast('همه داده‌های شخصی پاک شدند', 'success');
        }}
        onCancel={() => setConfirmClear(null)}
      />
    </div>
  );
}

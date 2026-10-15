import { useRef, useState } from 'react';
import {
  BookText,
  Database,
  DownloadCloud,
  Eraser,
  ImagePlus,
  Moon,
  Palette,
  RotateCcw,
  ShieldCheck,
  Sun,
  Trash2,
  Type,
  UploadCloud,
} from 'lucide-react';
import { usePersonalData } from '@/hooks/usePersonalData';
import { useTheme } from '@/hooks/useTheme';
import type { ReaderSettings, ReaderTheme } from '@/types';
import { DEFAULT_READER_SETTINGS } from '@/types';
import * as repo from '@/storage/repositories';
import { clearAll } from '@/storage/db';
import { ConfirmDialog } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { useDocumentTitle } from '@/hooks/misc';
import { THEME_PALETTES } from '@/reader/readerSettings';

function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`toggle-switch ${disabled ? 'disabled' : ''}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

function Slider({
  id,
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`setting-row ${disabled ? 'muted-row' : ''}`}>
      <div className="label">{label}</div>
      <div className="control slider-control">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <output>{format(value)}</output>
      </div>
    </div>
  );
}

const THEME_KEYS: Exclude<ReaderTheme, 'custom'>[] = [
  'dark', 'light', 'sepia', 'midnight', 'mocha', 'sage', 'slate',
];

export default function SettingsPage() {
  useDocumentTitle('تنظیمات');
  const personal = usePersonalData();
  const { theme, toggle: toggleTheme } = useTheme();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const fontFileRef = useRef<HTMLInputElement>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);

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

  const onBgFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast('فقط فایل تصویری انتخاب کنید', 'error');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast('حجم تصویر نباید بیش از ۴ مگابایت باشد', 'error');
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    }).catch(() => null);
    if (!dataUrl) {
      toast('خواندن تصویر ناموفق بود', 'error');
      return;
    }
    setS({ bgImageUrl: dataUrl, theme: 'custom' });
    toast('تصویر پس‌زمینه اعمال شد', 'success');
  };

  const onFontFile = async (file: File) => {
    if (file.size > 6 * 1024 * 1024) {
      toast('حجم فونت نباید بیش از ۶ مگابایت باشد', 'error');
      return;
    }
    const ext = file.name.toLowerCase().split('.').pop() ?? '';
    if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext)) {
      toast('قالب پشتیبانی نمی‌شود (ttf، otf، woff، woff2)', 'error');
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    }).catch(() => null);
    if (!dataUrl) {
      toast('خواندن فایل فونت ناموفق بود', 'error');
      return;
    }
    const format = ext === 'woff2' ? 'woff2' : ext === 'woff' ? 'woff' : ext === 'otf' ? 'opentype' : 'truetype';
    const name = file.name.replace(/\.[^.]+$/, '').slice(0, 40);
    const font = await personal.addCustomFont({ name, dataUrl, format, size: file.size });
    setS({ fontFamily: 'custom', customFontId: font.id });
    toast(`فونت «${name}» اضافه شد`, 'success');
  };

  return (
    <div>
      <div className="section-head">
        <h2>تنظیمات</h2>
      </div>

      {/* ظاهر سایت */}
      <div className="settings-card">
        <h2>
          <Moon size={19} /> ظاهر سایت
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

        <div className="setting-row col">
          <div className="label">تم مطالعه</div>
          <div className="control theme-grid" role="group" aria-label="تم مطالعه">
            {THEME_KEYS.map((t) => {
              const p = THEME_PALETTES[t];
              return (
                <button
                  key={t}
                  type="button"
                  className={`theme-swatch compact ${s.theme === t ? 'on' : ''}`}
                  style={{ background: p.bg, color: p.fg }}
                  onClick={() => setS({ theme: t })}
                  aria-pressed={s.theme === t}
                >
                  <span className="ts-a">آ</span>
                  <span className="ts-name">{p.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              className={`theme-swatch compact ${s.theme === 'custom' ? 'on' : ''}`}
              style={{ background: s.bgColor ?? '#14161b', color: s.textColor ?? '#d9dde5' }}
              onClick={() => setS({ theme: 'custom' })}
              aria-pressed={s.theme === 'custom'}
            >
              <span className="ts-a">آ</span>
              <span className="ts-name">سفارشی</span>
            </button>
          </div>
        </div>

        {s.theme === 'custom' && (
          <div className="setting-row">
            <div>
              <div className="label">رنگ‌های سفارشی</div>
              <div className="hint">رنگ متن و پس‌زمینه صفحه مطالعه.</div>
            </div>
            <div className="control color-row">
              <label className="color-pick">
                <span>متن</span>
                <input
                  type="color"
                  value={s.textColor ?? '#d9dde5'}
                  onChange={(e) => setS({ textColor: e.target.value })}
                  aria-label="رنگ متن"
                />
              </label>
              <label className="color-pick">
                <span>پس‌زمینه</span>
                <input
                  type="color"
                  value={s.bgColor ?? '#14161b'}
                  onChange={(e) => setS({ bgColor: e.target.value })}
                  aria-label="رنگ پس‌زمینه"
                />
              </label>
            </div>
          </div>
        )}

        {/* تصویر پس‌زمینه */}
        <div className="setting-row col">
          <div>
            <div className="label">تصویر پس‌زمینه مطالعه</div>
            <div className="hint">یک تصویر پشت متن کتاب قرار می‌گیرد؛ شفافیت پشت متن قابل تنظیم است.</div>
          </div>
          <div className="control">
            {s.bgImageUrl ? (
              <div className="bgimg-preview small">
                <img src={s.bgImageUrl} alt="پیش‌نمایش تصویر پس‌زمینه" />
                <div className="bgimg-actions">
                  <button type="button" className="btn small" onClick={() => bgFileRef.current?.click()}>
                    <ImagePlus size={13} /> تغییر
                  </button>
                  <button type="button" className="btn small danger" onClick={() => setS({ bgImageUrl: null })}>
                    <Trash2 size={13} /> حذف
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn" onClick={() => bgFileRef.current?.click()}>
                <ImagePlus size={15} /> افزودن تصویر
              </button>
            )}
          </div>
        </div>

        {s.bgImageUrl && (
          <Slider
            id="ns-set-bgopacity"
            label="شفافیت پشت متن (با تصویر پس‌زمینه)"
            value={Math.round(s.bgImageOpacity * 100)}
            min={0}
            max={100}
            step={5}
            format={(v) => `${v}٪`}
            onChange={(v) => setS({ bgImageOpacity: v / 100 })}
          />
        )}

        <div className="setting-row">
          <div>
            <div className="label">حالت نمایش</div>
            <div className="hint">پیمایشی برای فصل‌های بلند و موبایل مناسب‌تر است.</div>
          </div>
          <div className="control seg-group" role="group" aria-label="حالت نمایش">
            <button
              type="button"
              className={`seg-btn ${s.readingMode === 'scrolled' ? 'on' : ''}`}
              onClick={() => setS({ readingMode: 'scrolled' })}
            >
              پیمایشی
            </button>
            <button
              type="button"
              className={`seg-btn ${s.readingMode === 'paginated' ? 'on' : ''}`}
              onClick={() => setS({ readingMode: 'paginated' })}
            >
              صفحه‌بندی‌شده
            </button>
          </div>
        </div>

        <div className="setting-row">
          <div className="label">جهت متن پیش‌فرض</div>
          <div className="control seg-group" role="group" aria-label="جهت متن">
            {(['rtl', 'auto', 'ltr'] as const).map((d) => (
              <button key={d} type="button" className={`seg-btn ${s.direction === d ? 'on' : ''}`} onClick={() => setS({ direction: d })}>
                {d === 'rtl' ? 'راست‌به‌چپ' : d === 'auto' ? 'خودکار' : 'چپ‌به‌راست'}
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

        {/* فونت */}
        <div className="setting-row col">
          <div>
            <div className="label">
              <Type size={13} style={{ verticalAlign: '-2px' }} /> فونت مطالعه
            </div>
            <div className="hint">فونت پیش‌فرض وزیرمتن است. فونت دلخواه خودتان را هم می‌توانید آپلود کنید.</div>
          </div>
          <div className="control" style={{ width: '100%' }}>
            <select
              className="select"
              value={s.fontFamily === 'custom' ? `custom:${s.customFontId ?? ''}` : s.fontFamily}
              onChange={(e) => {
                const v = e.target.value;
                if (v.startsWith('custom:')) {
                  setS({ fontFamily: 'custom', customFontId: v.slice(7) || null });
                } else {
                  setS({ fontFamily: v as ReaderSettings['fontFamily'] });
                }
              }}
              aria-label="انتخاب فونت"
            >
              <option value="vazirmatn">وزیرمتن (پیش‌فرض)</option>
              <option value="sahel">ساحل</option>
              <option value="shabnam">شبنم</option>
              <option value="estedad">استعداد</option>
              <option value="amiri">امیری (سریف کتابی)</option>
              <option value="naskh">نسخ (سریف)</option>
              <option value="default">فونت خود کتاب</option>
              {personal.customFonts.map((f) => (
                <option key={f.id} value={`custom:${f.id}`}>
                  فونت من: {f.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {personal.customFonts.length > 0 && (
          <div className="setting-row col">
            <div className="label">فونت‌های آپلودشده</div>
            <div className="control font-chip-list">
              {personal.customFonts.map((f) => (
                <span key={f.id} className="chip">
                  {f.name}
                  <button
                    type="button"
                    className="chip-del"
                    aria-label={`حذف فونت ${f.name}`}
                    onClick={() => void personal.deleteCustomFont(f.id)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="setting-row">
          <div>
            <div className="label">آپلود فونت دلخواه</div>
            <div className="hint">قالب‌های ttf، otf، woff و woff2؛ تا ۶ مگابایت (حداکثر ۱۰ فونت).</div>
          </div>
          <div className="control">
            <button type="button" className="btn" onClick={() => fontFileRef.current?.click()}>
              <UploadCloud size={15} /> انتخاب فایل فونت
            </button>
          </div>
        </div>

        <Slider
          id="ns-set-fsize"
          label="اندازه فونت"
          value={s.fontSize}
          min={70}
          max={220}
          step={5}
          format={(v) => `${v}٪`}
          onChange={(v) => setS({ fontSize: v })}
        />
        <Slider
          id="ns-set-lh"
          label="فاصله خطوط"
          value={s.lineHeight}
          min={1.3}
          max={2.6}
          step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={(v) => setS({ lineHeight: v })}
        />
        <Slider
          id="ns-set-ps"
          label="فاصله پاراگراف‌ها"
          value={s.paragraphSpacing}
          min={0}
          max={2}
          step={0.1}
          format={(v) => `${v.toFixed(1)}em`}
          onChange={(v) => setS({ paragraphSpacing: v })}
        />
        <Slider
          id="ns-set-ws"
          label="فاصله کلمات از هم"
          value={s.wordSpacing}
          min={0}
          max={10}
          step={0.5}
          format={(v) => `${v}px`}
          onChange={(v) => setS({ wordSpacing: v })}
        />
        <Slider
          id="ns-set-mw"
          label="عرض ستون متن (پیمایشی)"
          value={s.maxWidth}
          min={28}
          max={70}
          step={2}
          format={(v) => `${v}rem`}
          onChange={(v) => setS({ maxWidth: v })}
          disabled={s.readingMode !== 'scrolled'}
        />
        <Slider
          id="ns-set-pm"
          label="حاشیه صفحه (پیمایشی)"
          value={s.pageMargin}
          min={0}
          max={72}
          step={4}
          format={(v) => `${v}px`}
          onChange={(v) => setS({ pageMargin: v })}
          disabled={s.readingMode !== 'scrolled'}
        />
      </div>

      {/* اسکرول خودکار */}
      <div className="settings-card">
        <h2>
          <Palette size={19} /> اسکرول خودکار
        </h2>
        <p className="desc">
          متن به‌آرامی جلو می‌رود و بدون دست خواندن راحت می‌شود. با لمس صفحه یا چرخ موس، موقتاً متوقف و پس از چند
          ثانیه ادامه می‌یابد.
        </p>
        <div className="setting-row">
          <div>
            <div className="label">اسکرول خودکار</div>
            <div className="hint">فقط در حالت پیمایشی فعال است.</div>
          </div>
          <div className="control">
            <Toggle
              checked={s.autoScroll}
              onChange={(v) => setS({ autoScroll: v })}
              label="اسکرول خودکار"
              disabled={s.readingMode !== 'scrolled'}
            />
          </div>
        </div>
        <Slider
          id="ns-set-spd"
          label="سرعت اسکرول خودکار"
          value={s.autoScrollSpeed}
          min={10}
          max={160}
          step={5}
          format={(v) => `${v}px/s`}
          onChange={(v) => setS({ autoScrollSpeed: v })}
          disabled={!s.autoScroll || s.readingMode !== 'scrolled'}
        />
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

      {/* inputهای مخفی فایل */}
      <input
        ref={fontFileRef}
        type="file"
        accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFontFile(f);
          e.target.value = '';
        }}
      />
      <input
        ref={bgFileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onBgFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

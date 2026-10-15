import { useRef } from 'react';
import {
  Check,
  Contrast,
  ImageIcon,
  Palette,
  Plus,
  RotateCcw,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';
import type { CustomFont, ReaderSettings, ReaderTheme } from '@/types';
import { THEME_PALETTES } from './readerSettings';
import { useToast } from '@/components/Toast';

interface ReaderSettingsPanelProps {
  settings: ReaderSettings;
  onSettingsChange: (s: ReaderSettings) => void;
  customFonts: CustomFont[];
  onAddCustomFont: (f: Omit<CustomFont, 'id' | 'createdAt'>) => Promise<CustomFont>;
  onDeleteCustomFont: (id: string) => Promise<void>;
  onReset: () => void;
  isScrolled: boolean;
}

const THEME_ORDER: Exclude<ReaderTheme, 'custom'>[] = [
  'dark', 'light', 'sepia', 'midnight', 'mocha', 'sage', 'slate',
];

const FONT_OPTIONS: { key: ReaderSettings['fontFamily']; label: string; css?: string }[] = [
  { key: 'vazirmatn', label: 'وزیرمتن', css: "'Vazirmatn', sans-serif" },
  { key: 'sahel', label: 'ساحل', css: "'Sahel', 'Vazirmatn', sans-serif" },
  { key: 'shabnam', label: 'شبنم', css: "'Shabnam', 'Vazirmatn', sans-serif" },
  { key: 'estedad', label: 'استعداد', css: "'Estedad', 'Vazirmatn', sans-serif" },
  { key: 'amiri', label: 'امیری (سریف کتابی)', css: "'Amiri', serif" },
  { key: 'naskh', label: 'نسخ (سریف)', css: "'Noto Naskh Arabic', 'Amiri', serif" },
  { key: 'default', label: 'فونت خود کتاب', css: 'inherit' },
];

export default function ReaderSettingsPanel({
  settings,
  onSettingsChange,
  customFonts,
  onAddCustomFont,
  onDeleteCustomFont,
  onReset,
  isScrolled,
}: ReaderSettingsPanelProps) {
  const { toast } = useToast();
  const fontFileRef = useRef<HTMLInputElement>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<ReaderSettings>) => onSettingsChange({ ...settings, ...patch });

  const selectCustomTheme = () => {
    // اولین ورود به تم سفارشی: رنگ‌ها از تم فعلی شروع می‌شوند تا پرش رنگ نداشته باشیم
    if (settings.theme !== 'custom') set({ theme: 'custom' });
  };

  const onFontFile = async (file: File) => {
    if (file.size > 6 * 1024 * 1024) {
      toast('حجم فونت نباید بیش از ۶ مگابایت باشد', 'error');
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      const ext = file.name.toLowerCase().split('.').pop() ?? '';
      if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext)) {
        toast('قالب فونت پشتیبانی نمی‌شود (ttf، otf، woff، woff2)', 'error');
        return;
      }
      const format = ext === 'woff2' ? 'woff2' : ext === 'woff' ? 'woff' : ext === 'otf' ? 'opentype' : 'truetype';
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 40);
      const font = await onAddCustomFont({ name, dataUrl, format, size: file.size });
      onSettingsChange({ ...settings, fontFamily: 'custom', customFontId: font.id });
      toast(`فونت «${name}» اضافه شد`, 'success');
    } catch {
      toast('خواندن فایل فونت ناموفق بود', 'error');
    }
  };

  const onBgFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast('فقط فایل تصویری انتخاب کنید', 'error');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast('حجم تصویر پس‌زمینه نباید بیش از ۴ مگابایت باشد', 'error');
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      set({ bgImageUrl: dataUrl, theme: 'custom' });
      toast('تصویر پس‌زمینه اعمال شد', 'success');
    } catch {
      toast('خواندن تصویر ناموفق بود', 'error');
    }
  };

  const activeFontKey: string =
    settings.fontFamily === 'custom' ? `custom:${settings.customFontId ?? ''}` : settings.fontFamily;

  return (
    <div className="rsp">
      {/* ---------- تم مطالعه ---------- */}
      <section className="rsp-group">
        <h4 className="rsp-title">
          <Palette size={15} /> تم مطالعه
        </h4>
        <div className="theme-grid" role="radiogroup" aria-label="تم مطالعه">
          {THEME_ORDER.map((t) => {
            const p = THEME_PALETTES[t];
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={settings.theme === t}
                className={`theme-swatch ${settings.theme === t ? 'on' : ''}`}
                style={{ background: p.bg, color: p.fg }}
                onClick={() => set({ theme: t })}
              >
                <span className="ts-a">آ</span>
                <span className="ts-line" style={{ background: p.fg, opacity: 0.75 }} />
                <span className="ts-name">{p.label}</span>
                {settings.theme === t && (
                  <span className="ts-check">
                    <Check size={12} />
                  </span>
                )}
              </button>
            );
          })}
          {/* تم سفارشی */}
          <button
            type="button"
            role="radio"
            aria-checked={settings.theme === 'custom'}
            className={`theme-swatch custom ${settings.theme === 'custom' ? 'on' : ''}`}
            style={{
              background: settings.bgColor ?? '#14161b',
              color: settings.textColor ?? '#d9dde5',
            }}
            onClick={selectCustomTheme}
          >
            <span className="ts-a">آ</span>
            <span className="ts-line" style={{ background: settings.textColor ?? '#d9dde5', opacity: 0.75 }} />
            <span className="ts-name">سفارشی</span>
            {settings.theme === 'custom' && (
              <span className="ts-check">
                <Check size={12} />
              </span>
            )}
          </button>
        </div>

        {settings.theme === 'custom' && (
          <div className="color-row">
            <label className="color-pick">
              <span>رنگ متن</span>
              <input
                type="color"
                value={settings.textColor ?? '#d9dde5'}
                onChange={(e) => set({ textColor: e.target.value })}
                aria-label="رنگ متن"
              />
            </label>
            <label className="color-pick">
              <span>رنگ پس‌زمینه</span>
              <input
                type="color"
                value={settings.bgColor ?? '#14161b'}
                onChange={(e) => set({ bgColor: e.target.value })}
                aria-label="رنگ پس‌زمینه"
              />
            </label>
          </div>
        )}
      </section>

      {/* ---------- پس‌زمینه تصویری ---------- */}
      <section className="rsp-group">
        <h4 className="rsp-title">
          <ImageIcon size={15} /> تصویر پس‌زمینه
        </h4>
        {settings.bgImageUrl ? (
          <div className="bgimg-preview">
            <img src={settings.bgImageUrl} alt="پیش‌نمایش تصویر پس‌زمینه" />
            <div className="bgimg-actions">
              <button type="button" className="seg-btn" onClick={() => bgFileRef.current?.click()}>
                <ImageIcon size={13} /> تغییر تصویر
              </button>
              <button
                type="button"
                className="seg-btn danger"
                onClick={() => set({ bgImageUrl: null })}
              >
                <Trash2 size={13} /> حذف
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="seg-btn block" onClick={() => bgFileRef.current?.click()}>
            <Plus size={14} /> افزودن تصویر پس‌زمینه
          </button>
        )}
        {settings.bgImageUrl && (
          <div className="slider-row">
            <label htmlFor="ns-bgopacity">شفافیت پشت متن</label>
            <input
              id="ns-bgopacity"
              type="range"
              className="setting-slider"
              min={0}
              max={100}
              step={5}
              value={Math.round(settings.bgImageOpacity * 100)}
              onChange={(e) => set({ bgImageOpacity: Number(e.target.value) / 100 })}
            />
            <output>{Math.round(settings.bgImageOpacity * 100)}٪</output>
          </div>
        )}
        {settings.bgImageUrl && !isScrolled && (
          <p className="rsp-hint">تصویر پس‌زمینه در حالت پیمایشی بهتر دیده می‌شود.</p>
        )}
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
      </section>

      {/* ---------- حالت نمایش و جهت ---------- */}
      <section className="rsp-group">
        <h4 className="rsp-title">
          <Contrast size={15} /> نمایش و جهت
        </h4>
        <div className="seg-group" role="group" aria-label="حالت نمایش">
          <button
            type="button"
            className={`seg-btn ${settings.readingMode === 'paginated' ? 'on' : ''}`}
            onClick={() => set({ readingMode: 'paginated' })}
          >
            صفحه‌بندی‌شده
          </button>
          <button
            type="button"
            className={`seg-btn ${settings.readingMode === 'scrolled' ? 'on' : ''}`}
            onClick={() => set({ readingMode: 'scrolled' })}
          >
            پیمایشی
          </button>
        </div>
        <div className="seg-group" role="group" aria-label="جهت متن" style={{ marginTop: '0.45rem' }}>
          <button
            type="button"
            className={`seg-btn ${settings.direction === 'rtl' ? 'on' : ''}`}
            onClick={() => set({ direction: 'rtl' })}
          >
            راست‌به‌چپ
          </button>
          <button
            type="button"
            className={`seg-btn ${settings.direction === 'auto' ? 'on' : ''}`}
            onClick={() => set({ direction: 'auto' })}
          >
            خودکار
          </button>
          <button
            type="button"
            className={`seg-btn ${settings.direction === 'ltr' ? 'on' : ''}`}
            onClick={() => set({ direction: 'ltr' })}
          >
            چپ‌به‌راست
          </button>
        </div>
        <div className="seg-group" role="group" aria-label="ترازبندی" style={{ marginTop: '0.45rem' }}>
          {(['justify', 'start', 'center'] as const).map((a) => (
            <button
              key={a}
              type="button"
              className={`seg-btn ${settings.textAlign === a ? 'on' : ''}`}
              onClick={() => set({ textAlign: a })}
            >
              {a === 'justify' ? 'هم‌تراز' : a === 'start' ? 'ابتدای سطر' : 'وسط'}
            </button>
          ))}
        </div>
      </section>

      {/* ---------- فونت ---------- */}
      <section className="rsp-group">
        <h4 className="rsp-title">
          <Type size={15} /> فونت
        </h4>
        <div className="font-list" role="radiogroup" aria-label="انتخاب فونت">
          {FONT_OPTIONS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="radio"
              aria-checked={activeFontKey === f.key}
              className={`font-card ${activeFontKey === f.key ? 'on' : ''}`}
              style={f.css ? { fontFamily: f.css } : undefined}
              onClick={() => set({ fontFamily: f.key })}
            >
              <span className="fc-sample" aria-hidden="true">
                ب
              </span>
              <span className="fc-name">{f.label}</span>
              {activeFontKey === f.key && (
                <span className="fc-check">
                  <Check size={13} />
                </span>
              )}
            </button>
          ))}
          {/* فونت‌های سفارشی کاربر */}
          {customFonts.map((cf) => (
            <button
              key={cf.id}
              type="button"
              role="radio"
              aria-checked={settings.fontFamily === 'custom' && settings.customFontId === cf.id}
              className={`font-card custom ${settings.fontFamily === 'custom' && settings.customFontId === cf.id ? 'on' : ''}`}
              onClick={() => set({ fontFamily: 'custom', customFontId: cf.id })}
            >
              <span className="fc-sample" aria-hidden="true">
                ب
              </span>
              <span className="fc-name">{cf.name}</span>
              <span
                className="fc-del"
                role="button"
                tabIndex={0}
                aria-label={`حذف فونت ${cf.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void onDeleteCustomFont(cf.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    void onDeleteCustomFont(cf.id);
                  }
                }}
              >
                <Trash2 size={13} />
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="seg-btn block"
          style={{ marginTop: '0.55rem' }}
          onClick={() => fontFileRef.current?.click()}
        >
          <Upload size={13} /> آپلود فونت دلخواه (ttf، otf، woff)
        </button>
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
      </section>

      {/* ---------- ابعاد و فاصله‌ها ---------- */}
      <section className="rsp-group">
        <h4 className="rsp-title">ابعاد و فاصله‌ها</h4>
        <div className="slider-row">
          <label htmlFor="ns-fsize">اندازه فونت</label>
          <input
            id="ns-fsize"
            type="range"
            className="setting-slider"
            min={70}
            max={220}
            step={5}
            value={settings.fontSize}
            onChange={(e) => set({ fontSize: Number(e.target.value) })}
          />
          <output>{settings.fontSize}٪</output>
        </div>
        <div className="slider-row">
          <label htmlFor="ns-lh">فاصله خطوط</label>
          <input
            id="ns-lh"
            type="range"
            className="setting-slider"
            min={1.3}
            max={2.6}
            step={0.1}
            value={settings.lineHeight}
            onChange={(e) => set({ lineHeight: Number(e.target.value) })}
          />
          <output>{settings.lineHeight.toFixed(1)}</output>
        </div>
        <div className="slider-row">
          <label htmlFor="ns-ps">فاصله پاراگراف‌ها</label>
          <input
            id="ns-ps"
            type="range"
            className="setting-slider"
            min={0}
            max={2}
            step={0.1}
            value={settings.paragraphSpacing}
            onChange={(e) => set({ paragraphSpacing: Number(e.target.value) })}
          />
          <output>{settings.paragraphSpacing.toFixed(1)}em</output>
        </div>
        <div className="slider-row">
          <label htmlFor="ns-ws">فاصله کلمات</label>
          <input
            id="ns-ws"
            type="range"
            className="setting-slider"
            min={0}
            max={10}
            step={0.5}
            value={settings.wordSpacing}
            onChange={(e) => set({ wordSpacing: Number(e.target.value) })}
          />
          <output>{settings.wordSpacing}px</output>
        </div>
        <div className="slider-row">
          <label htmlFor="ns-mw">عرض ستون متن</label>
          <input
            id="ns-mw"
            type="range"
            className="setting-slider"
            min={28}
            max={70}
            step={2}
            value={settings.maxWidth}
            onChange={(e) => set({ maxWidth: Number(e.target.value) })}
            disabled={!isScrolled}
          />
          <output>{isScrolled ? `${settings.maxWidth}rem` : '—'}</output>
        </div>
        <div className="slider-row">
          <label htmlFor="ns-pm">حاشیه صفحه</label>
          <input
            id="ns-pm"
            type="range"
            className="setting-slider"
            min={0}
            max={72}
            step={4}
            value={settings.pageMargin}
            onChange={(e) => set({ pageMargin: Number(e.target.value) })}
            disabled={!isScrolled}
          />
          <output>{isScrolled ? `${settings.pageMargin}px` : '—'}</output>
        </div>
      </section>

      {/* ---------- اسکرول خودکار ---------- */}
      <section className="rsp-group">
        <h4 className="rsp-title">اسکرول خودکار</h4>
        {!isScrolled && (
          <p className="rsp-hint">اسکرول خودکار فقط در حالت پیمایشی فعال می‌شود.</p>
        )}
        <div className="switch-row">
          <label htmlFor="ns-auto">اسکرول خودکار متن</label>
          <button
            id="ns-auto"
            type="button"
            className="ns-switch"
            role="switch"
            aria-checked={settings.autoScroll && isScrolled}
            disabled={!isScrolled}
            onClick={() => set({ autoScroll: !settings.autoScroll })}
          >
            <span className="knob" />
          </button>
        </div>
        <div className="slider-row">
          <label htmlFor="ns-spd">سرعت اسکرول</label>
          <input
            id="ns-spd"
            type="range"
            className="setting-slider"
            min={10}
            max={160}
            step={5}
            value={settings.autoScrollSpeed}
            onChange={(e) => set({ autoScrollSpeed: Number(e.target.value) })}
            disabled={!isScrolled || !settings.autoScroll}
          />
          <output>{settings.autoScrollSpeed}px/s</output>
        </div>
      </section>

      {/* ---------- سایر ---------- */}
      <section className="rsp-group last">
        <div className="switch-row">
          <label htmlFor="ns-tb">نوار ابزار همیشه نمایان</label>
          <button
            id="ns-tb"
            type="button"
            className="ns-switch"
            role="switch"
            aria-checked={settings.showToolbar}
            onClick={() => set({ showToolbar: !settings.showToolbar })}
          >
            <span className="knob" />
          </button>
        </div>
        <button type="button" className="seg-btn danger block" onClick={onReset}>
          <RotateCcw size={13} /> بازنشانی همه تنظیمات
        </button>
      </section>
    </div>
  );
}

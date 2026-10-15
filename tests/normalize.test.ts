import { describe, it, expect } from 'vitest';
import { normalizeFa, faIncludes, toLatinDigits } from '../src/services/normalize';

describe('نرمال‌سازی فارسی برای جست‌وجو', () => {
  it('ی و ي عربی یکسان هستند', () => {
    expect(normalizeFa('كتاب')).toBe(normalizeFa('کتاب'));
    expect(faIncludes('این یک کتاب است', 'كتاب')).toBe(true);
  });

  it('ک و ك عربی یکسان هستند', () => {
    expect(faIncludes('کیفیت', 'كيفيت')).toBe(true);
  });

  it('اعراب حذف می‌شود', () => {
    expect(faIncludes('مُتَشَابِه', 'متشابه')).toBe(true);
  });

  it('نیم‌فاصله و فاصله‌های اضافه مدیریت می‌شوند', () => {
    expect(faIncludes('می‌خوانم   کتاب', 'می خوانم کتاب')).toBe(true);
  });

  it('ارقام فارسی و عربی به لاتین تبدیل می‌شوند', () => {
    expect(toLatinDigits('۱۲۳')).toBe('123');
    expect(toLatinDigits('٤٥٦')).toBe('456');
    expect(faIncludes('جلد ۲', 'جلد 2')).toBe(true);
  });

  it('کشیده (تطویل) نادیده گرفته می‌شود', () => {
    expect(faIncludes('ســـلام', 'سلام')).toBe(true);
  });

  it('حروف بزرگ لاتین بی‌اثرند', () => {
    expect(faIncludes('Alice in Wonderland', 'alice')).toBe(true);
  });

  it('عبارت خالی با همه چیز تطبیق دارد', () => {
    expect(faIncludes('هر چیزی', '')).toBe(true);
  });

  it('ترکیب‌های ناهمسان با خط تیره پیدا می‌شوند', () => {
    expect(faIncludes('Dune-Messiah', 'dune messiah')).toBe(true);
  });
});

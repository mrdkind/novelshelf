import { useMemo } from 'react';
import { Heart } from 'lucide-react';
import { useCatalog } from '@/hooks/useCatalog';
import { usePersonalData } from '@/hooks/usePersonalData';
import { BookGrid } from '@/components/BookCard';
import { BookGridSkeleton, EmptyBox } from '@/components/StateBoxes';
import { useDocumentTitle } from '@/hooks/misc';

export default function FavoritesPage() {
  useDocumentTitle('علاقه‌مندی‌ها');
  const { novels, status } = useCatalog();
  const { favorites, ready } = usePersonalData();

  const favNovels = useMemo(() => novels.filter((n) => favorites.has(n.id)), [novels, favorites]);

  return (
    <div>
      <div className="section-head">
        <h2>
          <Heart size={20} /> علاقه‌مندی‌ها
        </h2>
      </div>

      {status === 'loading' || !ready ? (
        <BookGridSkeleton />
      ) : favNovels.length === 0 ? (
        <EmptyBox
          title="هنوز کتابی به علاقه‌مندی‌ها اضافه نشده"
          message="در صفحه هر کتاب، دکمه «افزودن به علاقه‌مندی‌ها» را بزنید تا اینجا نمایش داده شود. علاقه‌مندی‌ها فقط در مرورگر شما ذخیره می‌شوند."
        />
      ) : (
        <BookGrid novels={favNovels} favorites={favorites} />
      )}
    </div>
  );
}

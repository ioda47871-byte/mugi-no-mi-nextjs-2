'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ProductCard } from '@/components/ui/ProductCard';
import { MENU_FILTERS, matchesMenuFilter, parseMenuFilterKey, type MenuFilterKey, type Product } from '@/lib/products';

interface MenuBrowserProps {
  products: Product[];
}

/**
 * カテゴリー(食パン/惣菜パン/菓子パン/食事パン)+ 季節限定を横断的に
 * 絞り込めるフィルターUI。「季節限定」はカテゴリーをまたいでis_seasonalで絞り込む
 * 特別な選択肢(matchesMenuFilter参照)。
 *
 * 初期選択タブは、URLの ?category= クエリパラメータ(CraftMiniCardsの
 * カテゴリーカードから遷移してきた場合など)から決定する。useSearchParams()を
 * 使うことで、/menuページ自体はISRの静的生成を保ったまま(searchParamsを
 * サーバー側で読まない)、このクライアントコンポーネントだけがURLの変化に
 * 反応できる(呼び出し側でSuspenseに包む必要がある。MenuSection.tsx参照)。
 * ブラウザの戻る/進むでcategoryが変化した場合もuseEffectで追従する。
 *
 * Home埋め込みのMenuセクション・独立した/menuページの両方から
 * 同じコンポーネントを利用しています。
 */
export function MenuBrowser({ products }: MenuBrowserProps) {
  const searchParams = useSearchParams();
  const [active, setActive] = useState<MenuFilterKey>(() => parseMenuFilterKey(searchParams.get('category')));

  useEffect(() => {
    setActive(parseMenuFilterKey(searchParams.get('category')));
  }, [searchParams]);

  const filtered = useMemo(
    () => products.filter((p) => matchesMenuFilter(p, active)),
    [products, active],
  );

  return (
    <div>
      <div
        className="mb-12 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] max-[640px]:flex-nowrap max-[640px]:-mx-5 max-[640px]:px-5 [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="商品カテゴリーで絞り込み"
      >
        {MENU_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            role="tab"
            aria-selected={active === filter.key}
            onClick={() => setActive(filter.key)}
            className={`min-h-[44px] shrink-0 rounded-full border px-6 py-3 text-[13px] tracking-wide transition-all duration-300 ease-signature ${
              active === filter.key
                ? 'border-ink bg-ink text-brand-pale'
                : 'border-line text-ink hover:border-ink hover:bg-ink hover:text-brand-pale'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-kura">
          個別の商品情報は準備中です。店頭にてぜひご覧ください。
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-x-8 gap-y-14 max-[900px]:grid-cols-2 max-[900px]:gap-x-6 max-[560px]:grid-cols-1">
          {filtered.map((product, i) => (
            <ProductCard key={product.id} product={product} priority={i < 3} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * MenuBrowserはuseSearchParams()を使うためSuspenseで包む必要がある
 * (MenuSection.tsx参照)。ビルド時プリレンダーの一瞬だけ表示されうる
 * フォールバックで、実際のハイドレーションはほぼ即時のため通常は
 * 目に触れない。タブ部分の形だけ再現し、レイアウトシフトを防ぐ。
 */
export function MenuBrowserSkeleton() {
  return (
    <div>
      <div className="mb-12 flex gap-2 overflow-x-auto pb-1 max-[640px]:flex-nowrap" aria-hidden>
        {MENU_FILTERS.map((filter) => (
          <span
            key={filter.key}
            className={`min-h-[44px] shrink-0 rounded-full border px-6 py-3 text-[13px] tracking-wide ${
              filter.key === 'all' ? 'border-ink bg-ink text-brand-pale' : 'border-line text-ink'
            }`}
          >
            {filter.label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-x-8 gap-y-14 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="aspect-[4/5] animate-pulse rounded-[2px] bg-brand-pale/40" />
        ))}
      </div>
    </div>
  );
}

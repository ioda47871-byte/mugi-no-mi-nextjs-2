'use client';

import { useMemo, useState } from 'react';
import { ProductCard } from '@/components/ui/ProductCard';
import { MENU_FILTERS, matchesMenuFilter, type MenuFilterKey, type Product } from '@/lib/products';

interface MenuBrowserProps {
  products: Product[];
}

/**
 * カテゴリー(食パン/惣菜パン/菓子パン/食事パン)+ 季節限定を横断的に
 * 絞り込めるフィルターUI。「季節限定」はカテゴリーをまたいでis_seasonalで絞り込む
 * 特別な選択肢(matchesMenuFilter参照)。
 *
 * Home埋め込みのMenuセクション・独立した/menuページの両方から
 * 同じコンポーネントを利用しています。
 */
export function MenuBrowser({ products }: MenuBrowserProps) {
  const [active, setActive] = useState<MenuFilterKey>('all');

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
          該当する商品は準備中です。
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-x-8 gap-y-12 max-[900px]:grid-cols-2 max-[900px]:gap-x-6 max-[560px]:grid-cols-1">
          {filtered.map((product, i) => (
            <ProductCard key={product.id} product={product} priority={i < 3} />
          ))}
        </div>
      )}
    </div>
  );
}

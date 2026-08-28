import Link from 'next/link';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { WheatDecoration } from '@/components/ui/WheatDecoration';
import { WillowDecoration } from '@/components/ui/WillowDecoration';
import { MENU_FILTERS, type MenuFilterKey } from '@/lib/products';

/**
 * トップページの「カテゴリー導線セクション」。名称・並び順・遷移先は
 * Menuページのカテゴリー(lib/products.tsのMENU_FILTERS)と完全一致させる
 * (「すべて」は導線として不要なため除外)。
 *
 * 以前はここに「クロワッサン・デニッシュ」「甘いパン」のような、実際の
 * カテゴリーと1:1に対応しない独自の見出しを使っていたが、正式な5カテゴリー
 * (食パン/惣菜パン/菓子パン/食事パン/季節限定)に統一した。
 */
const NAV_ITEMS = MENU_FILTERS.filter(
  (f): f is { key: Exclude<MenuFilterKey, 'all'>; label: string } => f.key !== 'all',
);

/**
 * カテゴリーから探しやすくするための導線。おすすめ商品セクション
 * (FeaturedProducts)の下に置き、「見て興味を引く」→「カテゴリーから探す」
 * という流れを作る。カードクリックで/menuへ遷移し、該当カテゴリーで
 * 絞り込まれた状態になる(?category=クエリパラメータ。MenuBrowser.tsx参照)。
 * 見た目は罫線カードではなく、線画アイコン+ラベルの横並び(アイコンのみで
 * 十分に意味が伝わるため、英字ラベル・説明文は持たない軽量な表現)。
 */
export function CraftMiniCards() {
  return (
    <section className="relative overflow-hidden border-t border-line px-8 py-16 max-[640px]:px-5 max-[640px]:py-12">
      {/* ページ下部(次のStoreInfoStripとの境目)へ、柳が下から入り込んでくる装飾。
          canopyを上下反転させ、根元(かつてのグラデーション濃い側)を下端に置く。 */}
      <WillowDecoration
        variant="canopy"
        className="pointer-events-none absolute -bottom-16 left-1/2 hidden h-[420px] w-[520px] -translate-x-1/2 scale-y-[-1] text-gold/[0.14] min-[860px]:block"
      />

      <div className="relative mx-auto max-w-container">
        <RevealOnScroll>
          <div className="mb-10 flex items-center justify-center gap-3 text-center">
            <WheatDecoration lean="left" className="h-8 w-5 text-gold/45" />
            <h2 className="font-display text-lg tracking-[0.08em] text-ink">パンのカテゴリ</h2>
            <WheatDecoration lean="right" className="h-8 w-5 text-gold/45" />
          </div>
        </RevealOnScroll>
        <RevealOnScroll>
          <div className="flex flex-wrap items-start justify-center gap-x-14 gap-y-8 max-[640px]:gap-x-8">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.key}
                href={`/menu?category=${item.key}`}
                aria-label={`${item.label}を見る`}
                className="group flex flex-col items-center gap-3 text-center"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full border border-line text-brand-text transition-all duration-300 ease-signature group-hover:-translate-y-1 group-hover:border-brand-deep group-hover:text-brand-deep">
                  <CategoryIcon category={item.key} className="h-7 w-7" />
                </span>
                <span className="text-[13.5px] tracking-wide text-ink">{item.label}</span>
              </Link>
            ))}
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}

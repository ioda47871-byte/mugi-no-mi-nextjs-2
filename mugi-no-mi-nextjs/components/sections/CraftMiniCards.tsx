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
 * 見た目は「アプリのカテゴリボタン」(丸枠+汎用アイコン)ではなく、パン屋の
 * 品書き板のような横一列の意匠: 上にパンの線画、下にラベル、間を薄い罫線で
 * 区切った一枚の帯として見せている。ホバーはアイコンが少し浮く+ゴールドが
 * 濃くなる+下線が伸びる、の3つだけに留め、拡大や強い背景色は使わない。
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
          <div className="mb-10 flex items-center justify-center gap-4 text-center">
            <WheatDecoration variant="spray" lean="left" className="h-8 w-24 text-gold/55 max-[560px]:hidden" />
            <h2 className="font-display text-lg tracking-[0.08em] text-ink">パンのカテゴリ</h2>
            <WheatDecoration variant="spray" lean="right" className="h-8 w-24 text-gold/55 max-[560px]:hidden" />
          </div>
        </RevealOnScroll>
        <RevealOnScroll>
          <div className="overflow-hidden rounded-[10px] border border-gold/20 bg-[#FBF6EA]">
            <div className="flex divide-x divide-gold/15 max-[640px]:flex-col max-[640px]:divide-x-0 max-[640px]:divide-y">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.key}
                  href={`/menu?category=${item.key}`}
                  aria-label={`${item.label}を見る`}
                  className="group flex flex-1 flex-col items-center gap-3 px-4 py-9 text-center max-[640px]:flex-row max-[640px]:justify-start max-[640px]:gap-5 max-[640px]:px-6 max-[640px]:py-5"
                >
                  <span className="text-brand-text transition-transform duration-200 ease-out group-hover:-translate-y-1">
                    <CategoryIcon category={item.key} className="h-9 w-9 transition-colors duration-200 group-hover:text-brand-deep" />
                  </span>
                  <span className="relative pb-1.5 text-[13.5px] tracking-wide text-ink">
                    {item.label}
                    <span className="absolute -bottom-0 left-1/2 h-px w-0 -translate-x-1/2 bg-brand-deep transition-all duration-200 ease-out group-hover:w-full max-[640px]:left-0 max-[640px]:translate-x-0" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}

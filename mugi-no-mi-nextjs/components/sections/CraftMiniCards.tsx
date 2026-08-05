import Link from 'next/link';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import { MENU_FILTERS } from '@/lib/products';

/**
 * トップページの「カテゴリー導線セクション」。名称・並び順・遷移先は
 * Menuページのカテゴリー(lib/products.tsのMENU_FILTERS)と完全一致させる
 * (「すべて」は導線として不要なため除外)。
 *
 * 以前はここに「クロワッサン・デニッシュ」「甘いパン」のような、実際の
 * カテゴリーと1:1に対応しない独自の見出しを使っていたが、正式な5カテゴリー
 * (食パン/惣菜パン/菓子パン/食事パン/季節限定)に統一した。
 */
const NAV_ITEMS = MENU_FILTERS.filter((f) => f.key !== 'all');

const CATEGORY_EN: Record<string, string> = {
  shokupan: 'Shokupan',
  savory: 'Savory Bread',
  sweet: 'Sweet Bread',
  'meal-bread': 'Meal Bread',
  seasonal: 'Seasonal',
};

const CATEGORY_TEXT: Record<string, string> = {
  shokupan: '毎日の食卓に。',
  savory: '小腹を満たす一品。',
  sweet: 'おやつのひとときに。',
  'meal-bread': 'しっかり食べたい日に。',
  seasonal: 'その時期だけの味わい。',
};

/**
 * カテゴリーから探しやすくするための導線。おすすめ商品セクション
 * (FeaturedProducts)の下に置き、「見て興味を引く」→「カテゴリーから探す」
 * という流れを作る。カード全体が/menuへのリンクになっており、クリックすると
 * 該当カテゴリーで絞り込まれた状態のMenuへ遷移する(?category=クエリ
 * パラメータ。MenuBrowser.tsx参照)。
 */
export function CraftMiniCards() {
  return (
    <section className="px-8 py-24 max-[640px]:px-5 max-[640px]:py-16">
      <div className="mx-auto max-w-container">
        <RevealOnScroll>
          <SectionHeading
            eyebrow="Categories"
            title="カテゴリーから探す"
            description="食事に寄り添うパンから、軽いおやつに楽しめるパンまで。カテゴリーごとにご覧いただけます。"
          />
        </RevealOnScroll>
        <RevealOnScroll>
          <div className="grid grid-cols-3 gap-7 max-[760px]:min-[641px]:grid-cols-1 max-[640px]:grid-cols-2 max-[640px]:gap-4">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.key}
                href={`/menu?category=${item.key}`}
                aria-label={`${item.label}を見る`}
                className="group block rounded-[2px] border border-line bg-white p-8 transition-all duration-300 ease-signature hover:-translate-y-1 hover:border-brand-deep hover:shadow-[0_14px_30px_rgba(43,36,29,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deep"
              >
                <span className="font-accent text-[13px] tracking-wide text-gold">{CATEGORY_EN[item.key]}</span>
                <h3 className="mt-2.5 font-display text-[17px] leading-relaxed transition-colors duration-300 group-hover:text-brand-deep">
                  {item.label}
                </h3>
                <p className="mt-3 text-[13.5px] text-kura">{CATEGORY_TEXT[item.key]}</p>
              </Link>
            ))}
          </div>
        </RevealOnScroll>
        <div className="mt-9 text-center">
          <Link href="/menu" className="link-gold">パンを見る →</Link>
        </div>
      </div>
    </section>
  );
}

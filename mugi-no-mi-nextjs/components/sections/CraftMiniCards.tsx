import Link from 'next/link';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import type { MenuFilterKey } from '@/lib/products';

/**
 * categoryKeyはlib/products.tsのMenuFilterKey(実際のproducts.category_idと
 * 一致する値)をそのままURLクエリパラメータ(?category=)に使う。新しい
 * スラッグを別途定義せず既存のカテゴリーキーと1:1にすることで、
 * /menu側の変換ロジックを増やさずに済む。
 *
 * 「クロワッサン・デニッシュ」は独立したカテゴリーとしてはDBに存在しないため
 * (実カテゴリーは食パン/惣菜パン/菓子パン/食事パンの4種のみ)、最も近い
 * 「菓子パン(sweet)」へ割り当てている(甘いパンカードと同じ遷移先になる)。
 */
const items: { num: string; title: string; text: string; categoryKey: MenuFilterKey }[] = [
  { num: 'Meal Bread', title: '食事パン', text: '毎日の食卓に。', categoryKey: 'meal-bread' },
  { num: 'Croissant & Danish', title: 'クロワッサン・デニッシュ', text: '軽い一品に。', categoryKey: 'sweet' },
  { num: 'Savory Bread', title: '惣菜パン', text: '小腹を満たす一品。', categoryKey: 'savory' },
  { num: 'Sweet Bread', title: '甘いパン', text: 'おやつのひとときに。', categoryKey: 'sweet' },
  { num: 'Seasonal', title: '季節のパン', text: 'その時期だけの味わい。', categoryKey: 'seasonal' },
];

/**
 * 店頭に並ぶパンのカテゴリー紹介。カード全体が/menuへのリンクになっており、
 * クリックすると該当カテゴリーで絞り込まれた状態のMenuへ遷移する
 * (?category=クエリパラメータ。MenuBrowser.tsx参照)。
 * 特定の商品名・価格は確認が取れていないため掲載せず、カテゴリー表現に留めています。
 */
export function CraftMiniCards() {
  return (
    <section className="px-8 py-24 max-[640px]:px-5 max-[640px]:py-16">
      <div className="mx-auto max-w-container">
        <RevealOnScroll>
          <SectionHeading
            eyebrow="Lineup"
            title="店頭に並ぶパン"
            description="食事に寄り添うパンから、軽いおやつに楽しめるパンまで、店頭にはさまざまな種類が並びます。商品の内容や販売状況は日によって異なります。"
          />
        </RevealOnScroll>
        <RevealOnScroll>
          <div className="grid grid-cols-3 gap-7 max-[760px]:min-[641px]:grid-cols-1 max-[640px]:grid-cols-2 max-[640px]:gap-4">
            {items.map((item) => (
              <Link
                key={item.num}
                href={`/menu?category=${item.categoryKey}`}
                aria-label={`${item.title}を見る`}
                className="group block rounded-[2px] border border-line bg-white p-8 transition-all duration-300 ease-signature hover:-translate-y-1 hover:border-brand-deep hover:shadow-[0_14px_30px_rgba(43,36,29,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deep"
              >
                <span className="font-accent text-[13px] tracking-wide text-gold">{item.num}</span>
                <h3 className="mt-2.5 font-display text-[17px] leading-relaxed transition-colors duration-300 group-hover:text-brand-deep">
                  {item.title}
                </h3>
                <p className="mt-3 text-[13.5px] text-kura">{item.text}</p>
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

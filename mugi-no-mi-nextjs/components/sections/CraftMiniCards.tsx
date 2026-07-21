import Link from 'next/link';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';

const items = [
  { num: 'Meal Bread', title: '食事パン', text: '毎日の食卓に。' },
  { num: 'Croissant & Danish', title: 'クロワッサン・デニッシュ', text: '軽い一品に。' },
  { num: 'Savory Bread', title: '惣菜パン', text: '小腹を満たす一品。' },
  { num: 'Sweet Bread', title: '甘いパン', text: 'おやつのひとときに。' },
  { num: 'Seasonal', title: '季節のパン', text: 'その時期だけの味わい。' },
];

/**
 * 店頭に並ぶパンのカテゴリー紹介。
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
              <div key={item.num} className="rounded-[2px] border border-line bg-white p-8">
                <span className="font-accent text-[13px] tracking-wide text-gold">{item.num}</span>
                <h4 className="mt-2.5 font-display text-[17px] leading-relaxed">{item.title}</h4>
                <p className="mt-3 text-[13.5px] text-kura">{item.text}</p>
              </div>
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

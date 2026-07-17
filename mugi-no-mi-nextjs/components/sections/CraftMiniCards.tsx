import Link from 'next/link';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';

const items = [
  {
    num: 'Wheat — 粉',
    title: <>石臼でゆっくり挽く、<br />契約農家の小麦。</>,
    text: '使う分だけを、その日のうちに。',
  },
  {
    num: 'Water — 水',
    title: <>月に一度、<br />山まで汲みに向かう湧水。</>,
    text: 'やわらかな甘みの理由です。',
  },
  {
    num: 'Fermentation — 発酵',
    title: <>低温で18時間、<br />生地を静かに眠らせる。</>,
    text: '急がないことが、甘みを引き出す。',
  },
];

/**
 * Homeでは要点のみ。詳しい内容(工程写真・長文)はAboutページに移しています。
 */
export function CraftMiniCards() {
  return (
    <section className="px-8 py-24 max-[640px]:px-5 max-[640px]:py-16">
      <div className="mx-auto max-w-container">
        <RevealOnScroll>
          <SectionHeading
            eyebrow="Our Craft"
            title="パンへのこだわり"
            description="特別な技術より、丁寧な手間を選びました。素材と時間に、多くを委ねています。"
          />
        </RevealOnScroll>
        <RevealOnScroll>
          <div className="grid grid-cols-3 gap-7 max-[760px]:grid-cols-1">
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
          <Link href="/about" className="link-gold">こだわりの詳細を読む →</Link>
        </div>
      </div>
    </section>
  );
}

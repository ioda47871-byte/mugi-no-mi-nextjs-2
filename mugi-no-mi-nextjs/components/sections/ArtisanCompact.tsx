import Link from 'next/link';
import { PhotoFrame } from '@/components/ui/PhotoFrame';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import { siteContent } from '@/lib/placeholder-content';

/**
 * 店舗紹介(Home = 短縮版)。
 * 実在の代表者名は確認できていないため、個人の顔写真・名前つきの
 * 「職人紹介」形式ではなく、店舗紹介文(第三者紹介トーン)を表示しています。
 * founderPortrait.value(現在は店内写真)が設定されている間は、
 * 2カラムの写真ありレイアウトで表示されます。
 */
export function ArtisanCompact() {
  const hasPhoto = Boolean(siteContent.founderPortrait.value);

  return (
    <section className="bg-brand-pale px-8 py-24 max-[640px]:px-5 max-[640px]:py-16">
      <div className="mx-auto max-w-container">
        <RevealOnScroll>
          {hasPhoto ? (
            <div className="mx-auto grid max-w-3xl grid-cols-[0.6fr_1fr] items-center gap-12 max-[700px]:grid-cols-1 max-[700px]:text-center">
              <PhotoFrame src={siteContent.founderPortrait.value} alt="Brot yanagiの店内" aspect="aspect-[3/4]" />
              <IntroText />
            </div>
          ) : (
            <div className="mx-auto max-w-xl text-center">
              <IntroText />
            </div>
          )}
        </RevealOnScroll>
      </div>
    </section>
  );
}

function IntroText() {
  return (
    <div>
      <p className="font-display text-[clamp(19px,2.4vw,23px)] leading-loose">
        {siteContent.founderQuote.value}
      </p>
      <div className="mt-6">
        <Link href="/about" className="link-gold">Brot yanagiについてもっと読む →</Link>
      </div>
    </div>
  );
}

import Link from 'next/link';
import { PhotoFrame } from '@/components/ui/PhotoFrame';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import { NoBreakText } from '@/components/ui/NoBreakText';
import { siteContent, FOUNDER_QUOTE_PROTECTED_PHRASES } from '@/lib/placeholder-content';
import { getSitePhoto } from '@/lib/site-photos';

/**
 * 店舗紹介(Home = 短縮版)。
 * 実在の代表者名は確認できていないため、個人の顔写真・名前つきの
 * 「職人紹介」形式ではなく、店舗紹介文(第三者紹介トーン)を表示しています。
 * 写真はlib/site-photos.ts経由(interiorスロット)で取得し、未設定の場合も
 * 既存の静的ファイルにフォールバックするため常に写真ありレイアウトになります。
 */
export async function ArtisanCompact() {
  const interiorPhoto = await getSitePhoto('interior');

  return (
    <section className="bg-brand-pale px-8 py-24 max-[640px]:px-5 max-[640px]:py-16">
      <div className="mx-auto max-w-container">
        <RevealOnScroll>
          <div className="mx-auto grid max-w-3xl grid-cols-[0.6fr_1fr] items-center gap-12 max-[700px]:grid-cols-1 max-[700px]:text-center">
            <PhotoFrame src={interiorPhoto.url} alt={interiorPhoto.alt} aspect="aspect-[3/4]" />
            <IntroText />
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}

function IntroText() {
  return (
    <div>
      <p className="font-display text-[clamp(19px,2.4vw,23px)] leading-loose">
        <NoBreakText text={siteContent.founderQuote.value} phrases={FOUNDER_QUOTE_PROTECTED_PHRASES} />
      </p>
      <div className="mt-6">
        <Link href="/about" className="link-gold">Brot yanagiについてもっと読む →</Link>
      </div>
    </div>
  );
}

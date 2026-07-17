import Link from 'next/link';
import { PhotoFrame } from '@/components/ui/PhotoFrame';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import { siteContent } from '@/lib/placeholder-content';

/**
 * 職人紹介(Home = 短縮版)。
 * founderPortrait.value が null の場合は、写真なし・中央寄せ・余白主体の
 * レイアウトに自動的に切り替わります。実店舗の写真が用意でき次第、
 * lib/placeholder-content.ts の founderPortrait.value にURL(またはpublic/images内のパス)
 * を設定すれば、2カラムの写真ありレイアウトになります。
 */
export function ArtisanCompact() {
  const hasPhoto = Boolean(siteContent.founderPortrait.value);

  return (
    <section className="bg-brand-pale px-8 py-24 max-[640px]:px-5 max-[640px]:py-16">
      <div className="mx-auto max-w-container">
        <RevealOnScroll>
          {hasPhoto ? (
            <div className="mx-auto grid max-w-3xl grid-cols-[0.6fr_1fr] items-center gap-12 max-[700px]:grid-cols-1 max-[700px]:text-center">
              <PhotoFrame src={siteContent.founderPortrait.value} alt={`${siteContent.founderName.value}のポートレート`} aspect="aspect-[3/4]" />
              <ArtisanText />
            </div>
          ) : (
            <div className="mx-auto max-w-xl text-center">
              <ArtisanText />
            </div>
          )}
        </RevealOnScroll>
      </div>
    </section>
  );
}

function ArtisanText() {
  return (
    <div>
      <blockquote className="font-display text-[clamp(21px,2.8vw,27px)] leading-loose">
        「{siteContent.founderQuote.value}」
      </blockquote>
      <p className="mt-5 text-[15px] text-kura">
        {siteContent.founderName.value}
        <span className="mt-1 block font-accent text-[13.5px] italic text-brand-deep">
          {siteContent.founderRole.value}
        </span>
      </p>
      <div className="mt-5">
        <Link href="/about" className="link-gold">職人の想いをもっと読む →</Link>
      </div>
    </div>
  );
}

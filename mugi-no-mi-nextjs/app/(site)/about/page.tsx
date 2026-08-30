import type { Metadata } from 'next';
import { InstagramFeed } from '@/components/sections/InstagramFeed';
import { PageHero } from '@/components/sections/PageHero';
import { StoreInfoStrip } from '@/components/sections/StoreInfoStrip';
import { PhotoBlock } from '@/components/ui/PhotoBlock';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import { NoBreakText } from '@/components/ui/NoBreakText';
import { WillowDecoration } from '@/components/ui/WillowDecoration';
import { pageOpenGraph, siteConfig } from '@/lib/site-config';
import { siteContent, FOUNDER_QUOTE_PROTECTED_PHRASES } from '@/lib/placeholder-content';
import { getSitePhotos } from '@/lib/site-photos';

const ABOUT_DESCRIPTION = `${siteConfig.name}(${siteConfig.nameJa})の店構えと店内、Instagramでの最新情報。`;

// サイト写真(Supabase)は60秒ごとに再取得する(ISR)。管理画面でのアップロードが
// 再デプロイなしで最大60秒以内に反映される。
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const photos = await getSitePhotos();
  return {
    title: 'About',
    description: ABOUT_DESCRIPTION,
    alternates: { canonical: '/about' },
    openGraph: pageOpenGraph({
      title: 'About',
      description: ABOUT_DESCRIPTION,
      image: photos.interior.url,
      imageAlt: photos.interior.alt,
    }),
  };
}

/**
 * About = 店舗紹介文(依頼者から提供された紹介文をベースにした第三者紹介トーン)
 * + 実店舗写真による「空間」の紹介 + Instagram連携。実在の代表者名・製法・
 * 素材などは確認が取れていないため、個人名の記載や工程の詳細説明は行っていません。
 * 写真に添えるキャプションも、写真に写っているものを説明する範囲にとどめ、
 * 未確認の店の方針・こだわりなどは記載していません。
 * 写真はlib/site-photos.ts経由(管理画面のアップロードが無ければ既存の静的
 * ファイルにフォールバック)で取得しています。
 */
export default async function AboutPage() {
  const photos = await getSitePhotos();

  // Aboutページの紹介文のみ、意味のまとまりごとに明示的に改行する
  // (文言・句読点は一切変更せず、表示上の改行位置だけを調整。Home側の
  // ArtisanCompact.tsxは founderQuote.value をそのまま使うため影響しない)。
  const founderQuoteWithBreaks = siteContent.founderQuote.value
    .replace('朝の一品から、', '\n朝の一品から、')
    .replace('その日に出会えるパンを、', '\nその日に出会えるパンを、');

  return (
    <div>
      <PageHero
        eyebrow="About"
        title={
          <>
            柳の木の奥にある、
            <br />
            小さなベーカリー。
          </>
        }
        description={
          <span className="whitespace-pre-line">
            <NoBreakText text={founderQuoteWithBreaks} phrases={FOUNDER_QUOTE_PROTECTED_PHRASES} />
          </span>
        }
        photoUrl={photos.exterior.url}
        photoAlt={photos.exterior.alt}
      />

      <section className="overflow-hidden bg-brand-pale px-8 py-24 max-[640px]:px-5 max-[640px]:py-16">
        <div className="mx-auto max-w-container">
          <RevealOnScroll>
            <div className="grid grid-cols-2 items-center gap-16 max-[860px]:grid-cols-1 max-[860px]:gap-9">
              <PhotoBlock src={photos.interior.url} alt={photos.interior.alt} width={1500} height={1125} />
              <div className="relative max-[860px]:text-center">
                <WillowDecoration
                  variant="sprig"
                  className="pointer-events-none absolute -left-7 -top-9 h-24 w-11 text-brand-deep/40 max-[860px]:hidden"
                />
                <div className="relative">
                  <span className="eyebrow">Space</span>
                  <h2 className="mt-3.5 text-2xl">落ち着いた店内。</h2>
                  <p className="mt-5 max-w-sm text-[14.5px] leading-loose text-kura max-[860px]:mx-auto">
                    {siteContent.tagline.value}
                    <br />
                    柳の木を目印に扉を開けると、静かな店内にその日のパンが並びます。
                  </p>
                </div>
              </div>
            </div>
          </RevealOnScroll>
        </div>
      </section>

      <section className="bg-white px-8 py-24 max-[640px]:px-5 max-[640px]:py-16">
        <div className="mx-auto max-w-container">
          <RevealOnScroll>
            <div className="mx-auto max-w-2xl text-center">
              <span className="eyebrow justify-center">OUR KITCHEN</span>
              <h2 className="mt-3.5 text-[clamp(28px,4vw,44px)] leading-snug">
                ガラスの向こうで、
                <br />
                今日のパンを。
              </h2>
              <p className="mx-auto mt-5 max-w-md text-[14.5px] leading-loose text-kura">
                店内の窓から、パンづくりの様子をご覧いただけます。
              </p>
            </div>
          </RevealOnScroll>

          <RevealOnScroll className="mt-12">
            <PhotoBlock
              src={photos.kitchen.url}
              alt={photos.kitchen.alt}
              width={1600}
              height={1067}
              sizes="100vw"
            />
          </RevealOnScroll>
        </div>
      </section>

      <section className="relative overflow-hidden px-8 py-24 max-[640px]:px-5 max-[640px]:py-16">
        <div className="mx-auto max-w-container">
          <RevealOnScroll>
            <div className="grid grid-cols-2 items-center gap-16 max-[860px]:grid-cols-1 max-[860px]:gap-9">
              <div className="relative max-[860px]:order-2 max-[860px]:text-center">
                <WillowDecoration
                  variant="sprig"
                  className="pointer-events-none absolute -left-9 -top-9 h-24 w-11 text-gold/35 max-[1100px]:hidden"
                />
                <div className="relative">
                  <p className="text-[clamp(20px,2.6vw,25px)] font-display leading-loose">
                    パンだけではない、
                    <br />
                    店先のしつらえ
                  </p>
                  <p className="mt-5 max-w-sm text-[14.5px] leading-loose text-kura max-[860px]:mx-auto">
                    パンがおいしいのはもちろん、扉の前に立つその時間も、楽しんでほしい。
                    <br />
                    そんな想いで、季節ごとにしつらえています。
                  </p>
                </div>
              </div>
              <div className="max-[860px]:order-1">
                <PhotoBlock src={photos['goods-corner'].url} alt={photos['goods-corner'].alt} width={1500} height={1125} />
              </div>
            </div>
          </RevealOnScroll>
        </div>
      </section>

      <InstagramFeed />

      <StoreInfoStrip />
    </div>
  );
}

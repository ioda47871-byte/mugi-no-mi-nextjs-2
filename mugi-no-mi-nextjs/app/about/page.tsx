import type { Metadata } from 'next';
import Link from 'next/link';
import { InstagramFeed } from '@/components/sections/InstagramFeed';
import { PhotoBlock } from '@/components/ui/PhotoBlock';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import { siteConfig } from '@/lib/site-config';
import { siteContent } from '@/lib/placeholder-content';

export const metadata: Metadata = {
  title: 'About',
  description: `${siteConfig.name}(${siteConfig.nameJa})の店構えと店内、Instagramでの最新情報。`,
  alternates: { canonical: '/about' },
  openGraph: {
    title: `About | ${siteConfig.name}`,
  },
};

/**
 * About = 店舗紹介文(依頼者から提供された紹介文をベースにした第三者紹介トーン)
 * + 実店舗写真による「空間」の紹介 + Instagram連携。実在の代表者名・製法・
 * 素材などは確認が取れていないため、個人名の記載や工程の詳細説明は行っていません。
 * 写真に添えるキャプションも、写真に写っているものを説明する範囲にとどめ、
 * 未確認の店の方針・こだわりなどは記載していません。
 */
export default function AboutPage() {
  return (
    <div className="pt-[200px] max-[640px]:pt-[130px]">
      <div className="mx-auto max-w-container px-8 pb-14 text-center max-[640px]:px-5">
        <RevealOnScroll>
          <span className="eyebrow justify-center">About</span>
          <h1 className="mt-[18px] text-[clamp(34px,5vw,58px)]">柳の木の奥にある、小さなベーカリー。</h1>
          <p className="mx-auto mt-6 max-w-lg text-[14.5px] text-kura">{siteContent.founderQuote.value}</p>
        </RevealOnScroll>
      </div>

      <div className="px-8 pb-24 max-[640px]:px-5 max-[640px]:pb-16">
        <RevealOnScroll className="mx-auto max-w-2xl">
          <PhotoBlock
            src="/images/exterior.jpg"
            alt="柳の木とBrot yanagiの外観"
            width={1200}
            height={1500}
            caption="柳の木を目印に"
            priority
          />
        </RevealOnScroll>
      </div>

      <section className="bg-brand-pale px-8 py-24 max-[640px]:px-5 max-[640px]:py-16">
        <div className="mx-auto max-w-container">
          <RevealOnScroll>
            <div className="grid grid-cols-2 items-center gap-16 max-[860px]:grid-cols-1 max-[860px]:gap-9">
              <PhotoBlock
                src="/images/interior.jpg"
                alt="Brot yanagiの店内の様子"
                width={1500}
                height={1125}
              />
              <div className="max-[860px]:text-center">
                <span className="eyebrow">Space</span>
                <h2 className="mt-3.5 text-2xl">落ち着いた店内。</h2>
                <p className="mt-5 max-w-sm text-[14.5px] leading-loose text-kura max-[860px]:mx-auto">
                  {siteContent.tagline.value}
                  <br />
                  柳の木を目印に扉を開けると、静かな店内にその日のパンが並びます。
                </p>
              </div>
            </div>
          </RevealOnScroll>
        </div>
      </section>

      <section className="px-8 py-24 max-[640px]:px-5 max-[640px]:py-16">
        <div className="mx-auto max-w-container">
          <RevealOnScroll>
            <div className="grid grid-cols-2 items-center gap-16 max-[860px]:grid-cols-1 max-[860px]:gap-9">
              <div className="order-2 max-[860px]:order-2 max-[860px]:text-center">
                <span className="eyebrow">Visit</span>
                <h2 className="mt-3.5 text-2xl">ご来店をお待ちしています。</h2>
                <p className="mt-5 max-w-sm text-[14.5px] leading-loose text-kura max-[860px]:mx-auto">
                  {siteContent.address.value}
                  <br />
                  営業時間 {siteContent.hours.value}(定休日 {siteContent.closedDay.value})
                </p>
                <div className="mt-6">
                  <Link href="/access" className="link-gold">アクセス・地図を見る →</Link>
                </div>
              </div>
              <div className="order-1 max-[860px]:order-1">
                <PhotoBlock
                  src="/images/entrance.jpg"
                  alt="Brot yanagiの入口"
                  width={1200}
                  height={1500}
                />
              </div>
            </div>
          </RevealOnScroll>
        </div>
      </section>

      <div className="px-8 pb-24 max-[640px]:px-5 max-[640px]:pb-16">
        <RevealOnScroll className="mx-auto max-w-md">
          <PhotoBlock
            src="/images/display-accent.jpg"
            alt="店先の小物のディスプレイ"
            width={1200}
            height={1500}
            caption="パンだけではない、店先のしつらえ"
          />
        </RevealOnScroll>
      </div>

      <InstagramFeed />
    </div>
  );
}

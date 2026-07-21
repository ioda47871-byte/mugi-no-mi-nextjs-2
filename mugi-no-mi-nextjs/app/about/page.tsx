import type { Metadata } from 'next';
import { InstagramFeed } from '@/components/sections/InstagramFeed';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import { siteConfig } from '@/lib/site-config';
import { siteContent } from '@/lib/placeholder-content';

export const metadata: Metadata = {
  title: 'About',
  description: `${siteConfig.name}(${siteConfig.nameJa})のご紹介と、Instagramでの最新情報。`,
  alternates: { canonical: '/about' },
  openGraph: {
    title: `About | ${siteConfig.name}`,
  },
};

/**
 * About = 店舗紹介文(依頼者から提供された紹介文をベースにした第三者紹介トーン)
 * + Instagram連携。実在の代表者名・製法・素材などは確認が取れていないため、
 * 個人名の記載や工程の詳細説明は行っていません。
 */
export default function AboutPage() {
  return (
    <div className="pt-[200px] max-[640px]:pt-[130px]">
      <div className="mx-auto max-w-container px-8 pb-20 text-center max-[640px]:px-5">
        <RevealOnScroll>
          <span className="eyebrow justify-center">About</span>
          <h1 className="mt-[18px] text-[clamp(34px,5vw,58px)]">柳の木の奥にある、小さなベーカリー。</h1>
          <p className="mx-auto mt-6 max-w-lg text-[14.5px] text-kura">{siteContent.founderQuote.value}</p>
        </RevealOnScroll>
      </div>

      <InstagramFeed />
    </div>
  );
}

import type { Metadata } from 'next';
import { InstagramFeed } from '@/components/sections/InstagramFeed';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import { siteConfig } from '@/lib/site-config';
import { siteContent } from '@/lib/placeholder-content';

export const metadata: Metadata = {
  title: 'About',
  description: '麦の実 -Mugi no Mi- Boulangerieのこだわりと、Instagramでの日々の焼き上がりの様子。',
  alternates: { canonical: '/about' },
  openGraph: {
    title: `About | ${siteConfig.name}`,
  },
};

/**
 * About = ブランドの想い(簡潔なテキスト)+ Instagram連携。
 * 詳しいこだわりの工程(粉・水・発酵)や職人の経歴は、実店舗の情報量が
 * 確定次第、このページに追記していく想定です。
 */
export default function AboutPage() {
  return (
    <div className="pt-[200px]">
      <div className="mx-auto max-w-container px-8 pb-20 text-center max-[640px]:px-5">
        <RevealOnScroll>
          <span className="eyebrow justify-center">About</span>
          <h1 className="mt-[18px] text-[clamp(34px,5vw,58px)]">素材と時間に、多くを委ねる。</h1>
          <p className="mx-auto mt-6 max-w-lg text-[14.5px] text-kura">
            特別な技術より、丁寧な手間を選びました。石臼で挽く小麦、月に一度汲みに向かう湧水、
            18時間の低温発酵。{siteContent.founderName.value}が大切にしているのは、
            「{siteContent.founderQuote.value}」という、ただそれだけの言葉です。
          </p>
        </RevealOnScroll>
      </div>

      <InstagramFeed />
    </div>
  );
}

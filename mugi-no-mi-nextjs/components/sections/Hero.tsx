'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { WillowDecoration } from '@/components/ui/WillowDecoration';
import { WheatDecoration } from '@/components/ui/WheatDecoration';
import { siteContent } from '@/lib/placeholder-content';

interface HeroProps {
  imageUrl: string;
  imageAlt: string;
}

// 見出し「柳の木の奥で」と直接呼応するよう、
// Heroの背景にはショーケース写真ではなく外観写真を採用している(採用理由は
// 管理画面のHeroスロットとは独立して設定可能。既定は外観と同じ写真)。
// 'use client'のためサーバーからのデータ取得はできず、imageUrl/imageAltは
// 親(app/page.tsx)がlib/site-photos.ts経由で取得してpropsで渡している。
//
// レイアウトは「左: アイボリーの紙面(コピー・CTA) / 右: 実写(写真の色を
// そのまま活かす)」というエディトリアル構成。写真全面に暗いオーバーレイは
// かけず、左から右へ アイボリー→半透明→写真 と連続的に溶けるグラデーション
// のみで可読性を確保している(直線の境界を作らない)。
export function Hero({ imageUrl, imageAlt }: HeroProps) {
  const [fade, setFade] = useState(1);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setFade(1);
      return;
    }

    // Heroの高さ分スクロールする間に、静かにフェードアウトする
    // (派手な視差効果ではなく、控えめな不透明度の変化のみ)。
    // scrollイベントは高頻度で発火するため、requestAnimationFrameで
    // 1フレームにつき1回の更新に間引き、過剰な再描画を避ける。
    let rafId: number | null = null;

    const applyFade = () => {
      const vh = window.innerHeight || 800;
      const ratio = Math.min(Math.max(window.scrollY / (vh * 0.7), 0), 1);
      setFade(1 - ratio);
      rafId = null;
    };

    const onScroll = () => {
      if (rafId === null) {
        rafId = requestAnimationFrame(applyFade);
      }
    };

    applyFade();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <section
      data-hero
      className="relative flex h-[88vh] max-h-[860px] min-h-[620px] items-end overflow-hidden max-[640px]:h-[100dvh] max-[640px]:max-h-none"
    >
      {/* 写真: 全面に配置し、暗いフィルターはかけない(色・明るさを保つ) */}
      <div className="absolute inset-0">
        <Image
          src={imageUrl}
          alt={imageAlt}
          fill
          priority
          sizes="100vw"
          className="hero-zoom object-cover object-[68%_center] motion-reduce:!scale-100 motion-reduce:!animate-none"
        />
      </div>

      {/* アイボリー→半透明→写真、左から右へ連続的に溶けるグラデーション */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(100deg,#FAF6EF_0%,#FAF6EF_27%,rgba(250,246,239,0.82)_39%,rgba(250,246,239,0.42)_50%,rgba(250,246,239,0.1)_61%,transparent_71%)] max-[900px]:bg-[linear-gradient(100deg,#FAF6EF_0%,#FAF6EF_40%,rgba(250,246,239,0.88)_56%,rgba(250,246,239,0.55)_72%,rgba(250,246,239,0.2)_88%,transparent_100%)]"
      />
      {/* 足元のみ、ごく薄く沈める(CTA周りの可読性の保険) */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-ivory/30 to-transparent max-[640px]:from-ivory/55" />

      {/* LEVEL1(大): ページの外、左上に柳の木があるかのような大型の背景装飾 */}
      <WillowDecoration
        variant="canopy"
        className="pointer-events-none absolute -left-40 -top-16 hidden h-[620px] w-[520px] text-kura/[0.15] min-[900px]:block"
      />
      {/* LEVEL2(中): 写真とアイボリーの境目に重ね、実写の柳とUIの柳をつなぐ */}
      <WillowDecoration
        variant="corner"
        className="pointer-events-none absolute -top-8 left-[32%] hidden h-[440px] w-[360px] text-gold/[0.32] min-[900px]:block"
      />
      {/* LEVEL2(中): Hero左端、ページの外から覗く柳 */}
      <WillowDecoration
        variant="branch"
        className="pointer-events-none absolute -left-7 top-[10%] hidden h-[58%] w-28 text-gold/[0.34] min-[900px]:block"
      />

      <div
        style={{ opacity: fade, transform: `translateY(${(1 - fade) * 14}px)` }}
        className="relative z-[2] mx-auto w-full max-w-container px-8 pb-28 transition-opacity duration-100 ease-out motion-reduce:!opacity-100 motion-reduce:!transform-none max-[640px]:px-5 max-[640px]:pb-20"
      >
        <div className="flex items-center gap-3.5 max-[480px]:gap-2">
          <WheatDecoration lean="left" className="h-7 w-4 shrink-0 text-gold/60 max-[480px]:hidden" />
          <span aria-hidden className="h-px w-8 shrink-0 bg-gold/45 max-[640px]:hidden" />
          <p className="whitespace-nowrap font-accent text-[11px] italic uppercase tracking-[0.3em] text-brand-text">
            Since the first light of morning
          </p>
          <span aria-hidden className="h-px w-8 shrink-0 bg-gold/45 max-[640px]:hidden" />
          <WheatDecoration lean="right" className="h-7 w-4 shrink-0 text-gold/60 max-[480px]:hidden" />
        </div>

        <h1 className="mt-6 max-w-2xl text-[clamp(36px,5vw,62px)] font-medium leading-tight text-ink">
          {siteContent.heroHeadline.value}
        </h1>
        <p className="mt-6 max-w-md whitespace-pre-line text-[14px] leading-loose text-kura">
          {siteContent.heroSubcopy.value}
        </p>
        <div className="mt-9 flex flex-wrap gap-4">
          <Button href="/menu" variant="primary">
            パンを見る <span aria-hidden>→</span>
          </Button>
          <Link
            href="/access"
            className="inline-flex min-h-[48px] items-center gap-2.5 rounded-[2px] border border-gold/55 bg-ivory/45 px-8 text-[13px] tracking-[0.16em] text-ink backdrop-blur-sm transition-all duration-300 ease-signature hover:-translate-y-0.5 hover:border-gold hover:bg-ivory/75"
          >
            店舗情報を見る <span aria-hidden>→</span>
          </Link>
        </div>
      </div>

      {/* Hero下端、次セクションへの連続性を示す小麦(波形の頂点付近に重ねる) */}
      <WheatDecoration
        variant="sprig"
        lean="right"
        className="pointer-events-none absolute bottom-1.5 left-1/2 z-[2] hidden h-16 w-9 -translate-x-1/2 text-gold/60 min-[640px]:block"
      />

      {/* Scroll cue */}
      <div
        aria-hidden
        style={{ opacity: fade }}
        className="absolute bottom-[94px] left-1/2 z-[2] hidden -translate-x-1/2 flex-col items-center gap-2 transition-opacity duration-100 min-[640px]:flex"
      >
        <span className="font-accent text-[10px] italic uppercase tracking-[0.28em] text-kura/70">Scroll</span>
        <span className="relative h-10 w-px overflow-hidden bg-kura/25">
          <span className="animate-cue-drop absolute left-0 top-[-40px] h-10 w-full bg-brand motion-reduce:animate-none" />
        </span>
      </div>

      {/* Hero下端: 直線ではなく、ごく緩いカーブで次セクション(白背景)へつなぐ */}
      <svg
        aria-hidden
        viewBox="0 0 1440 100"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-0 bottom-[-1px] z-[1] h-[70px] w-full text-white max-[640px]:h-9"
      >
        <path d="M0,100 L0,55 C 320,95 1100,15 1440,60 L1440,100 Z" fill="currentColor" />
      </svg>
    </section>
  );
}

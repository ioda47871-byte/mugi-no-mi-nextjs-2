'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { siteContent } from '@/lib/placeholder-content';

// 店舗外観写真(柳の木が目印)。見出し「柳の木の奥で、今日のパンに出会う。」と
// 直接呼応するよう、Heroの背景にはショーケース写真ではなく外観写真を採用している。
const HERO_IMAGE = '/images/exterior.jpg';

export function Hero() {
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
      className="relative flex h-screen min-h-[640px] items-end overflow-hidden max-[640px]:h-[100dvh]"
    >
      <div className="absolute inset-0">
        <Image
          src={HERO_IMAGE}
          alt="柳の木とBrot yanagiの外観"
          fill
          priority
          sizes="100vw"
          className="hero-zoom object-cover motion-reduce:!scale-100 motion-reduce:!animate-none"
        />
        {/* 薄い黒のオーバーレイ: テキストの可読性を確保 */}
        <div className="absolute inset-0 bg-black/22" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(255,255,255,0.14),transparent_55%),linear-gradient(to_top,rgba(20,15,8,0.78)_0%,rgba(20,15,8,0.25)_55%,transparent_82%)]" />
      </div>

      <div
        style={{ opacity: fade, transform: `translateY(${(1 - fade) * 14}px)` }}
        className="relative z-[2] mx-auto w-full max-w-container px-8 pb-24 text-white transition-opacity duration-100 ease-out motion-reduce:!opacity-100 motion-reduce:!transform-none max-[640px]:px-5"
      >
        <p className="font-accent text-sm italic uppercase tracking-[0.3em] text-brand-pale">
          Since the first light of morning
        </p>
        <h1 className="mt-4 max-w-3xl whitespace-pre-line text-[clamp(38px,6.4vw,84px)] leading-tight text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.25)]">
          {siteContent.heroHeadline.value}
        </h1>
        <p className="mt-6 max-w-md text-[15px] text-white/90">{siteContent.heroSubcopy.value}</p>
        <div className="mt-10 flex flex-wrap gap-[18px]">
          <Button href="/menu" variant="primary">パンを見る</Button>
          <Button href="/access" variant="outline-inverse">店舗情報を見る</Button>
        </div>
      </div>

      <div
        aria-hidden
        style={{ opacity: fade }}
        className="absolute bottom-9 left-1/2 z-[2] h-[54px] w-px -translate-x-1/2 overflow-hidden bg-white/40 transition-opacity duration-100"
      >
        <span className="animate-cue-drop absolute left-0 top-[-54px] h-[54px] w-full bg-brand motion-reduce:animate-none" />
      </div>
    </section>
  );
}

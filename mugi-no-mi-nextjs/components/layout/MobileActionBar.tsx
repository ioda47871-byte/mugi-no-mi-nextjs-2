'use client';

import { useEffect, useRef, useState } from 'react';
import { siteContent } from '@/lib/placeholder-content';

/**
 * スマートフォン専用の固定アクションバー(電話・地図・Instagram)。
 * - Heroセクション([data-hero])を過ぎたら表示
 * - Footerが画面に入ったら自動的に非表示(重なり防止)
 * - PC幅(min-width:861px)では常に非表示(Tailwindのmin-[861px]:hiddenで制御)
 */
export function MobileActionBar() {
  const [show, setShow] = useState(false);
  const [nearFooter, setNearFooter] = useState(false);
  const pastHeroRef = useRef(false);

  useEffect(() => {
    const hero = document.querySelector('[data-hero]');
    const footer = document.querySelector('footer');
    if (!hero) pastHeroRef.current = true;

    if (!('IntersectionObserver' in window)) {
      setShow(true);
      return;
    }

    let heroObserver: IntersectionObserver | undefined;
    let footerObserver: IntersectionObserver | undefined;

    if (hero) {
      heroObserver = new IntersectionObserver(
        ([entry]) => {
          pastHeroRef.current = !entry.isIntersecting;
          setShow(pastHeroRef.current);
        },
        { threshold: 0 },
      );
      heroObserver.observe(hero);
    } else {
      setShow(true);
    }

    if (footer) {
      footerObserver = new IntersectionObserver(([entry]) => setNearFooter(entry.isIntersecting), {
        threshold: 0,
        rootMargin: '0px 0px -10% 0px',
      });
      footerObserver.observe(footer);
    }

    return () => {
      heroObserver?.disconnect();
      footerObserver?.disconnect();
    };
  }, []);

  const visible = show && !nearFooter;

  return (
    <nav
      aria-label="クイックアクション"
      className={`fixed bottom-[18px] left-1/2 z-[150] flex -translate-x-1/2 gap-1 rounded-full border border-line bg-ivory/90 px-2 py-2 shadow-[0_10px_28px_rgba(43,36,29,0.14)] backdrop-blur-md transition-all duration-500 ease-signature min-[861px]:hidden ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-[140%] opacity-0'
      }`}
    >
      <a
        href={`tel:${siteContent.phoneHref.value}`}
        className="flex flex-col items-center gap-1 rounded-full bg-brand px-[18px] py-2 text-[10px] tracking-wide text-ink"
      >
        <PhoneIcon />
        電話
      </a>
      <a href="/access" className="flex flex-col items-center gap-1 rounded-full px-[18px] py-2 text-[10px] tracking-wide text-ink">
        <MapIcon />
        地図
      </a>
      <a
        href={siteContent.instagramUrl.value}
        className="flex flex-col items-center gap-1 rounded-full px-[18px] py-2 text-[10px] tracking-wide text-ink"
      >
        <InstagramIcon />
        Instagram
      </a>
    </nav>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-[18px] w-[18px]">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-[18px] w-[18px]">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-[18px] w-[18px]">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

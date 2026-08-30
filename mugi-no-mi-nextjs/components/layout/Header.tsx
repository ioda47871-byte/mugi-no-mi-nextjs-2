'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { siteContent } from '@/lib/placeholder-content';

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/menu', label: 'Menu' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/access', label: 'Access' },
  { href: '/contact', label: 'Contact' },
];

export function Header() {
  const pathname = usePathname();
  const [solid, setSolid] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // モバイルメニューを閉じたら、開いていたボタンにフォーカスを戻す
  // (ハンバーガーボタンから開いた操作の続き = キーボード操作の一貫性のため)。
  useEffect(() => {
    if (!mobileOpen) return;

    // 背景のスクロールをロックする
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    // 開いたら最初のリンクへフォーカスを移す
    const panel = panelRef.current;
    const menuButton = menuButtonRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>('a[href], button');
    focusable?.[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMobileOpen(false);
        return;
      }

      // フォーカストラップ: パネル内の最初/最後の要素でTabを循環させる
      if (e.key === 'Tab' && focusable && focusable.length > 0) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      menuButton?.focus();
    };
  }, [mobileOpen]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-[100] transition-all duration-500 ease-signature ${
        solid
          ? 'bg-ivory/90 py-4 shadow-[0_1px_0_theme(colors.line)] backdrop-blur-md'
          : 'bg-ivory/20 py-6 backdrop-blur-[2px]'
      }`}
    >
      <div className="mx-auto flex max-w-container items-center justify-between px-8 max-[640px]:px-5">
        <Link href="/" className="flex items-center gap-2.5 font-display text-xl tracking-wide">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
          {siteContent.brandName.value}{' '}
          <span className="font-accent text-sm italic opacity-70">{siteContent.brandNameEn.value}</span>
        </Link>

        <nav className="hidden gap-10 min-[861px]:flex" aria-label="メインナビゲーション">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative pb-1 text-[13px] tracking-wider after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-brand after:transition-transform after:duration-300 after:ease-signature hover:after:scale-x-100 ${
                  active ? 'text-brand-text after:scale-x-100' : ''
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          ref={menuButtonRef}
          className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1.5 rounded-[2px] min-[861px]:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deep"
          aria-label={mobileOpen ? 'メニューを閉じる' : 'メニューを開く'}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav-panel"
          onClick={() => setMobileOpen((v) => !v)}
        >
          <span
            className={`h-px w-[22px] bg-ink transition-transform duration-300 ${mobileOpen ? 'translate-y-[6.5px] rotate-45' : ''}`}
          />
          <span className={`h-px w-[22px] bg-ink transition-opacity duration-300 ${mobileOpen ? 'opacity-0' : ''}`} />
          <span
            className={`h-px w-[22px] bg-ink transition-transform duration-300 ${mobileOpen ? '-translate-y-[6.5px] -rotate-45' : ''}`}
          />
        </button>
      </div>

      {mobileOpen && (
        <div
          aria-hidden
          className="fixed inset-0 z-[99] bg-ink/40 backdrop-blur-[1px] min-[861px]:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {mobileOpen && (
        <div
          id="mobile-nav-panel"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="モバイルナビゲーション"
          className="fixed right-0 top-0 z-[101] flex h-screen w-[min(78vw,320px)] flex-col gap-7 bg-ivory px-10 py-24 shadow-[-20px_0_40px_rgba(0,0,0,0.08)]"
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="min-h-[44px] py-1 text-sm tracking-wider focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deep"
              onClick={() => setMobileOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}

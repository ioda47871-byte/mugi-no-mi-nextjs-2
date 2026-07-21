'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
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

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-[100] transition-all duration-500 ease-signature ${
        solid ? 'bg-ivory/90 py-4 shadow-[0_1px_0_theme(colors.line)] backdrop-blur-md' : 'py-6'
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
                  active ? 'text-brand-deep after:scale-x-100' : ''
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1.5 min-[861px]:hidden"
          aria-label="メニューを開く"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          <span className="h-px w-[22px] bg-ink" />
          <span className="h-px w-[22px] bg-ink" />
          <span className="h-px w-[22px] bg-ink" />
        </button>
      </div>

      {mobileOpen && (
        <nav
          className="fixed right-0 top-0 flex h-screen w-[min(78vw,320px)] flex-col gap-7 bg-ivory px-10 py-24 shadow-[-20px_0_40px_rgba(0,0,0,0.08)]"
          aria-label="モバイルナビゲーション"
        >
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm tracking-wider" onClick={() => setMobileOpen(false)}>
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

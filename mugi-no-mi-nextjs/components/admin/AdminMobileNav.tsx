'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LogoutButton } from '@/components/admin/LogoutButton';
import { ADMIN_NAV_ITEMS } from '@/lib/admin/nav';

/**
 * モバイル(861px未満)専用のトップバー+ドロワー。
 * ログアウトはトップバーには置かず、ドロワー下部にナビ項目と分けて配置することで、
 * ヘッダー領域とログアウト操作が重ならないようにしている。
 */
export function AdminMobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Header.tsxのモバイルメニューと同じパターン(フォーカストラップ・Escで閉じる・背景スクロールロック)
  useEffect(() => {
    if (!open) return;

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const menuButton = menuButtonRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>('a[href], button');
    focusable?.[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }

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
  }, [open]);

  return (
    <div className="min-[861px]:hidden">
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-ivory/95 px-5 py-3.5 backdrop-blur-sm">
        <Link href="/admin" className="font-display text-base tracking-wide text-ink">
          Brot yanagi <span className="text-sm text-kura">管理画面</span>
        </Link>
        <button
          ref={menuButtonRef}
          type="button"
          className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1.5 rounded-[2px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deep"
          aria-label={open ? 'メニューを閉じる' : 'メニューを開く'}
          aria-expanded={open}
          aria-controls="admin-mobile-nav-panel"
          onClick={() => setOpen((v) => !v)}
        >
          <span
            className={`h-px w-[22px] bg-ink transition-transform duration-300 ${open ? 'translate-y-[6.5px] rotate-45' : ''}`}
          />
          <span className={`h-px w-[22px] bg-ink transition-opacity duration-300 ${open ? 'opacity-0' : ''}`} />
          <span
            className={`h-px w-[22px] bg-ink transition-transform duration-300 ${open ? '-translate-y-[6.5px] -rotate-45' : ''}`}
          />
        </button>
      </div>

      {open && (
        <div
          aria-hidden
          className="fixed inset-0 z-[99] bg-ink/40 backdrop-blur-[1px]"
          onClick={() => setOpen(false)}
        />
      )}

      {open && (
        <div
          id="admin-mobile-nav-panel"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="管理メニュー"
          className="fixed right-0 top-0 z-[101] flex h-screen w-[min(78vw,320px)] flex-col bg-ivory px-7 py-8 shadow-[-20px_0_40px_rgba(0,0,0,0.08)]"
        >
          <nav className="flex flex-1 flex-col gap-1" aria-label="管理メニュー">
            {ADMIN_NAV_ITEMS.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                  className={`min-h-[44px] rounded-[2px] px-2 py-2.5 text-sm tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deep ${
                    active ? 'bg-brand-pale text-ink' : 'text-kura'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-6 border-t border-line pt-5">
            <LogoutButton />
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoutButton } from '@/components/admin/LogoutButton';
import { ADMIN_NAV_ITEMS } from '@/lib/admin/nav';

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[236px] shrink-0 flex-col border-r border-line bg-ivory min-[861px]:flex">
      <div className="border-b border-line px-6 py-6">
        <Link href="/admin" className="font-display text-lg leading-tight tracking-wide text-ink">
          Brot yanagi
          <span className="mt-1 block text-sm text-kura">管理画面</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="管理メニュー">
        <ul className="flex flex-col gap-1">
          {ADMIN_NAV_ITEMS.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`block min-h-[44px] rounded-[2px] px-3 py-2.5 text-[13px] tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deep ${
                    active ? 'bg-brand-pale text-ink' : 'text-kura hover:bg-brand-pale/50 hover:text-ink'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-line px-3 py-4">
        <LogoutButton />
      </div>
    </aside>
  );
}

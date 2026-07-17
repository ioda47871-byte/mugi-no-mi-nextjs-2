import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/auth';
import { LogoutButton } from '@/components/admin/LogoutButton';

export const metadata = {
  title: '管理画面',
  robots: { index: false, follow: false },
};

export default async function AdminProtectedLayout({ children }: { children: ReactNode }) {
  // /admin以下の全ページで、ログイン済み かつ admin_users登録済み であることを確認する。
  // 満たさない場合はrequireAdmin内でリダイレクトされる。
  // ※ ここで取得している user はrequireAdmin()の認証チェックのためだけに使用しており、
  //   画面には表示しません(メールアドレス表示によるレイアウト崩れを避けるため)。
  await requireAdmin();

  return (
    <div className="min-h-screen bg-ivory">
      <header className="sticky top-0 z-10 border-b border-line bg-ivory/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4">
          <Link href="/admin" className="min-w-0 truncate font-display text-lg tracking-wide text-ink">
            麦の実 <span className="text-sm text-kura">管理画面</span>
          </Link>
          <div className="flex shrink-0 items-center gap-3">
            <span
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-kura"
            >
              <UserIcon />
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
    </div>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

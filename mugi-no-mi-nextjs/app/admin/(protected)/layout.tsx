import type { ReactNode } from 'react';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminMobileNav } from '@/components/admin/AdminMobileNav';

export const metadata = {
  title: '管理画面',
  robots: { index: false, follow: false },
};

export default async function AdminProtectedLayout({ children }: { children: ReactNode }) {
  // /admin以下の全ページで、ログイン済み かつ admin_users登録済み であることを確認する。
  // 満たさない場合はrequireAdmin内でリダイレクトされる。
  await requireAdmin();

  return (
    <div className="min-h-screen bg-ivory min-[861px]:flex">
      <AdminSidebar />
      <AdminMobileNav />
      <main className="min-w-0 flex-1 px-5 py-8 min-[861px]:px-10 min-[861px]:py-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}

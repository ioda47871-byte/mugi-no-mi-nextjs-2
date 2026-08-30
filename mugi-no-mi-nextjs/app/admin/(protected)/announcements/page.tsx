import Link from 'next/link';
import { getAdminAnnouncements } from '@/lib/admin/announcements';
import { AdminAnnouncementsTable } from '@/components/admin/AdminAnnouncementsTable';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'お知らせ管理 | 管理画面',
};

const FLASH_MESSAGES: Record<string, { text: string; tone: 'success' | 'error' }> = {
  created: { text: 'お知らせを追加しました。', tone: 'success' },
  updated: { text: 'お知らせを更新しました。', tone: 'success' },
  deleted: { text: 'お知らせを削除しました。', tone: 'success' },
  delete_failed: { text: '削除に失敗しました。時間をおいて再度お試しください。', tone: 'error' },
};

export default async function AdminAnnouncementsPage({
  searchParams,
}: {
  searchParams: { msg?: string };
}) {
  const announcements = await getAdminAnnouncements();
  const flash = searchParams.msg ? FLASH_MESSAGES[searchParams.msg] : undefined;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl text-ink">お知らせ管理</h1>
        <Link
          href="/admin/announcements/new"
          className="inline-flex min-h-[48px] items-center rounded-[2px] bg-brand px-6 text-[13px] tracking-[0.12em] text-ink transition-all duration-300 hover:bg-brand-deep"
        >
          + お知らせを追加
        </Link>
      </div>

      {flash && (
        <p
          className={`mb-6 rounded-[2px] border px-4 py-3 text-sm ${
            flash.tone === 'success'
              ? 'border-brand/50 bg-brand-pale text-ink'
              : 'border-red-300 bg-red-50 text-red-700'
          }`}
        >
          {flash.text}
        </p>
      )}

      <AdminAnnouncementsTable initialAnnouncements={announcements} />
    </div>
  );
}

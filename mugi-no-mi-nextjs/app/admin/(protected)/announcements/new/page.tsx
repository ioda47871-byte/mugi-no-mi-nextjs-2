import Link from 'next/link';
import { AnnouncementForm } from '@/components/admin/AnnouncementForm';
import { createAnnouncementAction } from '@/app/admin/(protected)/announcements/actions';

export const metadata = {
  title: 'お知らせを追加 | 管理画面',
};

export default function NewAnnouncementPage() {
  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/announcements" className="text-sm text-kura hover:text-ink">
          ← お知らせ一覧に戻る
        </Link>
      </div>
      <h1 className="mb-8 font-display text-2xl text-ink">お知らせを追加</h1>
      <AnnouncementForm action={createAnnouncementAction} submitLabel="追加する" />
    </div>
  );
}

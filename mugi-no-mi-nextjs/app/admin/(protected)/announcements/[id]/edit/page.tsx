import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AnnouncementForm } from '@/components/admin/AnnouncementForm';
import { getAdminAnnouncementById } from '@/lib/admin/announcements';
import { updateAnnouncementAction } from '@/app/admin/(protected)/announcements/actions';

export const metadata = {
  title: 'お知らせを編集 | 管理画面',
};

export default async function EditAnnouncementPage({ params }: { params: { id: string } }) {
  const announcement = await getAdminAnnouncementById(params.id);

  if (!announcement) {
    notFound();
  }

  const boundAction = updateAnnouncementAction.bind(null, announcement.id);

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/announcements" className="text-sm text-kura hover:text-ink">
          ← お知らせ一覧に戻る
        </Link>
      </div>
      <h1 className="mb-8 font-display text-2xl text-ink">お知らせを編集</h1>
      <AnnouncementForm action={boundAction} initialValues={announcement} submitLabel="更新する" />
    </div>
  );
}

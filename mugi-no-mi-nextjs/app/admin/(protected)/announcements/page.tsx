import { ComingSoonNotice } from '@/components/admin/ComingSoonNotice';

export const metadata = {
  title: 'お知らせ管理 | 管理画面',
};

export default function AdminAnnouncementsPage() {
  return (
    <div>
      <h1 className="mb-8 font-display text-2xl text-ink">お知らせ管理</h1>
      <ComingSoonNotice description="営業日の変更や臨時休業などのお知らせを管理する機能は、現在準備中です。" />
    </div>
  );
}

import { ComingSoonNotice } from '@/components/admin/ComingSoonNotice';

export const metadata = {
  title: '店舗情報 | 管理画面',
};

export default function AdminStorePage() {
  return (
    <div>
      <h1 className="mb-8 font-display text-2xl text-ink">店舗情報</h1>
      <ComingSoonNotice description="住所・営業時間・駐車場案内などの店舗情報を管理画面から編集する機能は、現在準備中です。" />
    </div>
  );
}

import { ComingSoonNotice } from '@/components/admin/ComingSoonNotice';

export const metadata = {
  title: '設定 | 管理画面',
};

export default function AdminSettingsPage() {
  return (
    <div>
      <h1 className="mb-8 font-display text-2xl text-ink">設定</h1>
      <ComingSoonNotice description="管理画面の各種設定機能は、現在準備中です。" />
    </div>
  );
}

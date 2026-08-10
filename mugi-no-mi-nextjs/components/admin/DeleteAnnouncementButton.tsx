'use client';

import { useTransition } from 'react';
import { deleteAnnouncementAction } from '@/app/admin/(protected)/announcements/actions';

export function DeleteAnnouncementButton({ id, title }: { id: string; title: string }) {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    const confirmed = window.confirm(`「${title}」を削除します。この操作は取り消せません。よろしいですか?`);
    if (!confirmed) return;
    startTransition(() => {
      deleteAnnouncementAction(id);
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="min-h-[44px] rounded-[2px] border border-red-300 px-4 text-[13px] text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
    >
      {isPending ? '削除中…' : '削除'}
    </button>
  );
}

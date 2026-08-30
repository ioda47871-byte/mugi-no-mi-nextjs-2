'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { AdminAnnouncement } from '@/lib/admin/announcements';
import { computeAnnouncementStatus, ANNOUNCEMENT_STATUS_LABEL } from '@/lib/admin/announcement-status';
import { toggleAnnouncementPublishedAction } from '@/app/admin/(protected)/announcements/actions';
import { DeleteAnnouncementButton } from '@/components/admin/DeleteAnnouncementButton';
import { formatIsoToJstDisplay } from '@/lib/datetime';

const STATUS_TONE: Record<string, string> = {
  unpublished: 'border-line bg-white text-kura',
  scheduled: 'bg-brand-pale text-ink border-brand/50',
  active: 'bg-brand text-ink border-brand',
  expired: 'bg-red-100 text-red-700 border-red-300',
};

export function AdminAnnouncementsTable({ initialAnnouncements }: { initialAnnouncements: AdminAnnouncement[] }) {
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const handleTogglePublished = (announcement: AdminAnnouncement) => {
    const nextValue = !announcement.isPublished;
    setToggleError(null);
    setPendingId(announcement.id);

    // 楽観的更新: サーバーの応答を待たずに即座にUIへ反映する
    setAnnouncements((prev) =>
      prev.map((a) => (a.id === announcement.id ? { ...a, isPublished: nextValue } : a)),
    );

    startTransition(async () => {
      const result = await toggleAnnouncementPublishedAction(announcement.id, nextValue);
      setPendingId(null);

      if (!result.ok) {
        setAnnouncements((prev) =>
          prev.map((a) => (a.id === announcement.id ? { ...a, isPublished: !nextValue } : a)),
        );
        setToggleError(result.error ?? '更新に失敗しました。');
      }
    });
  };

  if (announcements.length === 0) {
    return (
      <p className="rounded-[2px] border border-dashed border-line px-6 py-12 text-center text-sm text-kura">
        お知らせがまだ登録されていません。「お知らせを追加」から最初の1件を登録してください。
      </p>
    );
  }

  return (
    <div>
      {toggleError && (
        <p className="mb-4 rounded-[2px] border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {toggleError}
        </p>
      )}

      <div className="overflow-x-auto rounded-[2px] border border-line">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-white text-left text-kura">
              <th className="px-4 py-3 font-normal">公開状態(クリックで切替)</th>
              <th className="px-4 py-3 font-normal">公開日</th>
              <th className="px-4 py-3 font-normal">タイトル</th>
              <th className="px-4 py-3 font-normal">公開終了日</th>
              <th className="px-4 py-3 font-normal">操作</th>
            </tr>
          </thead>
          <tbody>
            {announcements.map((announcement) => {
              const status = computeAnnouncementStatus(announcement);
              const isPending = pendingId === announcement.id;
              return (
                <tr key={announcement.id} className="border-b border-line last:border-b-0 odd:bg-white">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleTogglePublished(announcement)}
                      aria-pressed={announcement.isPublished}
                      title={announcement.isPublished ? '非公開にする' : '公開する'}
                      className={`min-h-[32px] rounded-full border px-3 text-[11px] tracking-wide transition-all duration-200 disabled:opacity-50 ${STATUS_TONE[status]}`}
                    >
                      {ANNOUNCEMENT_STATUS_LABEL[status]}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-kura">{formatIsoToJstDisplay(announcement.publishedAt)}</td>
                  <td className="px-4 py-3 text-ink">{announcement.title}</td>
                  <td className="px-4 py-3 text-kura">
                    {announcement.expiresAt ? formatIsoToJstDisplay(announcement.expiresAt) : '無期限'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/admin/announcements/${announcement.id}/edit`}
                        className="inline-flex min-h-[44px] items-center rounded-[2px] border border-line px-4 text-[13px] text-ink transition-colors hover:border-ink"
                      >
                        編集
                      </Link>
                      <DeleteAnnouncementButton id={announcement.id} title={announcement.title} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

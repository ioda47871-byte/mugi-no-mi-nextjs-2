import type { PublicAnnouncement } from '@/lib/announcements';
import { formatIsoToJstDisplay } from '@/lib/datetime';

interface AnnouncementNoticeProps {
  announcement: PublicAnnouncement | null;
}

/**
 * Accessページ用の、AnnouncementBannerより控えめなコンパクト版。
 * Homeが「一番最初に気づかせる」役割なのに対し、こちらは既に店舗情報を
 * 見に来ている人への確認情報という位置づけのため、同じ視覚言語(左ゴールド
 * アクセント・小さな「お知らせ」ラベル・補助的な日付)を使いつつ、余白・
 * 文字サイズを一回り小さくしてページの既存の案内文に馴染ませる
 * (0件の場合はコンポーネントごと非表示にする)。
 */
export function AnnouncementNotice({ announcement }: AnnouncementNoticeProps) {
  if (!announcement) return null;

  return (
    <div className="mx-auto mt-6 max-w-lg rounded-[8px] border border-brand/25 border-l-[3px] border-l-brand bg-white px-5 py-4 text-left">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-2 font-accent text-[11px] italic uppercase tracking-[0.16em] text-brand-text">
          <span aria-hidden className="inline-block h-px w-4 bg-gold" />
          お知らせ
        </span>
        <span className="text-[11px] text-kura/70">{formatIsoToJstDisplay(announcement.publishedAt)}</span>
      </div>
      <p className="mt-2 font-display text-[15px] leading-snug text-ink">{announcement.title}</p>
      <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-kura">{announcement.body}</p>
    </div>
  );
}

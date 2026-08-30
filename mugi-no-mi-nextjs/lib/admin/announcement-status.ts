/**
 * お知らせの公開状態判定。lib/admin/announcements.tsとは別ファイルにしているのは、
 * announcements.ts が next/headers を使うサーバー専用モジュール(lib/supabase/server.ts)
 * を読み込んでおり、クライアントコンポーネント(components/admin/AdminAnnouncementsTable.tsx)
 * からそのまま値としてimportするとクライアントバンドルにサーバー専用コードが
 * 混入してビルドエラーになるため。このファイルは外部依存なしの純粋関数のみで構成し、
 * サーバー・クライアントどちらからでも安全にimportできるようにしている。
 */

export type AnnouncementStatus = 'unpublished' | 'scheduled' | 'active' | 'expired';

export const ANNOUNCEMENT_STATUS_LABEL: Record<AnnouncementStatus, string> = {
  unpublished: '非公開',
  scheduled: '公開予定',
  active: '公開中',
  expired: '期限切れ',
};

/**
 * 公開状態を判定する。基準は3つ:
 *   1. is_published = true か
 *   2. published_at <= 現在時刻 か(未来なら「公開予定」)
 *   3. expires_at が NULL、または 現在時刻 < expires_at か(過ぎていれば「期限切れ」)
 * この3条件は supabase/announcements-setup.sql のRLSポリシー、および
 * lib/announcements.ts の公開側取得クエリと完全に同じ基準にしている。
 * Date同士の比較は絶対時刻(UTCインスタント)同士の比較のため、
 * サーバーの実行タイムゾーンには依存しない。
 */
export function computeAnnouncementStatus(
  announcement: { isPublished: boolean; publishedAt: string; expiresAt: string | null },
  now: Date = new Date(),
): AnnouncementStatus {
  if (!announcement.isPublished) return 'unpublished';
  if (new Date(announcement.publishedAt) > now) return 'scheduled';
  if (announcement.expiresAt && now >= new Date(announcement.expiresAt)) return 'expired';
  return 'active';
}

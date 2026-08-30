import { getSupabaseClient } from '@/lib/supabase/client';

/**
 * お知らせデータ層(公開サイト用)
 * ----------------------------------------------------------------
 * 現時点ではHomeの「最新1件」表示にのみ使用するが、将来 /news のような
 * 一覧ページを追加する場合も、取得ロジックはこのファイルに追加する
 * (コンポーネント側に直書きしない)。
 *
 * 管理画面(/admin/announcements)用の全件取得(非公開・公開予定・期限切れも
 * 含む)は lib/admin/announcements.ts を使用してください。こちらは公開サイト専用です。
 * ----------------------------------------------------------------
 */

export interface PublicAnnouncement {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
}

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  published_at: string;
}

/**
 * 公開条件(is_published = true かつ published_at <= 現在時刻 かつ
 * (expires_at が NULL、または 現在時刻 < expires_at))を満たすお知らせのうち、
 * published_at が最新の1件を取得する。
 *
 * この条件はRLSポリシー(supabase/announcements-setup.sql)と同じものを
 * アプリ側でも明示的に指定している(二重防御。RLS未設定・設定ミスの場合でも
 * 公開サイトに非公開のお知らせが表示されることを防ぐ)。
 *
 * Supabase未設定、またはテーブル未作成(SQL未実行)・取得エラーの場合は
 * 例外を投げず null を返す。呼び出し側(Home)はnullの場合セクションごと
 * 非表示にするため、この関数の失敗が公開サイトを壊すことはない。
 */
export async function getLatestPublishedAnnouncement(): Promise<PublicAnnouncement | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, body, published_at')
    .eq('is_published', true)
    .lte('published_at', nowIso)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[announcements] 取得に失敗しました。お知らせセクションを非表示にします:', error.message);
    return null;
  }

  if (!data) return null;

  const row = data as AnnouncementRow;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    publishedAt: row.published_at,
  };
}

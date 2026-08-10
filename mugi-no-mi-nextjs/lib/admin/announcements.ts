import { createClient } from '@/lib/supabase/server';

export interface AdminAnnouncement {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
  expiresAt: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  published_at: string;
  expires_at: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS = 'id, title, body, published_at, expires_at, is_published, created_at, updated_at';

function mapRow(row: AnnouncementRow): AdminAnnouncement {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
    isPublished: row.is_published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 管理画面用: 全お知らせを公開日時の新しい順で取得する(非公開・公開予定・期限切れも含む) */
export async function getAdminAnnouncements(): Promise<AdminAnnouncement[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('announcements')
    .select(SELECT_COLUMNS)
    .order('published_at', { ascending: false });

  if (error) {
    console.error('[admin] getAdminAnnouncements失敗:', error.message);
    throw new Error('お知らせ一覧の取得に失敗しました。');
  }

  return (data as AnnouncementRow[]).map(mapRow);
}

/** 管理画面の編集フォーム用: idから1件取得する */
export async function getAdminAnnouncementById(id: string): Promise<AdminAnnouncement | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('announcements')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[admin] getAdminAnnouncementById失敗:', error.message);
    throw new Error('お知らせの取得に失敗しました。');
  }

  return data ? mapRow(data as AnnouncementRow) : null;
}

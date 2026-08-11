import { createClient } from '@/lib/supabase/server';
import { SITE_PHOTO_SLOTS, type SitePhotoSlot } from '@/lib/admin/storage';

export interface AdminSitePhoto {
  slot: SitePhotoSlot;
  label: string;
  imageUrl: string | null;
  altText: string | null;
  updatedAt: string | null;
}

interface SitePhotoRow {
  slot: string;
  image_url: string | null;
  alt_text: string | null;
  updated_at: string;
}

/**
 * 管理画面用: 全スロットを固定の表示順(SITE_PHOTO_SLOTS)で取得する。
 * storage_path / original_storage_pathは削除・差し替え処理(Server Action側)
 * でのみ必要なため、ここでは取得しない(管理画面の一覧表示には不要)。
 */
export async function getAdminSitePhotos(): Promise<AdminSitePhoto[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('site_photos')
    .select('slot, image_url, alt_text, updated_at');

  if (error) {
    console.error('[admin] getAdminSitePhotos失敗:', error.message);
    throw new Error('サイト写真の取得に失敗しました。');
  }

  const rowBySlot = new Map((data as SitePhotoRow[]).map((row) => [row.slot, row]));

  return SITE_PHOTO_SLOTS.map(({ slot, label }) => {
    const row = rowBySlot.get(slot);
    return {
      slot,
      label,
      imageUrl: row?.image_url ?? null,
      altText: row?.alt_text ?? null,
      updatedAt: row?.updated_at ?? null,
    };
  });
}

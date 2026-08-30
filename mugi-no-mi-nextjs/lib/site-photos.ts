import { cache } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { SITE_PHOTO_SLOT_VALUES, isSitePhotoSlot, type SitePhotoSlot } from '@/lib/admin/storage';

/**
 * サイト写真(Hero/外観/入口/店内/ショーケース/雑貨/ディスプレイ)の公開サイト向け
 * データ層。管理画面からのアップロードが無い(または取得に失敗した)スロットは、
 * 既存の静的ファイル(public/images/{slot}.jpg)へフォールバックする。
 *
 * 公開サイトが参照するのは「最適化済み(WebP)」のURLのみ。オリジナルファイルの
 * パス(original_storage_path)はここでは一切取得・公開しない。
 */

export interface SitePhoto {
  slot: SitePhotoSlot;
  url: string;
  alt: string;
}

// heroとexteriorは同じ被写体を指すことが多いが、将来的に別々に差し替えられる
// よう独立したスロットとして扱う(Hero比較検討時の決定を踏襲)。
const DEFAULT_ALT: Record<SitePhotoSlot, string> = {
  hero: '柳の木とBrot yanagiの外観',
  exterior: '柳の木とBrot yanagiの外観',
  entrance: 'Brot yanagiの入口',
  interior: 'Brot yanagiの店内',
  kitchen: 'ガラス越しに見えるBrot yanagiの厨房',
  showcase: '焼きたてのパンが並ぶBrot yanagiのショーケース',
  'goods-corner': '雑貨コーナーの様子',
  'display-accent': '店先の小物のディスプレイ',
};

const STATIC_FALLBACK_PATH: Record<SitePhotoSlot, string> = {
  hero: '/images/exterior.jpg',
  exterior: '/images/exterior.jpg',
  entrance: '/images/entrance.jpg',
  interior: '/images/interior.jpg',
  kitchen: '/images/kitchen.jpg',
  showcase: '/images/showcase.jpg',
  'goods-corner': '/images/goods-corner.jpg',
  'display-accent': '/images/display-accent.jpg',
};

interface SitePhotoRow {
  slot: string;
  image_url: string | null;
  alt_text: string | null;
}

function buildFallbackMap(): Record<SitePhotoSlot, SitePhoto> {
  const entries = SITE_PHOTO_SLOT_VALUES.map((slot) => [
    slot,
    { slot, url: STATIC_FALLBACK_PATH[slot], alt: DEFAULT_ALT[slot] } satisfies SitePhoto,
  ]);
  return Object.fromEntries(entries) as Record<SitePhotoSlot, SitePhoto>;
}

/**
 * 全スロット分の写真情報を取得する。React cache()でリクエスト単位に
 * メモ化しているため、同一ページ内の複数コンポーネント(Hero・About・
 * MenuSectionなど)がそれぞれ呼び出しても、実際のSupabase問い合わせは
 * 1回だけになる。
 *
 * Supabase未設定・取得エラー・該当スロットのimage_urlがnullの場合は、
 * 既存の静的ファイルパスにフォールバックする(画像未設定時の挙動)。
 */
export const getSitePhotos = cache(async (): Promise<Record<SitePhotoSlot, SitePhoto>> => {
  const fallback = buildFallbackMap();

  const supabase = getSupabaseClient();
  if (!supabase) return fallback;

  const { data, error } = await supabase.from('site_photos').select('slot, image_url, alt_text');

  if (error) {
    console.error('[site-photos] 取得に失敗しました。フォールバック画像を使用します:', error.message);
    return fallback;
  }

  const result = { ...fallback };
  for (const row of data as SitePhotoRow[]) {
    if (!isSitePhotoSlot(row.slot)) continue;
    if (row.image_url) {
      result[row.slot] = {
        slot: row.slot,
        url: row.image_url,
        alt: row.alt_text || DEFAULT_ALT[row.slot],
      };
    }
  }
  return result;
});

/** 単一スロットの写真情報を取得する(内部でgetSitePhotos()のキャッシュ結果を使う) */
export async function getSitePhoto(slot: SitePhotoSlot): Promise<SitePhoto> {
  const photos = await getSitePhotos();
  return photos[slot];
}

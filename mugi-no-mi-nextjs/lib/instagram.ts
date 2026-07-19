import { unstable_cache } from 'next/cache';

/**
 * Instagram投稿データ層(Instagram Graph API連携)
 * ----------------------------------------------------------------
 * INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_USER_ID を使い、Instagram Graph APIから
 * 実際の最新投稿を取得します。値はコード内にハードコードせず、必ず環境変数から
 * 取得してください(.env.example参照)。
 *
 * 【アクセストークンの種類】
 * INSTAGRAM_ACCESS_TOKEN には長期アクセストークン(Long-lived Access Token。
 * 有効期間は発行から約60日間)を設定する前提です。短期アクセストークン
 * (Short-lived Access Token、有効期間は約1時間)を直接設定する運用は
 * 想定していません(1時間ごとに手動で環境変数を更新するのは非現実的なため)。
 * このファイルには自動更新(トークンリフレッシュ)の仕組みは実装していないため、
 * 60日の有効期限が切れる前に、運用担当者が手動でトークンを再発行し、
 * Vercelの環境変数を更新・再デプロイしてください。期限切れの間は、
 * 下記【フォールバック】の通り自動的に案内表示へ切り替わるため、
 * サイトが壊れることはありません。
 *
 * 【キャッシュ】
 * unstable_cache で約1時間(REVALIDATE_SECONDS)キャッシュしています。
 * ページ側(app/page.tsx)には商品データ用の `export const revalidate = 60` が
 * 既に設定されていますが、unstable_cacheはそれとは独立した有効期限を持つため、
 * Instagram APIへは実際には約1時間に1回しかアクセスしません
 * (`export const revalidate` はページ全体の再検証間隔であり、
 * unstable_cacheの中身の鮮度はそれとは別に管理されます)。
 *
 * 【フォールバック】
 * 取得に失敗した場合はエラーを投げず、空配列を返します。
 * 呼び出し側(components/sections/InstagramGrid.tsx)は空配列の場合、
 * エラー画面ではなく案内文+Instagramボタンのみを表示します。
 * ----------------------------------------------------------------
 */

/** 表示する投稿数。将来 6→9→12 のように変更する場合はここだけを直せばよい。 */
export const INSTAGRAM_POST_COUNT = 6;

const INSTAGRAM_API_VERSION = 'v21.0';
const REVALIDATE_SECONDS = 60 * 60; // 約1時間
const FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';

export interface InstagramPost {
  id: string;
  /** 表示用の正方形サムネイル画像URL。動画投稿の場合はthumbnail_urlを使用する。 */
  imageUrl: string;
  caption: string;
  /** クリック時の遷移先(実際の投稿ページ)。 */
  permalink: string;
}

interface InstagramMediaItem {
  id: string;
  caption?: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
}

interface InstagramMediaResponse {
  data?: InstagramMediaItem[];
}

function mapToPost(item: InstagramMediaItem): InstagramPost | null {
  // VIDEO投稿はmedia_urlが動画ファイルそのものなので、サムネイル画像
  // (thumbnail_url)が無ければ正方形グリッドに表示できないため除外する。
  const imageUrl = item.media_type === 'VIDEO' ? item.thumbnail_url : item.media_url;
  if (!imageUrl) return null;

  return {
    id: item.id,
    imageUrl,
    caption: item.caption ?? '',
    permalink: item.permalink,
  };
}

/** Instagram Graph APIへ実際にアクセスする処理(キャッシュ無し)。 */
async function fetchLatestInstagramPosts(limit: number): Promise<InstagramPost[]> {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const userId = process.env.INSTAGRAM_USER_ID;

  if (!accessToken || !userId) {
    throw new Error('INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_USER_ID が未設定です。');
  }

  const url = `https://graph.instagram.com/${INSTAGRAM_API_VERSION}/${userId}/media?fields=${FIELDS}&limit=${limit}&access_token=${accessToken}`;

  // キャッシュはunstable_cache側でのみ管理するため、fetch自体はキャッシュしない。
  const response = await fetch(url, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Instagram APIエラー: HTTP ${response.status}`);
  }

  const json = (await response.json()) as InstagramMediaResponse;
  const items = json.data ?? [];

  return items
    .map(mapToPost)
    .filter((post): post is InstagramPost => post !== null)
    .slice(0, limit);
}

/**
 * unstable_cacheでラップし、約1時間(REVALIDATE_SECONDS)ごとにのみ
 * 実際にInstagram APIへアクセスする。取得に失敗した場合(=Promiseがreject)は
 * 結果をキャッシュせず、次回呼び出し時に再度取得を試みる。
 */
const getCachedInstagramPosts = unstable_cache(
  (limit: number) => fetchLatestInstagramPosts(limit),
  ['instagram-latest-posts'],
  { revalidate: REVALIDATE_SECONDS },
);

/** 最新投稿を取得する。取得に失敗した場合は空配列を返す(エラーを投げない)。 */
export async function getLatestInstagramPosts(limit: number = INSTAGRAM_POST_COUNT): Promise<InstagramPost[]> {
  try {
    return await getCachedInstagramPosts(limit);
  } catch (err) {
    console.error('[instagram] 投稿取得に失敗しました:', err instanceof Error ? err.message : 'unknown error');
    return [];
  }
}

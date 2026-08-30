import 'server-only';
import { unstable_cache, revalidateTag } from 'next/cache';
import { resolveAccessToken } from './token-store';

/**
 * Instagram投稿データ層(Instagram Graph API連携)
 * ----------------------------------------------------------------
 * INSTAGRAM_USER_ID(環境変数)と、Supabaseに保存されたアクセストークン
 * (無ければ INSTAGRAM_INITIAL_ACCESS_TOKEN。resolveAccessToken参照)を使い、
 * Instagram Graph APIから実際の最新投稿を取得します。
 *
 * 【キャッシュ】
 * unstable_cache で約1時間(REVALIDATE_SECONDS)キャッシュしています。
 * ページ側(app/page.tsx)には商品データ用の `export const revalidate = 60` が
 * 既に設定されていますが、unstable_cacheはそれとは独立した有効期限を持つため、
 * Instagram APIへは実際には約1時間に1回しかアクセスしません。
 *
 * キャッシュタグ(INSTAGRAM_POSTS_CACHE_TAG)を設定しており、
 * Cronでのトークン更新が成功した直後は revalidateInstagramPostsCache() を
 * 呼び出すことで、最大1時間待たずに最新のトークンでの取得へ切り替えられます。
 *
 * 【フォールバック】
 * 取得に失敗した場合はエラーを投げず、空配列を返します。
 * 呼び出し側(components/sections/InstagramGrid.tsx)は空配列の場合、
 * エラー画面ではなく案内文+Instagramボタンのみを表示します。
 * ----------------------------------------------------------------
 */

/** 表示する投稿数。将来 6→9→12 のように変更する場合はここだけを直せばよい。 */
export const INSTAGRAM_POST_COUNT = 6;

/** unstable_cacheのキャッシュタグ。トークン更新後の即時revalidateに使用する。 */
export const INSTAGRAM_POSTS_CACHE_TAG = 'instagram-posts';

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
  const userId = process.env.INSTAGRAM_USER_ID;
  if (!userId) {
    throw new Error('INSTAGRAM_USER_ID が未設定です。');
  }

  const accessToken = await resolveAccessToken();
  if (!accessToken) {
    throw new Error(
      'Instagramアクセストークンを取得できません(Supabase未登録・INSTAGRAM_INITIAL_ACCESS_TOKEN未設定)。',
    );
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
  { revalidate: REVALIDATE_SECONDS, tags: [INSTAGRAM_POSTS_CACHE_TAG] },
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

/**
 * Instagram投稿一覧のキャッシュを即時に無効化する。
 * トークン更新(Cron)が成功した直後に呼び出すことで、最大1時間待たずに
 * 新しいトークンでの取得へ切り替わる(app/api/cron/refresh-instagram-token参照)。
 */
export function revalidateInstagramPostsCache(): void {
  revalidateTag(INSTAGRAM_POSTS_CACHE_TAG);
}

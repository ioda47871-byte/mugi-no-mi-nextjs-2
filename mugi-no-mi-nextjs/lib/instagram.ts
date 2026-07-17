import instagramData from '@/data/instagram-posts.json';

/**
 * Instagram投稿データ層
 * ----------------------------------------------------------------
 * 現在は `data/instagram-posts.json` の仮データ(架空の投稿)を表示しています。
 *
 * 本番では、Instagram Graph API(Instagram Business/Creator アカウント +
 * Facebook開発者アカウントでのアクセストークン発行が必要)に接続し、
 * 実際の最新投稿を取得する形に差し替えてください。移行時のイメージ:
 *
 *   export async function getLatestInstagramPosts(limit = 6): Promise<InstagramPost[]> {
 *     const res = await fetch(
 *       `https://graph.instagram.com/me/media?fields=id,caption,media_url,permalink&access_token=${token}`,
 *       { next: { revalidate: 3600 } } // 1時間キャッシュなど
 *     );
 *     const json = await res.json();
 *     return json.data.slice(0, limit).map(...);
 *   }
 *
 * その場合、呼び出し側の `app/about/page.tsx` を Server Component のまま
 * `await getLatestInstagramPosts()` に変更するだけで反映できます。
 * ----------------------------------------------------------------
 */

export interface InstagramPost {
  id: string;
  image: string;
  caption: string;
  /** 実際の投稿URL。仮データの間は null。 */
  permalink: string | null;
}

interface InstagramJson {
  posts: InstagramPost[];
}

const raw = instagramData as InstagramJson;

export function getLatestInstagramPosts(limit = 6): InstagramPost[] {
  return raw.posts.slice(0, limit);
}

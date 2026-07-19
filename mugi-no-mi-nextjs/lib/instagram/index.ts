/**
 * lib/instagram/ の公開エントリポイント。
 * 既存の `import ... from '@/lib/instagram'` を変更せずに済むよう、
 * 内部で分割したモジュールの公開APIのみをここから再エクスポートしている。
 *
 * - posts.ts       : 投稿取得(表示コンポーネントが使う本体)
 * - token-store.ts : Supabaseでのトークン保存・解決(Cronルートが使う)
 * - refresh.ts     : Instagram公式のトークンリフレッシュ呼び出し(Cronルートが使う)
 */
export {
  getLatestInstagramPosts,
  revalidateInstagramPostsCache,
  INSTAGRAM_POST_COUNT,
  INSTAGRAM_POSTS_CACHE_TAG,
  type InstagramPost,
} from './posts';

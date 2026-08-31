/**
 * 楽天の紹介URLの取り扱い（計画書 6節）。
 *
 * Phase 1 では楽天APIを使わず、アフィリエイト管理画面で発行済みの紹介URLを
 * データへ保存してそのまま使う。加工・独自クエリの追加はしない。
 */

/**
 * 許可ホストの根拠:
 * - `hb.afl.rakuten.co.jp` … 楽天アフィリエイトが発行するリンクのリダイレクトホスト。
 * - `a.r10.to` … 楽天アフィリエイト管理画面が発行する公式短縮URL。
 *
 * 注意: この一覧は実装時点の知識に基づく暫定値です。
 * 公開前に、実際に管理画面で発行したリンクのホストと突き合わせて確認してください
 * （docs/launch-checklist.md の「アフィリエイト設定」を参照）。
 * `item.rakuten.co.jp` などの通常の商品URLは紹介URLではないため許可しません。
 */
export const RAKUTEN_AFFILIATE_HOSTS = ['hb.afl.rakuten.co.jp', 'a.r10.to'] as const;

export function isRakutenAffiliateUrl(rawUrl: string | null | undefined): boolean {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return false;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  return (RAKUTEN_AFFILIATE_HOSTS as readonly string[]).includes(url.hostname);
}

/** 発行済み紹介URLをそのまま返す。加工しない。無効なら null。 */
export function normalizeRakutenUrl(rawUrl: string | null | undefined): string | null {
  return isRakutenAffiliateUrl(rawUrl) ? (rawUrl as string) : null;
}

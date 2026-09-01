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

/** 商品ページのホスト。確認用URLとして認めるのはここだけ。 */
export const RAKUTEN_ITEM_HOST = 'item.rakuten.co.jp';

/**
 * 紹介URLから「確認用の商品ページURL」を取り出す。
 *
 * **externalProductId から URL を組み立ててはいけない。**
 * `shop:10001396` の数字は店舗内の管理番号で、商品ページのURLスラッグ
 * （例: `lac0017901-0010`）とは別物。数字をURLに入れると別ページか404になる。
 *
 * 正しい入手元は、紹介URLの `pc` パラメータに入っている遷移先URL。
 * デコード後に https と item.rakuten.co.jp だけを許可し、それ以外は null を返す。
 * 短縮URL（a.r10.to）は遷移先を含まないため null になる。
 *
 * 戻り値は通常の商品URLで、アフィリエイトIDを含まない。ログに出してよい。
 */
export function itemPageUrlFromAffiliateUrl(rawUrl: string | null | undefined): string | null {
  if (!isRakutenAffiliateUrl(rawUrl)) return null;
  let affiliate: URL;
  try {
    affiliate = new URL(rawUrl as string);
  } catch {
    return null;
  }
  const target = affiliate.searchParams.get('pc');
  if (!target) return null;

  let item: URL;
  try {
    // searchParams はデコード済みの値を返す。二重エンコードされていても
    // URL として解釈できなければここで弾かれる。
    item = new URL(target);
  } catch {
    return null;
  }
  if (item.protocol !== 'https:') return null;
  if (item.hostname !== RAKUTEN_ITEM_HOST) return null;
  return item.toString();
}

/**
 * Amazon の公式リンク形式を生成する（計画書 6節）。
 *
 * この関数が検証するのは「URLの形式」だけ。
 * 商品の実在・同一性・アカウントの有効性は検証しない。
 * 呼び出し側で MerchantLink.status === 'verified' とバリエーション一致を確認すること。
 */

export const AMAZON_ORIGIN = 'https://www.amazon.co.jp';

/** ASIN は英大文字と数字の10桁。 */
export const ASIN_PATTERN = /^[A-Z0-9]{10}$/;

/** アソシエイトのトラッキングID。英数字とハイフンのみ。 */
export const ASSOCIATE_TAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{2,29}$/;

export function isValidAsin(value: string): boolean {
  return ASIN_PATTERN.test(value);
}

export function buildAmazonUrl(asin: string, tag?: string | null): string | null {
  if (typeof asin !== 'string' || !ASIN_PATTERN.test(asin)) return null;
  if (!tag || typeof tag !== 'string' || !ASSOCIATE_TAG_PATTERN.test(tag)) return null;
  const url = new URL(`${AMAZON_ORIGIN}/dp/${asin}/ref=nosim`);
  url.searchParams.set('tag', tag);
  return url.toString();
}

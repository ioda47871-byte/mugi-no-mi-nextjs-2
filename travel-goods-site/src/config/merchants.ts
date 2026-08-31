/**
 * 販売先（店舗）の有効設定。
 *
 * 方針（計画書 6節）:
 * - 紹介ID・紹介URLが無い店舗のボタンは「表示しない」。ダミーURLや '#' を使わない。
 * - Amazon: 本人の AMAZON_ASSOCIATE_TAG がある場合のみ有効。
 * - 楽天: 商品ごとに管理画面で発行済みの紹介URLをデータへ保存する方式のため、
 *   環境変数は不要。データ側に verified な affiliateUrl があれば有効。
 */

export type Merchant = 'amazon' | 'rakuten';

export const MERCHANTS: readonly Merchant[] = ['amazon', 'rakuten'] as const;

export const MERCHANT_LABELS: Record<Merchant, string> = {
  amazon: 'Amazon',
  rakuten: '楽天市場',
};

/** CTA 文言。販売先が分かる表現にする。 */
export const MERCHANT_CTA_LABELS: Record<Merchant, string> = {
  amazon: 'Amazonで商品を見る',
  rakuten: '楽天市場で商品を見る',
};

export type MerchantConfig = {
  /** Amazonアソシエイトのトラッキングid。未設定なら null。 */
  amazonAssociateTag: string | null;
  /** 楽天の紹介リンク掲載を有効にするか（データ側に verified リンクがあるか次第）。 */
  rakutenEnabled: boolean;
};

function readTag(): string | null {
  const raw = process.env.AMAZON_ASSOCIATE_TAG;
  if (typeof raw !== 'string') return null;
  const tag = raw.trim();
  if (tag.length === 0) return null;
  // 形式が想定外のものは「未設定」と同じ扱いにする（誤った tag を配信しない）。
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{2,29}$/.test(tag)) return null;
  return tag;
}

export function getMerchantConfig(): MerchantConfig {
  return {
    amazonAssociateTag: readTag(),
    // 楽天は「発行済み紹介URLがデータにあること」を各リンクで判定するため、既定で有効。
    rakutenEnabled: true,
  };
}

/** 店舗が 1 つも有効でない場合、収益化は未設定。about / check:release で使う。 */
export function monetizationStatus(config: MerchantConfig = getMerchantConfig()) {
  return {
    amazon: config.amazonAssociateTag !== null,
    // 楽天は個別リンクの有無で決まるため、ここでは「掲載機構が有効か」だけを示す。
    rakuten: config.rakutenEnabled,
  };
}

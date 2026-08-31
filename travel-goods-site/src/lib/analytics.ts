/**
 * 計測（計画書 9節）。
 *
 * 原則:
 * - 計測IDが未設定なら「何もしない」。サイトの動作には影響させない。
 * - 計測の成否でリンク遷移を待たせない・妨げない。中継サーバーを作らない。
 * - 氏名・メール・住所・完全な外部URL・クエリ文字列をイベントに入れない。
 */

export type AffiliateClickEvent = {
  /** 記事から押された場合は記事slug、カテゴリ画面なら null。 */
  articleSlug: string | null;
  /** カテゴリ画面から押された場合のカテゴリ識別子。 */
  categoryId: string | null;
  productId: string;
  merchant: 'amazon' | 'rakuten';
  /** 画面内の設置位置（card / comparison-table など）。 */
  placement: string;
};

type GtagWindow = Window & {
  gtag?: (command: string, eventName: string, params: Record<string, string>) => void;
};

export function isAnalyticsEnabled(): boolean {
  const id = process.env.NEXT_PUBLIC_GA_ID;
  return typeof id === 'string' && id.trim().length > 0;
}

/** 送信は best-effort。失敗しても例外を外へ出さない。 */
export function trackAffiliateClick(event: AffiliateClickEvent): void {
  if (typeof window === 'undefined') return;
  if (!isAnalyticsEnabled()) return;

  const gtag = (window as GtagWindow).gtag;
  if (typeof gtag !== 'function') return;

  try {
    gtag('event', 'affiliate_click', {
      // 送るのは識別子のみ。URLやクエリ文字列は送らない。
      article_slug: event.articleSlug ?? '',
      category_id: event.categoryId ?? '',
      product_id: event.productId,
      merchant: event.merchant,
      placement: event.placement,
    });
  } catch {
    // 計測失敗は無視する（購入導線を止めない）。
  }
}

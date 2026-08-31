'use client';

import { MERCHANT_LABELS } from '@/config/merchants';
import { SUPPRESSION_MESSAGES, type MerchantLinkResolution } from '@/lib/affiliate/resolve';
import AffiliateLink from './AffiliateLink';

/**
 * 購入導線。
 * 表示できるリンクが1件も無い場合はボタンを出さず、理由だけを静かに示す。
 * ダミーURL・'#'・別人の紹介IDは使わない。
 */

type Props = {
  productId: string;
  resolution: MerchantLinkResolution;
  placement: string;
  articleSlug?: string | null;
  categoryId?: string | null;
};

export default function MerchantActions({
  productId,
  resolution,
  placement,
  articleSlug = null,
  categoryId = null,
}: Props) {
  if (resolution.links.length === 0) {
    return (
      <p
        className="rounded-lg bg-paper px-3 py-2 text-xs leading-relaxed text-ink-faint"
        data-testid="merchant-suppressed"
      >
        購入リンクは未掲載です。
        <span className="block">
          理由:{' '}
          {resolution.suppressed
            .map((item) => `${MERCHANT_LABELS[item.merchant]}=${SUPPRESSION_MESSAGES[item.reason]}`)
            .join(' / ')}
        </span>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        {resolution.links.map((link) => (
          <AffiliateLink
            key={link.merchant}
            merchant={link.merchant}
            href={link.href}
            productId={productId}
            articleSlug={articleSlug}
            categoryId={categoryId}
            placement={placement}
          />
        ))}
      </div>
      <p className="text-xs text-ink-faint">
        価格・在庫・送料・ポイントは販売先ページでご確認ください（当サイトでは表示していません）。
      </p>
    </div>
  );
}

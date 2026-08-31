'use client';

import { MERCHANT_CTA_LABELS } from '@/config/merchants';
import { trackAffiliateClick } from '@/lib/analytics';
import type { MerchantName } from '@/lib/catalog/types';

/**
 * 広告リンク（計画書 6節・9節）。
 *
 * - rel="sponsored noopener"（新規タブなら noreferrer も付ける）
 * - 新規タブで開くことをアクセシブルに知らせる
 * - 計測は preventDefault せず、遷移を待たせない・妨げない
 * - href は resolveMerchantLinks を通ったものだけが渡ってくる
 */

type Props = {
  merchant: MerchantName;
  href: string;
  productId: string;
  articleSlug?: string | null;
  categoryId?: string | null;
  placement: string;
};

export default function AffiliateLink({
  merchant,
  href,
  productId,
  articleSlug = null,
  categoryId = null,
  placement,
}: Props) {
  const label = MERCHANT_CTA_LABELS[merchant];

  return (
    <a
      href={href}
      target="_blank"
      rel="sponsored noopener noreferrer"
      data-merchant={merchant}
      data-product-id={productId}
      className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-dark"
      onClick={() => {
        // 計測が失敗しても遷移は続く（例外は analytics 側で握りつぶす）。
        trackAffiliateClick({ articleSlug, categoryId, productId, merchant, placement });
      }}
    >
      <span>{label}</span>
      <span aria-hidden="true">↗</span>
      <span className="sr-only">（広告・新しいタブで開きます）</span>
    </a>
  );
}

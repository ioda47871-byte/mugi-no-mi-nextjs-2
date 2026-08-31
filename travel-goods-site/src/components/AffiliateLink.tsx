'use client';

import { MERCHANT_CTA_LABELS } from '@/config/merchants';
import { trackAffiliateClick } from '@/lib/analytics';
import type { MerchantName } from '@/lib/catalog/types';

/**
 * 広告リンク（計画書 6節・9節）。
 *
 * - rel は販売先が発行するコードに合わせる（下記 REL の注記を参照）
 * - 新規タブで開くことをアクセシブルに知らせる
 * - 計測は preventDefault せず、遷移を待たせない・妨げない
 * - href は resolveMerchantLinks を通ったものだけが渡ってくる
 */

/**
 * 広告リンクの rel。
 *
 * `noreferrer` は付けない。
 * 楽天アフィリエイトが発行するリンクコード自体が `nofollow sponsored noopener` で、
 * `noreferrer` を含んでいないため。リファラを落とすと成果の判定に影響する可能性がある。
 * タブナビング対策は `noopener` だけで足りる。
 *
 * 注: 成果判定の実際の仕組みは各社の非公開情報のため確認できていない。
 * 発行元のコードに合わせる、という方針で揃えている。
 */
export const AFFILIATE_LINK_REL = 'nofollow sponsored noopener';

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
      rel={AFFILIATE_LINK_REL}
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

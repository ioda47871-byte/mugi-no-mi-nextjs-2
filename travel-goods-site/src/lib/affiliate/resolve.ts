import type { MerchantConfig } from '@/config/merchants';
import { MERCHANTS } from '@/config/merchants';
import type { MerchantLink, MerchantName, Product } from '@/lib/catalog/types';
import { buildAmazonUrl } from './amazon';
import { normalizeRakutenUrl } from './rakuten';

/**
 * 表示してよい購入リンクだけを返す（計画書 6節）。
 *
 * 通す条件（すべて満たすもののみ）:
 *   1. その商品のリンクであること
 *   2. status === 'verified'（照合済み）
 *   3. matchedVariant が商品の variant と一致
 *   4. 店舗が有効に設定されていること（紹介ID／発行済み紹介URL）
 *   5. URL が HTTPS かつ許可された公式ドメイン
 *
 * 1つでも欠ければリンクを返さない。ダミーURL・'#'・他人の紹介IDで代替しない。
 */

export type ResolvedMerchantLink = {
  merchant: MerchantName;
  href: string;
  externalProductId: string;
  verifiedAt: string | null;
};

/** なぜリンクを出せないのかを画面と運用に伝えるための理由コード。 */
export type SuppressionReason =
  | 'no-link-registered'
  | 'not-verified'
  | 'variant-mismatch'
  | 'merchant-not-configured'
  | 'invalid-url';

export type MerchantLinkResolution = {
  links: ResolvedMerchantLink[];
  suppressed: { merchant: MerchantName; reason: SuppressionReason }[];
};

function resolveOne(
  product: Product,
  link: MerchantLink,
  config: MerchantConfig,
): { ok: true; value: ResolvedMerchantLink } | { ok: false; reason: SuppressionReason } {
  if (link.productId !== product.id) return { ok: false, reason: 'no-link-registered' };
  if (link.status !== 'verified') return { ok: false, reason: 'not-verified' };
  if (link.matchedVariant !== product.variant) return { ok: false, reason: 'variant-mismatch' };

  if (link.merchant === 'amazon') {
    if (!config.amazonAssociateTag) return { ok: false, reason: 'merchant-not-configured' };
    const href = buildAmazonUrl(link.externalProductId, config.amazonAssociateTag);
    if (!href) return { ok: false, reason: 'invalid-url' };
    return {
      ok: true,
      value: {
        merchant: 'amazon',
        href,
        externalProductId: link.externalProductId,
        verifiedAt: link.verifiedAt,
      },
    };
  }

  if (!config.rakutenEnabled) return { ok: false, reason: 'merchant-not-configured' };
  const href = normalizeRakutenUrl(link.affiliateUrl);
  if (!href) return { ok: false, reason: 'invalid-url' };
  return {
    ok: true,
    value: {
      merchant: 'rakuten',
      href,
      externalProductId: link.externalProductId,
      verifiedAt: link.verifiedAt,
    },
  };
}

export function resolveMerchantLinks(
  product: Product,
  links: MerchantLink[],
  config: MerchantConfig,
): MerchantLinkResolution {
  const resolution: MerchantLinkResolution = { links: [], suppressed: [] };

  for (const merchant of MERCHANTS) {
    const candidates = links.filter(
      (link) => link.productId === product.id && link.merchant === merchant,
    );
    if (candidates.length === 0) {
      resolution.suppressed.push({ merchant, reason: 'no-link-registered' });
      continue;
    }

    let accepted: ResolvedMerchantLink | null = null;
    let lastReason: SuppressionReason = 'no-link-registered';
    for (const candidate of candidates) {
      const result = resolveOne(product, candidate, config);
      if (result.ok) {
        accepted = result.value;
        break;
      }
      lastReason = result.reason;
    }

    if (accepted) {
      resolution.links.push(accepted);
    } else {
      resolution.suppressed.push({ merchant, reason: lastReason });
    }
  }

  return resolution;
}

export const SUPPRESSION_MESSAGES: Record<SuppressionReason, string> = {
  'no-link-registered': '販売先リンク未登録',
  'not-verified': '販売先の型番照合が未完了',
  'variant-mismatch': '販売先のバリエーションが不一致',
  'merchant-not-configured': '店舗の紹介設定が未登録',
  'invalid-url': '紹介URLの形式が不正',
};

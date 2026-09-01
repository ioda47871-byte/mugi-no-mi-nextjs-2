'use client';

import type { MerchantLinkResolution } from '@/lib/affiliate/resolve';
import AffiliateLink from './AffiliateLink';

/**
 * 購入導線。
 *
 * 表示できるリンクが1件も無い場合は、**何も描画しない**。
 * 「紹介ID未設定」「型番照合が未完了」といった運営側の事情は読者向け画面に出さず、
 * 内部資料（`npm run validate:content` の出力と docs/status.md）へ記録する。
 *
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
  if (resolution.links.length === 0) return null;

  return (
    <div className="space-y-1.5" data-testid="merchant-actions">
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
      <p className="text-[0.7rem] leading-relaxed text-ink-faint">
        広告リンクです。価格・在庫は販売先ページでご確認ください。
        {/* 掲載しているのは1つの色・サイズだが、販売ページ側が選択式のことがある。
            読者が対象の仕様を自分で選ぶ必要があることを、遷移前に伝える。 */}
        <br />
        色・サイズが選択式の場合は、販売ページで対象の仕様を選択してください。
      </p>
    </div>
  );
}

import { getMerchantConfig } from '@/config/merchants';
import { missingLaunchSettings, siteConfig } from '@/config/site';
import type { Catalog } from '@/lib/catalog/types';

/**
 * 開発用の状態表示。**プレビューモードでのみ描画する。**
 *
 * データセット名、登録件数、環境変数名、未設定項目といった内部情報は
 * 読者向けページには置かず、ここと docs/status.md にまとめる（追記指示 4節）。
 */
export default function DevInfoBar({
  catalog,
  publishedProducts,
  publishedArticles,
  withheldArticles,
}: {
  catalog: Catalog;
  publishedProducts: number;
  publishedArticles: number;
  withheldArticles: number;
}) {
  if (siteConfig.isProduction) return null;

  const merchants = getMerchantConfig();
  const missing = missingLaunchSettings();

  return (
    <details
      data-testid="dev-info"
      className="border-b border-paper-line bg-ink/5 px-4 py-1.5 text-[0.7rem] text-ink-faint"
    >
      <summary className="cursor-pointer select-none">
        開発情報（プレビューのみ表示・本番ビルドには出力されません）
      </summary>
      <dl className="mx-auto mt-2 grid max-w-5xl gap-x-6 gap-y-1 pb-2 sm:grid-cols-2">
        <div className="flex gap-2">
          <dt>データセット</dt>
          <dd className="font-medium text-ink-soft">
            {catalog.dataset.kind}（{catalog.dataset.label}）
          </dd>
        </div>
        <div className="flex gap-2">
          <dt>SITE_MODE</dt>
          <dd className="font-medium text-ink-soft">{siteConfig.mode}</dd>
        </div>
        <div className="flex gap-2">
          <dt>商品</dt>
          <dd className="font-medium text-ink-soft">
            公開 {publishedProducts} / 登録 {catalog.products.length}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt>記事</dt>
          <dd className="font-medium text-ink-soft">
            公開 {publishedArticles} / 保留 {withheldArticles}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt>出典</dt>
          <dd className="font-medium text-ink-soft">{catalog.sources.length} 件</dd>
        </div>
        <div className="flex gap-2">
          <dt>販売先リンク</dt>
          <dd className="font-medium text-ink-soft">
            照合済み {catalog.merchantLinks.filter((link) => link.status === 'verified').length} /{' '}
            {catalog.merchantLinks.length}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt>AMAZON_ASSOCIATE_TAG</dt>
          <dd className="font-medium text-ink-soft">
            {merchants.amazonAssociateTag ? '設定済み' : '未設定'}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt>NEXT_PUBLIC_GA_ID</dt>
          <dd className="font-medium text-ink-soft">
            {siteConfig.gaMeasurementId ? '設定済み' : '未設定'}
          </dd>
        </div>
        {missing.length > 0 ? (
          <div className="flex gap-2 sm:col-span-2">
            <dt className="shrink-0">公開前に必要</dt>
            <dd className="font-medium text-ink-soft">{missing.join(' / ')}</dd>
          </div>
        ) : null}
      </dl>
    </details>
  );
}

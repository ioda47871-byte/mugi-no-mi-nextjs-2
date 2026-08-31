import type { Metadata } from 'next';
import Link from 'next/link';
import InfoPage, { Section, Unset } from '@/components/InfoPage';
import { absoluteUrl, missingLaunchSettings, siteConfig } from '@/config/site';
import { getMerchantConfig } from '@/config/merchants';
import { getSiteData } from '@/lib/content/load';

export const metadata: Metadata = {
  title: '運営者情報',
  description: '当サイトの運営主体・連絡先・現在の公開状態についてのご案内です。',
  alternates: absoluteUrl('/about/') ? { canonical: absoluteUrl('/about/') as string } : undefined,
};

export default function AboutPage() {
  const { catalog, articles, products } = getSiteData();
  const merchants = getMerchantConfig();
  const missing = missingLaunchSettings();

  return (
    <InfoPage
      title="運営者情報"
      lead="このページには、実際に確認できた情報だけを掲載しています。未提供の項目は架空の値で埋めず「未設定」と表示します。"
    >
      <Section heading="運営主体">
        <dl className="space-y-3">
          <div>
            <dt className="text-xs text-ink-faint">サイト名</dt>
            <dd className="text-ink">
              {siteConfig.name}
              {siteConfig.nameIsProvisional ? (
                <span className="ml-2 text-xs text-ink-faint">（仮称。正式名称・商標は未確認）</span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">運営者名</dt>
            <dd className="text-ink">
              {siteConfig.operatorName ?? <Unset label="PUBLIC_OPERATOR_NAME" />}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">連絡先</dt>
            <dd className="text-ink">
              {siteConfig.contactEmail ? (
                <a className="link-inline" href={`mailto:${siteConfig.contactEmail}`}>
                  {siteConfig.contactEmail}
                </a>
              ) : (
                <Unset label="PUBLIC_CONTACT_EMAIL" />
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">正規URL</dt>
            <dd className="text-ink">{siteConfig.baseUrl ?? <Unset label="SITE_URL" />}</dd>
          </div>
        </dl>
      </Section>

      <Section heading="現在の状態">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            公開モード: <strong className="text-ink">{siteConfig.mode === 'production' ? '本番' : 'プレビュー（noindex）'}</strong>
          </li>
          <li>
            データセット:{' '}
            <strong className="text-ink">
              {catalog.dataset.kind === 'demo' ? 'デモ（実在しない商品データ）' : '本番'}
            </strong>
          </li>
          <li>公開商品 {products.length} 件 / 公開記事 {articles.length} 本 / 登録出典 {catalog.sources.length} 件</li>
          <li>Amazonアソシエイト: {merchants.amazonAssociateTag ? '設定済み' : '未設定（Amazonボタンは表示されません）'}</li>
          <li>アクセス計測: {siteConfig.gaMeasurementId ? '設定済み' : '未設定（計測タグは出力されません）'}</li>
        </ul>
        {missing.length > 0 ? (
          <div className="rounded-lg border border-warn/30 bg-warn-soft p-3">
            <p className="text-xs font-bold text-warn">本番公開前に必要な設定</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-ink-soft">
              {missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>

      <Section heading="このサイトが扱う範囲">
        <p>
          2〜3泊の旅行で荷物を軽く・少なくしたい人に向けて、スーツケース・旅行用リュック・収納ポーチ・モバイルバッテリーの
          公表仕様を比較できるようにしています。ホテル予約、観光地案内、航空券、保険は扱いません。
        </p>
        <p>
          比較方法と広告の扱いは
          <Link className="link-inline" href="/editorial-policy/">編集・広告方針</Link>
          に記載しています。
        </p>
      </Section>
    </InfoPage>
  );
}

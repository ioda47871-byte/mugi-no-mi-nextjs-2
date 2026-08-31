import type { Metadata } from 'next';
import Link from 'next/link';
import InfoPage, { Section, Unset } from '@/components/InfoPage';
import { absoluteUrl, siteConfig } from '@/config/site';

export const metadata: Metadata = {
  title: '運営者情報',
  description: '当サイトの運営主体・連絡先・現在の公開状態についてのご案内です。',
  alternates: absoluteUrl('/about/') ? { canonical: absoluteUrl('/about/') as string } : undefined,
};

export default function AboutPage() {
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

            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">運営者名</dt>
            <dd className="text-ink">
              {siteConfig.operatorName ?? <Unset />}
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
                <Unset />
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">正規URL</dt>
            <dd className="text-ink">{siteConfig.baseUrl ?? <Unset />}</dd>
          </div>
        </dl>
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

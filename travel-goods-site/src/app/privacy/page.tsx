import type { Metadata } from 'next';
import InfoPage, { Section } from '@/components/InfoPage';
import { absoluteUrl, siteConfig } from '@/config/site';

export const metadata: Metadata = {
  title: 'プライバシー',
  description: '当サイトで実際に導入している計測・外部サービスと、その扱いについて説明します。',
  alternates: absoluteUrl('/privacy/') ? { canonical: absoluteUrl('/privacy/') as string } : undefined,
};

export default function PrivacyPage() {
  const gaEnabled = Boolean(siteConfig.gaMeasurementId);

  return (
    <InfoPage
      title="プライバシー"
      lead="実際に導入しているものだけを記載しています。導入していないサービスについては書きません。"
    >
      <Section heading="アクセス解析">
        {gaEnabled ? (
          <>
            <p>
              当サイトは Google アナリティクス（GA4、測定ID: {siteConfig.gaMeasurementId}）を利用しています。
              閲覧されたページ、参照元、おおまかな地域、端末種別などの統計情報が収集されます。
              購入リンクが押されたときは、記事またはカテゴリの識別子・商品ID・販売先名・設置位置のみを送信します。
            </p>
            <p>
              氏名・メールアドレス・住所などの個人を特定する情報、および外部URLの完全な文字列やクエリ文字列は送信しません。
              収集の停止をご希望の場合は、ブラウザの設定や Google の提供するオプトアウト手段をご利用ください。
            </p>
          </>
        ) : (
          <p>
            現在、アクセス解析ツールは導入していません（計測IDが未設定のため、計測用のタグを出力していません）。
            導入した場合は、このページに収集内容を追記します。
          </p>
        )}
      </Section>

      <Section heading="広告・アフィリエイト">
        <p>
          当サイトは、Amazonアソシエイト・楽天アフィリエイトなどのアフィリエイトプログラムを利用して、
          販売先へのリンクを掲載することがあります。
          リンクをクリックして販売先サイトへ移動する際、成果の判定のために、リンク元となった当サイトのページURLが
          販売先へ伝わります。移動した後の情報の取り扱いは、各販売先のプライバシーポリシーに従います。
        </p>
        <p>
          当サイトでは、購入者の氏名・住所・支払情報を取得することはありません。
          販売件数や報酬の情報は、各アフィリエイトサービスの管理画面でのみ確認しています。
        </p>
      </Section>

      <Section heading="クッキー">
        <p>
          当サイト自身はログイン機能や会員機能を持たず、閲覧のためのクッキーを設定していません。
          {gaEnabled
            ? ' アクセス解析および販売先サイトのクッキーが設定される場合があります。'
            : ' 販売先サイトへ移動した場合、そのサイトのクッキーが設定される場合があります。'}
        </p>
      </Section>

      <Section heading="計測値の見え方について">
        <p>
          広告ブロックやブラウザの設定により、リンクのクリック数が計測されない場合があります。
          そのため、当サイトで計測したクリック数と、アフィリエイト各社のレポートの数値は一致しないことがあります。
          クリック数は購入や確定報酬を意味しません。
        </p>
      </Section>
    </InfoPage>
  );
}

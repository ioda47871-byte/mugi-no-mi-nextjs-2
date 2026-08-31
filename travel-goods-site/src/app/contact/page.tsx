import type { Metadata } from 'next';
import InfoPage, { Section } from '@/components/InfoPage';
import { absoluteUrl, siteConfig } from '@/config/site';

export const metadata: Metadata = {
  title: 'お問い合わせ',
  description: '記事内容の誤りのご指摘、掲載についてのご連絡先です。',
  alternates: absoluteUrl('/contact/') ? { canonical: absoluteUrl('/contact/') as string } : undefined,
};

export default function ContactPage() {
  return (
    <InfoPage title="お問い合わせ" lead="記事内容の誤りのご指摘や、掲載に関するご連絡はこちらへお願いします。">
      <Section heading="連絡先">
        {siteConfig.contactEmail ? (
          <p>
            <a className="link-inline" href={`mailto:${siteConfig.contactEmail}`}>
              {siteConfig.contactEmail}
            </a>
          </p>
        ) : (
          <p>
            連絡先メールアドレスは準備中です。用意ができ次第このページに掲載します。
            仮のアドレスは掲載していません。
          </p>
        )}
      </Section>

      <Section heading="ご連絡いただく際のお願い">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>該当ページのURLと、どの記述についてのご指摘かをお知らせください。</li>
          <li>仕様の誤りについては、メーカーの公表ページなど確認できる情報をいただけると助かります。</li>
          <li>個々の商品の購入相談・在庫や配送のお問い合わせにはお答えできません。販売先へご連絡ください。</li>
        </ul>
      </Section>
    </InfoPage>
  );
}

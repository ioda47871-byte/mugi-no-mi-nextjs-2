import type { Metadata } from 'next';
import { PhotoBlock } from '@/components/ui/PhotoBlock';
import { siteContent } from '@/lib/placeholder-content';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Access',
  description: `${siteConfig.name}の営業時間・住所・アクセス方法をご案内します。`,
  alternates: { canonical: '/access' },
  openGraph: {
    title: `Access | ${siteConfig.name}`,
  },
};

export default function AccessPage() {
  return (
    <div className="pt-[200px] max-[640px]:pt-[130px]">
      <div className="mx-auto max-w-container px-8 pb-14 text-center max-[640px]:px-5">
        <span className="eyebrow justify-center">Access</span>
        <h1 className="mt-[18px] text-[clamp(34px,5vw,58px)]">店舗のご案内</h1>
        <p className="mx-auto mt-5 max-w-lg text-[14.5px] text-kura">
          営業時間や臨時休業は変更される場合がございます。最新の営業情報はInstagramをご確認ください。
        </p>
      </div>

      <div className="px-8 pb-20 max-[640px]:px-5">
        <PhotoBlock
          src="/images/exterior.jpg"
          alt="柳の木とBrot yanagiの外観"
          width={1200}
          height={1500}
          priority
          className="mx-auto max-w-2xl"
        />
      </div>

      <section className="px-8 pb-20 max-[640px]:px-5">
        <div className="mx-auto max-w-2xl">
          <table className="w-full border-collapse">
            <tbody>
              <Row label="店舗名">{siteContent.brandName.value}({siteContent.brandNameEn.value})</Row>
              <Row label="住所">{siteContent.address.value}</Row>
              <Row label="営業時間">
                {siteContent.hours.value}
                <br />
                <span className="text-[13px] text-kura">※パンが売り切れ次第、営業終了となります</span>
              </Row>
              <Row label="定休日">{siteContent.closedDay.value}</Row>
              <Row label="電話番号">
                <a
                  href={`tel:${siteContent.phoneHref.value}`}
                  className="inline-flex min-h-[44px] items-center border-b border-gold pb-0.5 hover:text-brand-deep max-[640px]:min-h-[48px] max-[640px]:rounded-[2px] max-[640px]:border-b-0 max-[640px]:bg-brand max-[640px]:px-6 max-[640px]:tracking-[0.08em] max-[640px]:text-ink"
                >
                  {siteContent.phone.value}
                </a>
              </Row>
              <Row label="アクセス">{siteContent.accessNote.value}</Row>
              <Row label="Instagram">
                <a href={siteContent.instagramUrl.value} className="link-gold">
                  {siteContent.instagramHandle.value}
                </a>
              </Row>
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-brand-pale px-8 py-20 max-[640px]:px-5">
        <div className="mx-auto max-w-container">
          <span className="eyebrow">Map</span>
          <h2 className="mt-3.5 text-2xl">地図</h2>
          <div className="mt-8 overflow-hidden rounded-2xl border border-line shadow-lg shadow-ink/5">
            <iframe
              title={`${siteContent.brandName.value} 地図`}
              loading="lazy"
              src={siteContent.mapEmbedUrl.value}
              className="h-[380px] w-full grayscale-[15%] sepia-[8%]"
            />
          </div>
          <div className="mt-5 text-center">
            <a href={siteContent.mapViewUrl.value} className="link-gold" target="_blank" rel="noreferrer">
              Google Mapで見る →
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr className="border-b border-line">
      <td className="w-[140px] py-[18px] align-top font-accent text-sm italic text-brand-deep max-[640px]:w-[90px]">
        {label}
      </td>
      <td className="py-[18px] align-top text-[14.5px]">{children}</td>
    </tr>
  );
}

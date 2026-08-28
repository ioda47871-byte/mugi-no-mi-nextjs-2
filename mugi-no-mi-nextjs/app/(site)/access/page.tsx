import type { Metadata } from 'next';
import { PhotoBlock } from '@/components/ui/PhotoBlock';
import { AnnouncementNotice } from '@/components/sections/AnnouncementNotice';
import { PageHero } from '@/components/sections/PageHero';
import { StoreInfoStrip } from '@/components/sections/StoreInfoStrip';
import { WillowDecoration } from '@/components/ui/WillowDecoration';
import { siteContent } from '@/lib/placeholder-content';
import { pageOpenGraph, siteConfig } from '@/lib/site-config';
import { getSitePhotos } from '@/lib/site-photos';
import { getLatestPublishedAnnouncement } from '@/lib/announcements';

const ACCESS_DESCRIPTION = `${siteConfig.name}の営業時間・住所・アクセス方法をご案内します。`;

// サイト写真(Supabase)は60秒ごとに再取得する(ISR)。
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const photos = await getSitePhotos();
  return {
    title: 'Access',
    description: ACCESS_DESCRIPTION,
    alternates: { canonical: '/access' },
    openGraph: pageOpenGraph({
      title: 'Access',
      description: ACCESS_DESCRIPTION,
      image: photos.exterior.url,
      imageAlt: photos.exterior.alt,
    }),
  };
}

export default async function AccessPage() {
  const [photos, announcement] = await Promise.all([getSitePhotos(), getLatestPublishedAnnouncement()]);

  return (
    <div>
      <PageHero
        eyebrow="Access"
        title="店舗のご案内"
        description="営業時間や臨時休業は変更される場合がございます。最新の営業情報はInstagramをご確認ください。"
        photoUrl={photos.exterior.url}
        photoAlt={photos.exterior.alt}
      >
        <AnnouncementNotice announcement={announcement} />
      </PageHero>

      <section className="px-8 py-20 max-[640px]:px-5 max-[640px]:py-14">
        <div className="mx-auto max-w-container">
          <div className="grid grid-cols-[1.1fr_0.9fr_1fr] items-start gap-10 max-[1000px]:grid-cols-1 max-[1000px]:gap-12">
            <table className="w-full border-collapse">
              <tbody>
                <Row label="店舗名">{siteContent.brandName.value}({siteContent.brandNameEn.value})</Row>
                <Row label="住所">{siteContent.address.value}</Row>
                <Row label="営業時間">{siteContent.hours.value}</Row>
                <Row label="定休日">{siteContent.closedDay.value}</Row>
                <Row label="電話番号">
                  <a href={`tel:${siteContent.phoneHref.value}`} className="link-gold">
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

            <PhotoBlock src={photos.interior.url} alt={photos.interior.alt} width={1200} height={1500} className="max-[1000px]:hidden" />

            <div className="space-y-7 rounded-[10px] border border-line bg-white p-7">
              <InfoRow icon={<ClockIcon />} label="営業時間">
                {siteContent.hours.value}
                <br />
                <span className="text-[12.5px] text-kura/80">※パンが売り切れ次第、営業終了となります</span>
              </InfoRow>
              <InfoRow icon={<CalendarIcon />} label="定休日">
                {siteContent.closedDay.value}
              </InfoRow>
              <InfoRow icon={<TrainIcon />} label="アクセス">
                {siteContent.accessNote.value}
              </InfoRow>
              <InfoRow icon={<PhoneIcon />} label="電話番号">
                <a href={`tel:${siteContent.phoneHref.value}`} className="link-gold">
                  {siteContent.phone.value}
                </a>
              </InfoRow>
              <InfoRow icon={<InstagramIcon />} label="Instagram">
                <a href={siteContent.instagramUrl.value} className="link-gold">
                  {siteContent.instagramHandle.value}
                </a>
              </InfoRow>
            </div>
          </div>
        </div>
      </section>

      <section className="px-8 pb-24 max-[640px]:px-5 max-[640px]:pb-16">
        <div className="mx-auto grid max-w-container grid-cols-2 items-stretch gap-8 max-[860px]:grid-cols-1">
          <div className="relative overflow-hidden rounded-[10px] border border-line bg-white p-8">
            <WillowDecoration className="pointer-events-none absolute -bottom-6 -right-6 h-32 w-14 text-gold/20" />
            <div className="relative flex items-start gap-5">
              <ParkingIcon />
              <div>
                <span className="eyebrow">Parking</span>
                <h2 className="mt-3 text-2xl">駐車場について</h2>
                <p className="mt-4 max-w-sm text-[14.5px] leading-loose text-kura">{siteContent.parking.value}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[10px] border border-line bg-white p-8">
            <span className="eyebrow">地図</span>
            <h2 className="mt-3 text-2xl">金山駅からのアクセスマップ</h2>
            <div className="mt-6 overflow-hidden rounded-[6px] border border-line">
              <iframe
                title={`${siteContent.brandName.value} 地図`}
                loading="lazy"
                src={siteContent.mapEmbedUrl.value}
                className="h-[280px] w-full grayscale-[15%] sepia-[8%]"
              />
            </div>
            <div className="mt-5">
              <a
                href={siteContent.mapViewUrl.value}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[44px] items-center rounded-[4px] bg-brand px-6 text-[13px] tracking-wide text-ink transition-colors hover:bg-brand-deep"
              >
                Google Mapで見る →
              </a>
            </div>
          </div>
        </div>
      </section>

      <StoreInfoStrip />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr className="border-b border-line">
      <td className="w-[140px] py-[18px] align-top font-accent text-sm italic text-brand-text max-[640px]:w-[90px]">
        {label}
      </td>
      <td className="py-[18px] align-top text-[14.5px]">{children}</td>
    </tr>
  );
}

function InfoRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span aria-hidden className="mt-0.5 text-gold">
        {icon}
      </span>
      <div className="text-[14px] leading-relaxed text-kura">
        <p className="font-accent text-[12px] italic tracking-wide text-brand-text">{label}</p>
        <p className="text-ink">{children}</p>
      </div>
    </div>
  );
}

const infoIconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: 'h-5 w-5',
};

function ClockIcon() {
  return (
    <svg {...infoIconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg {...infoIconProps}>
      <rect x="3.5" y="5" width="17" height="16" rx="1.5" />
      <path d="M3.5 10h17" />
      <path d="M8 3v4M16 3v4" />
    </svg>
  );
}

function TrainIcon() {
  return (
    <svg {...infoIconProps}>
      <rect x="6" y="4" width="12" height="14" rx="3" />
      <path d="M6 14h12" />
      <circle cx="9" cy="16.5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="15" cy="16.5" r="0.8" fill="currentColor" stroke="none" />
      <path d="M8 21l-1.5 2M16 21l1.5 2" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg {...infoIconProps}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg {...infoIconProps}>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

function ParkingIcon() {
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-pale text-brand-text">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <rect x="3" y="10" width="18" height="8" rx="2" />
        <path d="M5 10 6.5 5h11L19 10" />
        <circle cx="7.5" cy="18" r="1.5" />
        <circle cx="16.5" cy="18" r="1.5" />
        <path d="M9 10V7h2.5a1.5 1.5 0 0 1 0 3H9z" />
      </svg>
    </span>
  );
}

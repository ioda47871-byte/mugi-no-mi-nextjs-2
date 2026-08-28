import type { Metadata } from 'next';
import { ContactForm } from '@/components/sections/ContactForm';
import { PageHero } from '@/components/sections/PageHero';
import { StoreInfoStrip } from '@/components/sections/StoreInfoStrip';
import { Button } from '@/components/ui/Button';
import { PhotoBlock } from '@/components/ui/PhotoBlock';
import { WillowDecoration } from '@/components/ui/WillowDecoration';
import { pageOpenGraph, siteConfig } from '@/lib/site-config';
import { siteContent } from '@/lib/placeholder-content';
import { isContactFormConfigured } from '@/lib/contact/config';
import { getSitePhotos } from '@/lib/site-photos';

const CONTACT_DESCRIPTION = `${siteConfig.name}へのお問い合わせはこちらから。`;

// サイト写真(Supabase)は60秒ごとに再取得する(ISR)。
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const photos = await getSitePhotos();
  return {
    title: 'Contact',
    description: CONTACT_DESCRIPTION,
    alternates: { canonical: '/contact' },
    openGraph: pageOpenGraph({
      title: 'Contact',
      description: CONTACT_DESCRIPTION,
      image: photos.showcase.url,
      imageAlt: photos.showcase.alt,
    }),
  };
}

/**
 * お問い合わせフォームの送信に必要な環境変数(Resend / Upstash / 受信先)が
 * すべて揃っている場合のみフォームを表示する。1つでも未設定の場合は、
 * 送信エラーが表示される状態を避けるため、電話・Instagramへの案内に
 * 自動的に切り替える。環境変数が揃い次第、再デプロイするだけでフォームが
 * 有効化される(コード側の変更は不要)。
 */
export default async function ContactPage() {
  const formEnabled = isContactFormConfigured();
  const photos = await getSitePhotos();

  return (
    <div>
      <PageHero
        eyebrow="Contact"
        title="お問い合わせ"
        description={
          formEnabled
            ? 'お問い合わせや最新情報は、お電話またはInstagramからもご確認いただけます。'
            : 'パンのご予約・お取り置きはお電話にて承っております。お問い合わせや最新情報は、電話またはInstagramからご確認ください。'
        }
        photoUrl={photos.exterior.url}
        photoAlt={photos.exterior.alt}
      />

      <div className="mx-auto max-w-container px-8 pb-24 max-[640px]:px-5 max-[640px]:pb-16">
        <div className="grid grid-cols-2 items-stretch gap-8 max-[860px]:grid-cols-1">
          <PhoneReservationCard />
          <div className="rounded-[10px] border border-line bg-white p-8">
            <div className="mb-6 text-center">
              <span aria-hidden className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand-pale text-brand-text">
                <MailIcon />
              </span>
              <h2 className="font-display text-xl text-ink">その他のお問い合わせ</h2>
            </div>
            {formEnabled ? <ContactForm /> : <ContactFallback />}
          </div>
        </div>
      </div>

      <StoreInfoStrip />

      <section className="px-8 pb-24 max-[640px]:px-5 max-[640px]:pb-16">
        <div className="mx-auto max-w-container">
          <div className="grid grid-cols-2 items-center gap-16 max-[860px]:grid-cols-1 max-[860px]:gap-9">
            <PhotoBlock src={photos.interior.url} alt={photos.interior.alt} width={1500} height={1125} />
            <div className="relative max-[860px]:text-center">
              <WillowDecoration className="pointer-events-none absolute -right-10 top-0 h-32 w-12 text-gold/25 max-[1100px]:hidden" />
              <h2 className="text-2xl">お気軽にお問い合わせください</h2>
              <p className="mt-5 max-w-sm text-[14.5px] leading-loose text-kura max-[860px]:mx-auto">
                ご予約やお問い合わせはもちろん、パンのご感想やご要望などもぜひお聞かせください。皆さまのご来店を心よりお待ちしております。
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * パンのご予約・お取り置きは電話受付のみで、Webフォーム(右カードのContactForm)
 * からは受け付けていない。formEnabledの状態に関わらず常に表示し、左カードとして
 * 独立させることで、フォームに予約内容を書いてしまう誤解を防ぐ。
 */
function PhoneReservationCard() {
  return (
    <div className="rounded-[10px] border border-brand/30 border-l-[3px] border-l-brand bg-ivory p-8 text-center">
      <span aria-hidden className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand-pale text-brand-text">
        <PhoneIcon />
      </span>
      <h2 className="font-display text-xl text-ink sm:text-2xl">パンのご予約・お取り置き</h2>
      <p className="mx-auto mt-3 max-w-md text-[14.5px] leading-relaxed text-kura">
        パンのご予約・お取り置きは、お電話にて承っております。
      </p>
      <a
        href={`tel:${siteContent.phoneHref.value}`}
        className="mt-3 inline-block font-accent text-[21px] font-medium tracking-wide text-brand-text transition-colors hover:text-brand-deep"
      >
        {siteContent.phone.value}
      </a>

      <div className="mx-auto mt-6 max-w-xs border-t border-line pt-6 text-left">
        <p className="font-accent text-sm italic tracking-wide text-brand-text">ご予約の際にお伝えください</p>
        <ul className="mt-2.5 space-y-2 text-[14px] text-kura">
          <li className="flex items-start gap-2.5">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
            ご希望の商品・個数
          </li>
          <li className="flex items-start gap-2.5">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
            お名前
          </li>
          <li className="flex items-start gap-2.5">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
            お電話番号
          </li>
        </ul>
      </div>

      <Button
        href={`tel:${siteContent.phoneHref.value}`}
        variant="primary"
        className="mt-7 max-[640px]:w-full max-[640px]:justify-center"
      >
        電話で予約する
      </Button>
    </div>
  );
}

function ContactFallback() {
  return (
    <div className="text-center">
      <p className="text-[14.5px] leading-relaxed text-kura">
        お問い合わせや最新情報は、
        <br className="max-[480px]:hidden" />
        お電話またはInstagramからご確認ください。
      </p>
      <div className="mt-7 flex flex-col gap-3">
        <Button href={`tel:${siteContent.phoneHref.value}`} variant="primary" className="justify-center">
          電話をかける
        </Button>
        <a
          href={siteContent.instagramUrl.value}
          className="inline-flex min-h-[48px] items-center justify-center rounded-[2px] border border-gold px-8 text-[13px] tracking-[0.16em] text-ink transition-all duration-300 ease-signature hover:border-brand-deep hover:text-brand-deep"
        >
          Instagramを見る
        </a>
      </div>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 6.5 8 6.5 8-6.5" />
    </svg>
  );
}

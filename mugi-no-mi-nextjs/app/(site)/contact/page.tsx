import type { Metadata } from 'next';
import { ContactForm } from '@/components/sections/ContactForm';
import { Button } from '@/components/ui/Button';
import { pageOpenGraph, siteConfig } from '@/lib/site-config';
import { siteContent } from '@/lib/placeholder-content';
import { isContactFormConfigured } from '@/lib/contact/config';
import { getSitePhoto } from '@/lib/site-photos';

const CONTACT_DESCRIPTION = `${siteConfig.name}へのお問い合わせはこちらから。`;

// サイト写真(Supabase)は60秒ごとに再取得する(ISR)。
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const showcasePhoto = await getSitePhoto('showcase');
  return {
    title: 'Contact',
    description: CONTACT_DESCRIPTION,
    alternates: { canonical: '/contact' },
    openGraph: pageOpenGraph({
      title: 'Contact',
      description: CONTACT_DESCRIPTION,
      image: showcasePhoto.url,
      imageAlt: showcasePhoto.alt,
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
export default function ContactPage() {
  const formEnabled = isContactFormConfigured();

  return (
    <div className="pt-[200px] max-[640px]:pt-[130px]">
      <div className="mx-auto max-w-container px-8 pb-16 text-center max-[640px]:px-5">
        <span className="eyebrow justify-center">Contact</span>
        <h1 className="mt-[18px] text-[clamp(34px,5vw,58px)]">お問い合わせ</h1>
        {formEnabled && (
          <p className="mx-auto mt-6 max-w-lg text-[14.5px] text-kura">
            お問い合わせや最新情報は、お電話またはInstagramからもご確認いただけます。
          </p>
        )}
      </div>

      <div className="mx-auto max-w-container px-8 pb-14 max-[640px]:px-5">
        <PhoneReservationNotice />
      </div>

      <div className="mx-auto max-w-container px-8 pb-24 max-[640px]:px-5">
        <h2 className="mb-8 text-center font-display text-2xl text-ink">その他のお問い合わせ</h2>
        {formEnabled ? <ContactForm /> : <ContactFallback />}
      </div>
    </div>
  );
}

/**
 * パンのご予約・お取り置きは電話受付のみで、Webフォーム(下のContactForm)からは
 * 受け付けていない。formEnabledの状態に関わらず常に表示し、フォームより前に
 * 置くことで、フォームに予約内容を書いてしまう誤解を防ぐ。
 */
function PhoneReservationNotice() {
  return (
    <div className="mx-auto max-w-2xl rounded-[10px] border border-brand/30 border-l-[3px] border-l-brand bg-ivory px-7 py-7 text-center max-[640px]:px-5 max-[640px]:py-6">
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

      <div className="mx-auto mt-6 max-w-xs text-left">
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
    <div className="mx-auto max-w-2xl rounded-[2px] border border-line bg-white px-8 py-14 text-center">
      <p className="text-[15px] leading-relaxed text-kura">
        お問い合わせや最新情報は、
        <br className="max-[480px]:hidden" />
        お電話またはInstagramからご確認ください。
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-4">
        <Button href={`tel:${siteContent.phoneHref.value}`} variant="primary">
          電話をかける
        </Button>
        <Button href={siteContent.instagramUrl.value} variant="outline">
          Instagramを見る
        </Button>
      </div>
    </div>
  );
}

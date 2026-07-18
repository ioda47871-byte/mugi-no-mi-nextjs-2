import type { Metadata } from 'next';
import { ContactForm } from '@/components/sections/ContactForm';
import { Button } from '@/components/ui/Button';
import { siteConfig } from '@/lib/site-config';
import { siteContent } from '@/lib/placeholder-content';
import { isContactFormConfigured } from '@/lib/contact/config';

export const metadata: Metadata = {
  title: 'Contact',
  description: `${siteConfig.name}へのお問い合わせはこちらから。`,
  alternates: { canonical: '/contact' },
  openGraph: {
    title: `Contact | ${siteConfig.name}`,
  },
};

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
    <div className="pt-[200px]">
      <div className="mx-auto max-w-container px-8 pb-16 text-center max-[640px]:px-5">
        <span className="eyebrow justify-center">Contact</span>
        <h1 className="mt-[18px] text-[clamp(34px,5vw,58px)]">お問い合わせ</h1>
        <p className="mx-auto mt-6 max-w-lg text-[14.5px] text-kura">
          お問い合わせや最新情報は、お電話またはInstagramからもご確認いただけます。
        </p>
      </div>
      <div className="mx-auto max-w-container px-8 pb-24 max-[640px]:px-5">
        {formEnabled ? <ContactForm /> : <ContactFallback />}
      </div>
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

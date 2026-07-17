import type { Metadata } from 'next';
import { ContactForm } from '@/components/sections/ContactForm';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Contact',
  description: '麦の実 -Mugi no Mi- Boulangerieへのお問い合わせはこちらから。',
  alternates: { canonical: '/contact' },
  openGraph: {
    title: `Contact | ${siteConfig.name}`,
  },
};

/**
 * フォームUI・バリデーションは実装済みですが、送信処理(メールAPI等)は
 * 第二段階で実装予定です。lib/placeholder-content.ts の
 * contactFormRecipient が確定次第、Server Action等を接続してください。
 */
export default function ContactPage() {
  return (
    <div className="pt-[200px]">
      <div className="mx-auto max-w-container px-8 pb-16 text-center max-[640px]:px-5">
        <span className="eyebrow justify-center">Contact</span>
        <h1 className="mt-[18px] text-[clamp(34px,5vw,58px)]">お問い合わせ</h1>
        <p className="mx-auto mt-6 max-w-lg text-[14.5px] text-kura">
          ギフトのご相談、取材、貸切イベントなど、お気軽にお問い合わせください。2営業日以内にご返信いたします。
        </p>
      </div>
      <div className="mx-auto max-w-container px-8 pb-24 max-[640px]:px-5">
        <ContactForm />
      </div>
    </div>
  );
}

import { siteContent } from '@/lib/placeholder-content';
import { WillowDecoration } from '@/components/ui/WillowDecoration';

interface StoreInfoStripProps {
  /** Homeページのみ、右端に「フォローする」ボタンを表示する */
  showFollowButton?: boolean;
  className?: string;
}

/**
 * Footer直前に置く、5ページ共通の横長店舗情報バー
 * (所在地/営業時間/定休日/電話番号/Instagram)。
 * VisitUs.tsx(地図・駐車場・予約カードを含む詳細版。Access/Contactで使用)とは
 * 役割が異なる軽量版で、既存のsiteContentをそのまま参照するのみで
 * 追加のデータ取得は行わない。
 */
export function StoreInfoStrip({ showFollowButton = false, className = '' }: StoreInfoStripProps) {
  return (
    <section className={`relative overflow-hidden border-t border-line bg-ivory px-8 py-10 max-[640px]:px-5 max-[640px]:py-8 ${className}`}>
      <WillowDecoration
        variant="sprig"
        flip
        className="pointer-events-none absolute -right-2 -top-2 hidden h-28 w-12 text-gold/20 min-[860px]:block"
      />
      <div className="relative mx-auto flex max-w-container flex-wrap items-start justify-between gap-x-6 gap-y-7 max-[860px]:justify-center max-[860px]:text-center">
        <InfoItem icon={<PinIcon />} label="所在地">
          <p className="whitespace-pre-line">{siteContent.address.value.replace('〒456-0018 ', '〒456-0018\n')}</p>
        </InfoItem>
        <InfoItem icon={<ClockIcon />} label="営業時間">
          <p>
            {siteContent.hours.value}
            <br />
            <span className="text-[12px] text-kura/80">※パンが売り切れ次第、営業終了となります</span>
          </p>
        </InfoItem>
        <InfoItem icon={<CalendarIcon />} label="定休日">
          <p>
            {siteContent.closedDay.value}
            <br />
            <span className="text-[12px] text-kura/80">※その他臨時休業あり</span>
          </p>
        </InfoItem>
        <InfoItem icon={<PhoneIcon />} label="電話番号">
          <a href={`tel:${siteContent.phoneHref.value}`} className="link-gold">
            {siteContent.phone.value}
          </a>
        </InfoItem>
        <InfoItem icon={<InstagramIcon />} label="Instagram">
          <a href={siteContent.instagramUrl.value} className="link-gold">
            {siteContent.instagramHandle.value}
          </a>
        </InfoItem>

        {showFollowButton && (
          <a
            href={siteContent.instagramUrl.value}
            className="inline-flex min-h-[44px] items-center gap-2 self-center rounded-full border border-ink px-6 text-[13px] tracking-wide text-ink transition-all duration-300 ease-signature hover:bg-ink hover:text-ivory max-[860px]:w-full max-[860px]:justify-center"
          >
            フォローする <span aria-hidden>→</span>
          </a>
        )}
      </div>
    </section>
  );
}

function InfoItem({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-[140px] items-start gap-3 max-[860px]:min-w-[130px] max-[860px]:flex-col max-[860px]:items-center max-[860px]:gap-1.5">
      <span aria-hidden className="mt-0.5 text-gold max-[860px]:mt-0">
        {icon}
      </span>
      <div className="text-left text-[13.5px] leading-relaxed text-kura max-[860px]:text-center">
        <p className="font-accent text-[12px] italic tracking-wide text-brand-text">{label}</p>
        {children}
      </div>
    </div>
  );
}

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: 'h-[18px] w-[18px]',
};

function PinIcon() {
  return (
    <svg {...iconProps}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3.5" y="5" width="17" height="16" rx="1.5" />
      <path d="M3.5 10h17" />
      <path d="M8 3v4M16 3v4" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg {...iconProps}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg {...iconProps}>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

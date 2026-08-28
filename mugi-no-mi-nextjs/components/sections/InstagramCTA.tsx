import { siteContent } from '@/lib/placeholder-content';

/**
 * Instagram導線の軽量版(1行カード)。About/InstagramFeed.tsxの
 * 大きいセクション版とは別に、Galleryページ下部など「ページを締める前の
 * 軽い導線」として使う。データ取得は行わず、siteContentのリンクのみ使用する。
 */
export function InstagramCTA() {
  return (
    <div className="mx-auto flex max-w-container flex-col items-center justify-between gap-5 rounded-2xl border border-line bg-white px-8 py-7 max-[640px]:px-5 sm:flex-row">
      <div className="flex items-center gap-4 text-center sm:text-left">
        <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-pale text-brand-text">
          <InstagramIcon />
        </span>
        <div>
          <p className="font-display text-base text-ink">Instagramで最新情報をお届けしています</p>
          <p className="mt-1 text-[13px] text-kura">新商品や季節のおすすめ、店内の様子などを日々更新中、ぜひフォローしてください。</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-5">
        <span className="font-accent text-sm italic text-brand-text">{siteContent.instagramHandle.value}</span>
        <a href={siteContent.instagramUrl.value} className="link-gold shrink-0 whitespace-nowrap text-sm">
          Instagramを見る →
        </a>
      </div>
    </div>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

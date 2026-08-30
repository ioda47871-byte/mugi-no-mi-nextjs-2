import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import type { PublicAnnouncement } from '@/lib/announcements';
import { formatIsoToJstDisplay } from '@/lib/datetime';

interface AnnouncementBannerProps {
  announcement: PublicAnnouncement | null;
}

/**
 * Hero直後に置く、お知らせ1件表示。臨時休業などの重要情報が
 * 「おすすめ商品」より先に自然と目に入る程度に強調しつつ、
 * 左のゴールドアクセントと控えめな影のみで主張し、赤・警告色は使わない
 * (0件の場合はセクション自体を非表示にする)。
 */
export function AnnouncementBanner({ announcement }: AnnouncementBannerProps) {
  if (!announcement) return null;

  return (
    <section className="bg-ivory px-8 py-10 max-[640px]:px-5 max-[640px]:py-7">
      <div className="mx-auto max-w-container">
        <RevealOnScroll>
          <div className="mx-auto max-w-2xl rounded-[10px] border border-brand/25 border-l-[3px] border-l-brand bg-white px-7 py-6 shadow-[0_6px_24px_rgba(43,36,29,0.06)] max-[640px]:px-5 max-[640px]:py-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-2 font-accent text-xs italic uppercase tracking-[0.16em] text-brand-text">
                <span aria-hidden className="inline-block h-px w-5 bg-gold" />
                お知らせ
              </span>
              <span className="text-[11px] text-kura/70">{formatIsoToJstDisplay(announcement.publishedAt)}</span>
            </div>
            <p className="mt-3 font-display text-xl leading-snug text-ink sm:text-[23px]">{announcement.title}</p>
            <p className="mt-2.5 whitespace-pre-line text-[14px] leading-relaxed text-kura">{announcement.body}</p>
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}

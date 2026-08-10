import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import type { PublicAnnouncement } from '@/lib/announcements';
import { formatIsoToJstDisplay } from '@/lib/datetime';

interface AnnouncementBannerProps {
  announcement: PublicAnnouncement | null;
}

/**
 * Hero直後に置く、控えめなお知らせ1件表示。
 * おすすめ商品セクションより主張しないよう、大きな見出し・写真は使わず、
 * 細い横長カード1枚のみで構成する(0件の場合はセクション自体を非表示にする)。
 */
export function AnnouncementBanner({ announcement }: AnnouncementBannerProps) {
  if (!announcement) return null;

  return (
    <section className="bg-ivory px-8 py-8 max-[640px]:px-5 max-[640px]:py-6">
      <div className="mx-auto max-w-container">
        <RevealOnScroll>
          <div className="mx-auto flex max-w-2xl flex-col gap-2 rounded-[8px] border border-line bg-white px-6 py-5 text-center sm:flex-row sm:items-start sm:gap-5 sm:text-left">
            <span className="shrink-0 font-accent text-sm italic tracking-wide text-brand-text">
              {formatIsoToJstDisplay(announcement.publishedAt)}
            </span>
            <div className="min-w-0">
              <p className="font-display text-base text-ink">{announcement.title}</p>
              <p className="mt-1.5 whitespace-pre-line text-[13.5px] leading-relaxed text-kura">
                {announcement.body}
              </p>
            </div>
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}

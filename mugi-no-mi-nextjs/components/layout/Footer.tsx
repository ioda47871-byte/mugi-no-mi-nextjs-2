import { siteContent } from '@/lib/placeholder-content';
import { WillowDecoration } from '@/components/ui/WillowDecoration';

/**
 * Footerは「ページを静かに締める」ことだけを目的とした、最小限の構成です。
 * 表示するのは 営業時間・住所・電話・Instagram・Google Mapを見る の5項目のみ。
 * ナビゲーションの重複(Menuリンク一覧など)は意図的に置いていません。
 * 左右端に控えめな柳(LEVEL3)を添え、全ページの締めくくりに店のモチーフが
 * 静かに残るようにしている。
 */
export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-line bg-ivory px-8 py-12 max-[640px]:px-5 max-[640px]:py-10">
      <WillowDecoration
        variant="sprig"
        className="pointer-events-none absolute -left-3 top-0 hidden h-24 w-10 text-gold/30 min-[640px]:block"
      />
      <WillowDecoration
        variant="sprig"
        flip
        className="pointer-events-none absolute -right-3 top-0 hidden h-24 w-10 text-gold/30 min-[640px]:block"
      />
      <div className="relative mx-auto flex max-w-container flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-6 max-[640px]:flex-col max-[640px]:text-center">
          <div className="flex items-center gap-2.5 font-display text-base tracking-wide text-ink">
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
            {siteContent.brandName.value}{' '}
            <span className="font-accent text-sm italic text-kura">{siteContent.brandNameEn.value}</span>
          </div>

          <ul className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2.5 text-[13.5px] text-kura max-[640px]:text-[14.5px]">
            <li>{siteContent.address.value}</li>
            <li>
              <a href={`tel:${siteContent.phoneHref.value}`} className="link-gold">
                {siteContent.phone.value}
              </a>
            </li>
            <li>
              <a href={siteContent.instagramUrl.value} className="link-gold">
                {siteContent.instagramHandle.value}
              </a>
            </li>
          </ul>
        </div>

        <p className="border-t border-line pt-6 text-center text-xs text-kura max-[640px]:text-[13px]">
          &copy; 2026 {siteContent.brandName.value}
        </p>
      </div>
    </footer>
  );
}

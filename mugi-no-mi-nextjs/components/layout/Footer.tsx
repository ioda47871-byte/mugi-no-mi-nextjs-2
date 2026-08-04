import { siteContent } from '@/lib/placeholder-content';

/**
 * Footerは「ページを静かに締める」ことだけを目的とした、最小限の構成です。
 * 表示するのは 営業時間・住所・電話・Instagram・Google Mapを見る の5項目のみ。
 * ナビゲーションの重複(Menuリンク一覧など)は意図的に置いていません。
 */
export function Footer() {
  return (
    <footer className="border-t border-line bg-ivory px-8 py-14 max-[640px]:px-5 max-[640px]:py-10">
      <div className="mx-auto flex max-w-container flex-col items-center gap-5 text-center">
        <div className="font-display text-base tracking-wide text-ink">
          {siteContent.brandName.value}{' '}
          <span className="font-accent text-sm italic text-kura">{siteContent.brandNameEn.value}</span>
        </div>

        <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2.5 text-[13.5px] text-kura max-[640px]:text-[14.5px]">
          <li>{siteContent.hours.value}</li>
          <li>{siteContent.address.value}</li>
          <li>
            <a href={`tel:${siteContent.phoneHref.value}`} className="link-gold">
              {siteContent.phone.value}
            </a>
          </li>
          <li>
            <a href={siteContent.instagramUrl.value} className="link-gold">Instagram</a>
          </li>
          <li>
            <a href={siteContent.mapViewUrl.value} className="link-gold">Google Mapを見る</a>
          </li>
        </ul>

        <p className="mt-1 text-xs text-kura max-[640px]:text-[13px]">&copy; 2026 {siteContent.brandName.value}</p>
      </div>
    </footer>
  );
}

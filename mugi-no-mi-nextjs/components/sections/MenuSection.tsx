import { MenuBrowser } from '@/components/sections/MenuBrowser';
import { PhotoBlock } from '@/components/ui/PhotoBlock';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import type { Product } from '@/lib/products';
import { getSitePhoto } from '@/lib/site-photos';

interface MenuSectionProps {
  products: Product[];
  /** Homeに埋め込む場合は背景を白に、独立ページではページ側で背景を制御 */
  className?: string;
  /**
   * 見出しのタグレベル。Home埋め込み時はh1が別途存在するためh2(既定)、
   * 独立した/menuページではページ内に他のh1がないためh1を指定する
   * (h1が1つも存在しないページになることを防ぐため)。
   */
  headingLevel?: 'h1' | 'h2';
}

/**
 * 「Menu」の見出し+一行の説明文+絞り込みフィルター+商品カードグリッド。
 * 装飾を増やさず、情報を探しやすくすることを優先したシンプルな構成。
 */
export async function MenuSection({ products, className = '', headingLevel = 'h2' }: MenuSectionProps) {
  const Heading = headingLevel;
  const showcasePhoto = await getSitePhoto('showcase');
  return (
    <section className={`bg-white px-8 py-24 max-[640px]:px-5 max-[640px]:py-16 ${className}`}>
      <div className="mx-auto max-w-container">
        <RevealOnScroll>
          <div className="mb-14 text-center">
            <Heading className="font-display text-[clamp(30px,4vw,44px)]">Menu</Heading>
            <p className="mx-auto mt-4 max-w-md text-[14.5px] text-kura">
              食事に寄り添うパンから、軽いおやつに楽しめるパンまで、店頭にはさまざまな種類が並びます。
              商品の内容や販売状況は日によって異なります。
            </p>
          </div>
        </RevealOnScroll>

        <RevealOnScroll>
          <PhotoBlock
            src={showcasePhoto.url}
            alt={showcasePhoto.alt}
            width={1600}
            height={1067}
            className="mx-auto mb-14 max-w-container"
          />
        </RevealOnScroll>

        <RevealOnScroll>
          <MenuBrowser products={products} />
        </RevealOnScroll>
      </div>
    </section>
  );
}

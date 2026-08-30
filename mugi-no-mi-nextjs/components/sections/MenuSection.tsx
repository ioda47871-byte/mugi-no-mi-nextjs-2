import { Suspense } from 'react';
import { MenuBrowser, MenuBrowserSkeleton } from '@/components/sections/MenuBrowser';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import type { Product } from '@/lib/products';

interface MenuSectionProps {
  products: Product[];
  className?: string;
  /**
   * 見出しのタグレベル。/menuページ単体での使用が前提のため既定はh1
   * (ページ内に他のh1が無いことを保証するため)。
   */
  headingLevel?: 'h1' | 'h2';
}

/**
 * 「Menu」の見出し+一行の説明文+絞り込みタブ+商品カードグリッド。
 *
 * 店舗の雰囲気はHomeページ(Hero・おすすめ商品・カテゴリー導線)で
 * 十分に伝わっている前提のため、このページでは大きな写真を置かず、
 * 「商品を探しやすいこと」を最優先にしている。見出し直下の余白を
 * 詰めているのは、カテゴリータブがファーストビュー(スクロール前)で
 * 見える位置に来るようにするため。
 */
export async function MenuSection({ products, className = '', headingLevel = 'h1' }: MenuSectionProps) {
  const Heading = headingLevel;
  return (
    <section className={`bg-white px-8 pb-24 pt-10 max-[640px]:px-5 max-[640px]:pb-16 max-[640px]:pt-6 ${className}`}>
      <div className="mx-auto max-w-container">
        <RevealOnScroll>
          <div className="mb-10 text-center max-[640px]:mb-7">
            <Heading className="font-display text-[clamp(30px,4vw,44px)]">Menu</Heading>
            <p className="mx-auto mt-4 max-w-lg text-[14.5px] text-kura">
              食事に寄り添うパンから、軽いおやつに楽しめるパンまで、店頭にはさまざまな種類が並びます。
              商品の内容や販売状況は日によって異なります。
            </p>
          </div>
        </RevealOnScroll>

        <Suspense fallback={<MenuBrowserSkeleton />}>
          <MenuBrowser products={products} />
        </Suspense>
      </div>
    </section>
  );
}

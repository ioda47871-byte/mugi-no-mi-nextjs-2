import Link from 'next/link';
import { PhotoFrame } from '@/components/ui/PhotoFrame';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import type { Product } from '@/lib/products';

interface FeaturedProductsProps {
  /** lib/products.tsのgetFeaturedHomeProducts()で絞り込み済み(最大6件)の商品 */
  products: Product[];
}

/**
 * トップページの「おすすめ商品セクション」。管理画面でis_featured_homeを
 * ONにした商品(最大6件)を写真中心のカードで見せ、興味を引くことが目的。
 * 個別の商品詳細ページは存在しないため、カードクリックは商品ごとの
 * 遷移先ではなく一律 /menu へ(全商品を見るきっかけとして機能する)。
 *
 * 対象商品が0件(未設定、またはENABLE_PRODUCT_LISTING=false)の場合は
 * セクションごと非表示にする(空の見出しだけが残る状態を避けるため)。
 */
export function FeaturedProducts({ products }: FeaturedProductsProps) {
  if (products.length === 0) return null;

  return (
    <section className="bg-white px-8 py-24 max-[640px]:px-5 max-[640px]:py-16">
      <div className="mx-auto max-w-container">
        <RevealOnScroll>
          <SectionHeading
            eyebrow="Recommended"
            title="おすすめのパン"
            description="その日ならではのおすすめを、いくつかご紹介します。詳しい商品一覧はMenuからご覧いただけます。"
            center
          />
        </RevealOnScroll>

        <RevealOnScroll>
          <div className="grid grid-cols-3 gap-x-8 gap-y-12 max-[900px]:grid-cols-2 max-[900px]:gap-x-6 max-[560px]:grid-cols-1">
            {products.map((product, i) => (
              <Link
                key={product.id}
                href="/menu"
                aria-label={`${product.name}を見る(Menuへ移動します)`}
                className="group block"
              >
                <div className="relative mb-5 overflow-hidden rounded-[2px]">
                  <PhotoFrame
                    src={product.image}
                    alt={product.name}
                    aspect="aspect-[4/5]"
                    className={product.isSoldOut ? 'brightness-[0.55]' : ''}
                    priority={i < 3}
                    sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 30vw"
                  />
                  {product.isSoldOut && (
                    <span className="absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-white/70 px-4 py-2 text-[12px] tracking-[0.16em] text-white">
                      SOLD OUT
                    </span>
                  )}
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-xl leading-snug transition-colors duration-300 group-hover:text-brand-deep">
                    {product.name}
                  </h3>
                  <span className="shrink-0 font-accent text-[22px] text-brand-text">
                    ¥{product.price.toLocaleString()}
                  </span>
                </div>
                <p className="mt-2.5 text-[13.5px] text-kura">{product.description}</p>
              </Link>
            ))}
          </div>
        </RevealOnScroll>

        <div className="mt-14 text-center">
          <Link
            href="/menu"
            className="inline-flex min-h-[48px] items-center rounded-[2px] border border-ink px-8 text-[13px] tracking-[0.16em] text-ink transition-all duration-300 ease-signature hover:-translate-y-0.5 hover:border-brand-deep hover:text-brand-deep"
          >
            すべてのパンを見る
          </Link>
        </div>
      </div>
    </section>
  );
}

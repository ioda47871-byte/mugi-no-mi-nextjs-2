import { PhotoFrame } from '@/components/ui/PhotoFrame';
import type { Product } from '@/lib/products';

interface ProductCardProps {
  product: Product;
  /** LCP対策。最初の数枚のみtrueにする想定 */
  priority?: boolean;
}

/**
 * 商品カード(Menu共通)。
 * - 写真: aspect-[4/5]でやや大きめに
 * - 商品名: text-xl
 * - 価格: font-accentでしっかり大きく、ブランドカラーで強調
 * - バッジ: 人気(ブランドイエロー)/季節限定(ディープゴールド)/売り切れ(画像減光+SOLD OUT)
 *   は、これまでのカード表現を踏襲しています(見た目の変更なし)。
 */
export function ProductCard({ product, priority = false }: ProductCardProps) {
  return (
    <article className="group">
      <div className="relative mb-4 overflow-hidden rounded-[2px]">
        <PhotoFrame
          src={product.image}
          alt={product.name}
          aspect="aspect-[4/5]"
          className={product.isSoldOut ? 'brightness-[0.55]' : ''}
          priority={priority}
          sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 30vw"
        />

        {!product.isSoldOut && ((product.tag && product.tag !== '季節限定') || product.isSeasonal) && (
          <div className="absolute left-4 top-4 z-[2] flex flex-col items-start gap-1.5">
            {product.tag && product.tag !== '季節限定' && (
              <span className="rounded-full bg-brand px-3 py-1.5 text-[11px] tracking-wide text-ink">
                {product.tag}
              </span>
            )}
            {product.isSeasonal && (
              <span className="rounded-full bg-brand-deep px-3 py-1.5 text-[11px] tracking-wide text-white">
                季節限定
              </span>
            )}
          </div>
        )}

        {product.isSoldOut && (
          <span className="absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-white/70 px-4 py-2 text-[12px] tracking-[0.16em] text-white">
            SOLD OUT
          </span>
        )}
      </div>

      <div className="border-t border-line pt-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[17px] leading-snug transition-colors duration-200 group-hover:text-brand-deep">
            {product.name}
          </h3>
          <span className="shrink-0 font-accent text-[19px] text-brand-text">
            ¥{product.price.toLocaleString()}
          </span>
        </div>
        <p className="mt-2 max-w-[36ch] text-[13px] leading-relaxed text-kura">{product.description}</p>
      </div>
    </article>
  );
}

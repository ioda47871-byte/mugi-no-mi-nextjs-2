import Image from 'next/image';

interface PhotoBlockProps {
  src: string;
  alt: string;
  /** 画像本来のおおよその横幅(px)。CLS対策の初期サイズ確保用のヒント。 */
  width: number;
  /** 画像本来のおおよその高さ(px)。CLS対策の初期サイズ確保用のヒント。 */
  height: number;
  caption?: string;
  priority?: boolean;
  className?: string;
  sizes?: string;
}

/**
 * 「写真を主役にする」ための、トリミングしない大きな写真表示コンポーネント。
 *
 * components/ui/PhotoFrame.tsx(固定アスペクト比 + object-cover。商品カードや
 * Instagramグリッドなど、写真の縦横比がバラバラでも揃った見た目にしたい場面向け)
 * とは役割が異なり、こちらは画像本来の縦横比をそのまま保って横幅いっぱいに表示する
 * (height: autoにより、実際の画像の比率で描画されるため、無理な切り抜きが起きない)。
 * Hero・About・Access・Gallery・Menuなど、写真そのものを見せたいセクションで使用する。
 */
export function PhotoBlock({
  src,
  alt,
  width,
  height,
  caption,
  priority = false,
  className = '',
  sizes = '100vw',
}: PhotoBlockProps) {
  return (
    <figure className={className}>
      <div className="overflow-hidden rounded-[2px]">
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          priority={priority}
          sizes={sizes}
          className="block h-auto w-full"
        />
      </div>
      {caption && (
        <figcaption className="mt-3 text-center font-accent text-[13px] italic tracking-wide text-kura">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

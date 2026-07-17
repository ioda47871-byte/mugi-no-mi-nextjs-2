import Image from 'next/image';

interface PhotoFrameProps {
  src: string | null;
  alt: string;
  /** Tailwindのaspect-ratioユーティリティ。例: "aspect-[4/5]" */
  aspect?: string;
  caption?: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}

/**
 * 写真の有無に関わらず成立するフレームコンポーネント。
 * src が null の場合は、上品なグラデーションのプレースホルダーを表示します
 * (実写真が用意できていないセクション向け)。
 */
export function PhotoFrame({
  src,
  alt,
  aspect = 'aspect-[4/5]',
  caption,
  className = '',
  sizes = '(max-width: 768px) 100vw, 50vw',
  priority = false,
}: PhotoFrameProps) {
  return (
    <div className={`relative overflow-hidden rounded-[2px] photo-frame-bg ${aspect} ${className}`}>
      {src && (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover transition-transform duration-[1200ms] ease-signature hover:scale-[1.06]"
        />
      )}
      {caption && (
        <p className="absolute bottom-4 left-4 font-accent text-[13px] italic text-white/90 [text-shadow:0_2px_10px_rgba(0,0,0,0.35)]">
          {caption}
        </p>
      )}
    </div>
  );
}

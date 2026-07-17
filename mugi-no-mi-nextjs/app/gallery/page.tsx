import type { Metadata } from 'next';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Gallery',
  description: '麦の実 -Mugi no Mi- Boulangerieのギャラリー。準備中です。',
  alternates: { canonical: '/gallery' },
  openGraph: {
    title: `Gallery | ${siteConfig.name}`,
  },
};

/**
 * ルート・基本レイアウトのみ用意した骨組みページです。
 * 実店舗の撮影素材が揃い次第、components/ui/PhotoFrame を使った
 * グリッド+ライトボックス表示を実装してください(静的プレビュー版の
 * gallery.html にレイアウト実装例があります)。
 */
export default function GalleryPage() {
  return (
    <div className="pt-[200px]">
      <div className="mx-auto max-w-container px-8 pb-32 text-center max-[640px]:px-5">
        <span className="eyebrow justify-center">Gallery</span>
        <h1 className="mt-[18px] text-[clamp(34px,5vw,58px)]">光と、香りと、時間の記録</h1>
        <p className="mx-auto mt-6 max-w-lg text-[14.5px] text-kura">
          このページは現在準備中です。店内・パン・職人の手仕事の写真を近日公開いたします。
        </p>
      </div>
    </div>
  );
}

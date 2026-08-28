import type { Metadata } from 'next';
import { PhotoBlock } from '@/components/ui/PhotoBlock';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import { NoBreakText } from '@/components/ui/NoBreakText';
import { WillowDecoration } from '@/components/ui/WillowDecoration';
import { WheatDecoration } from '@/components/ui/WheatDecoration';
import { InstagramCTA } from '@/components/sections/InstagramCTA';
import { StoreInfoStrip } from '@/components/sections/StoreInfoStrip';
import { pageOpenGraph, siteConfig } from '@/lib/site-config';
import { getSitePhotos } from '@/lib/site-photos';
import type { SitePhotoSlot } from '@/lib/admin/storage';

const GALLERY_DESCRIPTION = `${siteConfig.name}の店構えから店内、パンが並ぶ様子まで。写真でたどるご来店体験。`;

// サイト写真(Supabase)は60秒ごとに再取得する(ISR)。
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const photos = await getSitePhotos();
  return {
    title: 'Gallery',
    description: GALLERY_DESCRIPTION,
    alternates: { canonical: '/gallery' },
    openGraph: pageOpenGraph({
      title: 'Gallery',
      description: GALLERY_DESCRIPTION,
      image: photos.exterior.url,
      imageAlt: photos.exterior.alt,
    }),
  };
}

interface GalleryItem {
  slot: SitePhotoSlot;
  width: number;
  height: number;
  caption: string;
  /** trueの場合は横幅いっぱいに、falseの場合は中央寄せの控えめな幅で表示する */
  wide: boolean;
}

/**
 * 外観→入口→店内→厨房→ショーケース→雑貨→ディスプレイの順に並べ、
 * ご来店体験の流れをそのままたどれるようにしている。kitchenはAboutの
 * 「OUR KITCHEN」セクションと同じsite_photosの写真(単一情報源)を使っており、
 * 管理画面での差し替えが両方に反映される。
 * 今後、新しい写真を追加する場合は、この配列に項目を足すだけでよい
 * (新しいスロットの追加にはsupabase/配下の対応するマイグレーションSQLが必要。
 * kitchenはsupabase/kitchen-photo-slot-setup.sqlを参照)。
 */
const GALLERY_ITEMS: GalleryItem[] = [
  { slot: 'exterior', width: 1200, height: 1500, caption: 'Exterior — 柳の木の下で', wide: false },
  { slot: 'entrance', width: 1200, height: 1500, caption: 'Entrance — 扉の向こうへ', wide: false },
  { slot: 'interior', width: 1600, height: 900, caption: 'Interior — 落ち着いた店内', wide: true },
  { slot: 'kitchen', width: 1200, height: 1500, caption: 'Kitchen — ガラスの向こうの厨房', wide: false },
  { slot: 'showcase', width: 1200, height: 1500, caption: 'Showcase — 焼きたてが並ぶ場所', wide: false },
  { slot: 'goods-corner', width: 1200, height: 1500, caption: 'Goods Corner — 雑貨のある風景', wide: false },
  { slot: 'display-accent', width: 1200, height: 1500, caption: 'Display — 小さなこだわり', wide: false },
];

export default async function GalleryPage() {
  const photos = await getSitePhotos();

  return (
    <div className="pt-[200px] max-[640px]:pt-[130px]">
      <div className="relative overflow-hidden">
        {/* 右上の外側に柳の木があり、その枝だけがページへ入り込んでいるように見せる、
            Gallery最大の背景装飾(LEVEL1)。見出しより手前へは出さない(z-0)。 */}
        <WillowDecoration
          variant="canopy"
          className="pointer-events-none absolute -right-20 -top-16 hidden h-[480px] w-[540px] text-gold/[0.16] min-[860px]:block"
        />

        <div className="relative mx-auto max-w-container px-8 pb-16 text-center max-[640px]:px-5">
          <div className="mb-1 flex items-center justify-center gap-4">
            <WheatDecoration lean="left" className="h-9 w-5 text-gold/40 max-[480px]:hidden" />
            <span className="eyebrow">Gallery</span>
            <WheatDecoration lean="right" className="h-9 w-5 text-gold/40 max-[480px]:hidden" />
          </div>
          <h1 className="mt-2 text-[clamp(34px,5vw,58px)]">光と、香りと、時間の記録</h1>
          <p className="mx-auto mt-6 max-w-lg text-[14.5px] text-kura">
            <NoBreakText text="店先の柳の木から、店内、焼きたてが並ぶ様子まで。" phrases={['柳の木']} />
            <br />
            <NoBreakText text="Brot yanagiでの時間を写真でご紹介します。" phrases={['Brot yanagi']} />
          </p>
        </div>
      </div>

      <div className="relative overflow-hidden px-8 pb-24 max-[640px]:px-5 max-[640px]:pb-16">
        {/* ページ左右の余白から、柳がほんの少しだけ覗いている程度の控えめな装飾(LEVEL2) */}
        <WillowDecoration
          variant="branch"
          className="pointer-events-none absolute -left-10 top-24 hidden h-72 w-24 text-gold/15 min-[1200px]:block"
        />
        <WillowDecoration
          variant="branch"
          flip
          className="pointer-events-none absolute -right-10 top-24 hidden h-72 w-24 text-gold/15 min-[1200px]:block"
        />

        <div className="relative mx-auto max-w-container">
          <div className="grid grid-cols-2 gap-x-6 gap-y-14 max-[640px]:grid-cols-1 max-[640px]:gap-y-10">
            {GALLERY_ITEMS.map((item, index) => {
              const photo = photos[item.slot];
              return (
                <RevealOnScroll key={item.slot} className={item.wide ? 'col-span-2' : ''}>
                  <PhotoBlock
                    src={photo.url}
                    alt={photo.alt}
                    width={item.width}
                    height={item.height}
                    caption={item.caption}
                    priority={index === 0}
                    sizes={item.wide ? '100vw' : '(max-width: 640px) 100vw, 50vw'}
                  />
                </RevealOnScroll>
              );
            })}
          </div>
        </div>
      </div>

      <div className="px-8 pb-24 max-[640px]:px-5 max-[640px]:pb-16">
        <InstagramCTA />
      </div>

      <StoreInfoStrip />
    </div>
  );
}

import type { Metadata } from 'next';
import { PhotoBlock } from '@/components/ui/PhotoBlock';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import { NoBreakText } from '@/components/ui/NoBreakText';
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
 * 外観→入口→店内→ショーケース→雑貨→ディスプレイの順に並べ、
 * ご来店体験の流れをそのままたどれるようにしている。
 * 今後、職人がパンを焼く様子・パンを取る瞬間・接客風景などの写真を
 * 追加する場合は、この配列に項目を足すだけでよい
 * (新しいスロットはsupabase/site-photos-setup.sqlの追加が必要)。
 */
const GALLERY_ITEMS: GalleryItem[] = [
  { slot: 'exterior', width: 1200, height: 1500, caption: 'Exterior — 柳の木の下で', wide: false },
  { slot: 'entrance', width: 1200, height: 1500, caption: 'Entrance — 扉の向こうへ', wide: false },
  { slot: 'interior', width: 1500, height: 1125, caption: 'Interior — 落ち着いた店内', wide: true },
  { slot: 'showcase', width: 1600, height: 1067, caption: 'Showcase — 焼きたてが並ぶ場所', wide: true },
  { slot: 'goods-corner', width: 1500, height: 1125, caption: 'Goods Corner — 雑貨のある風景', wide: true },
  { slot: 'display-accent', width: 1200, height: 1500, caption: 'Display — 小さなこだわり', wide: false },
];

export default async function GalleryPage() {
  const photos = await getSitePhotos();

  return (
    <div className="pt-[200px] max-[640px]:pt-[130px]">
      <div className="mx-auto max-w-container px-8 pb-16 text-center max-[640px]:px-5">
        <span className="eyebrow justify-center">Gallery</span>
        <h1 className="mt-[18px] text-[clamp(34px,5vw,58px)]">光と、香りと、時間の記録</h1>
        <p className="mx-auto mt-6 max-w-lg text-[14.5px] text-kura">
          <NoBreakText text="店先の柳の木から、店内、焼きたてが並ぶ様子まで。" phrases={['柳の木']} />
          <br />
          <NoBreakText text="Brot yanagiでの時間を写真でご紹介します。" phrases={['Brot yanagi']} />
        </p>
      </div>

      <div className="mx-auto max-w-container px-8 pb-32 max-[640px]:px-5 max-[640px]:pb-20">
        <div className="flex flex-col items-center gap-20 max-[640px]:gap-14">
          {GALLERY_ITEMS.map((item, index) => {
            const photo = photos[item.slot];
            return (
              <RevealOnScroll key={item.slot} className={item.wide ? 'w-full' : 'w-full max-w-2xl'}>
                <PhotoBlock
                  src={photo.url}
                  alt={photo.alt}
                  width={item.width}
                  height={item.height}
                  caption={item.caption}
                  priority={index === 0}
                  sizes={item.wide ? '100vw' : '(max-width: 768px) 100vw, 672px'}
                />
              </RevealOnScroll>
            );
          })}
        </div>
      </div>
    </div>
  );
}

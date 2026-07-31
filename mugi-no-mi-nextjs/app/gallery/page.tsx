import type { Metadata } from 'next';
import { PhotoBlock } from '@/components/ui/PhotoBlock';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Gallery',
  description: `${siteConfig.name}の店構えから店内、パンが並ぶ様子まで。写真でたどるご来店体験。`,
  alternates: { canonical: '/gallery' },
  openGraph: {
    title: `Gallery | ${siteConfig.name}`,
  },
};

interface GalleryItem {
  id: string;
  src: string;
  alt: string;
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
 * 追加する場合は、この配列に項目を足すだけでよい。
 */
const GALLERY_ITEMS: GalleryItem[] = [
  {
    id: 'exterior',
    src: '/images/exterior.jpg',
    alt: '柳の木とBrot yanagiの外観',
    width: 1200,
    height: 1500,
    caption: 'Exterior — 柳の木の下で',
    wide: false,
  },
  {
    id: 'entrance',
    src: '/images/entrance.jpg',
    alt: 'Brot yanagiの入口',
    width: 1200,
    height: 1500,
    caption: 'Entrance — 扉の向こうへ',
    wide: false,
  },
  {
    id: 'interior',
    src: '/images/interior.jpg',
    alt: '店内の様子',
    width: 1500,
    height: 1125,
    caption: 'Interior — 落ち着いた店内',
    wide: true,
  },
  {
    id: 'showcase',
    src: '/images/showcase.jpg',
    alt: 'パンが並ぶショーケース',
    width: 1600,
    height: 1067,
    caption: 'Showcase — 焼きたてが並ぶ場所',
    wide: true,
  },
  {
    id: 'goods-corner',
    src: '/images/goods-corner.jpg',
    alt: '雑貨コーナーの様子',
    width: 1500,
    height: 1125,
    caption: 'Goods Corner — 雑貨のある風景',
    wide: true,
  },
  {
    id: 'display-accent',
    src: '/images/display-accent.jpg',
    alt: '小物のディスプレイ',
    width: 1200,
    height: 1500,
    caption: 'Display — 小さなこだわり',
    wide: false,
  },
];

export default function GalleryPage() {
  return (
    <div className="pt-[200px] max-[640px]:pt-[130px]">
      <div className="mx-auto max-w-container px-8 pb-16 text-center max-[640px]:px-5">
        <span className="eyebrow justify-center">Gallery</span>
        <h1 className="mt-[18px] text-[clamp(34px,5vw,58px)]">光と、香りと、時間の記録</h1>
        <p className="mx-auto mt-6 max-w-lg text-[14.5px] text-kura">
          店先の柳の木から、店内、焼きたてが並ぶ様子まで。Brot yanagiでの時間を写真でご紹介します。
        </p>
      </div>

      <div className="mx-auto max-w-container px-8 pb-32 max-[640px]:px-5 max-[640px]:pb-20">
        <div className="flex flex-col items-center gap-20 max-[640px]:gap-14">
          {GALLERY_ITEMS.map((item, index) => (
            <RevealOnScroll key={item.id} className={item.wide ? 'w-full' : 'w-full max-w-2xl'}>
              <PhotoBlock
                src={item.src}
                alt={item.alt}
                width={item.width}
                height={item.height}
                caption={item.caption}
                priority={index === 0}
                sizes={item.wide ? '100vw' : '(max-width: 768px) 100vw, 672px'}
              />
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </div>
  );
}

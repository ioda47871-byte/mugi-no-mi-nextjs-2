import type { Metadata } from 'next';
import { MenuSection } from '@/components/sections/MenuSection';
import { getAllProducts } from '@/lib/products';
import { pageOpenGraph, siteConfig } from '@/lib/site-config';
import { getSitePhoto } from '@/lib/site-photos';

const MENU_DESCRIPTION = `${siteConfig.name}の店頭に並ぶパンをカテゴリー別にご紹介します。商品の内容や販売状況は日によって異なります。`;

export async function generateMetadata(): Promise<Metadata> {
  const showcasePhoto = await getSitePhoto('showcase');
  return {
    title: 'Menu',
    description: MENU_DESCRIPTION,
    alternates: { canonical: '/menu' },
    openGraph: pageOpenGraph({
      title: 'Menu',
      description: MENU_DESCRIPTION,
      image: showcasePhoto.url,
      imageAlt: showcasePhoto.alt,
    }),
  };
}

// Supabaseの商品データ・サイト写真は60秒ごとに再取得する(ISR)。
export const revalidate = 60;

export default async function MenuPage() {
  const products = await getAllProducts();

  return (
    <div className="pt-[200px] max-[640px]:pt-[130px]">
      <MenuSection products={products} headingLevel="h1" />
    </div>
  );
}

import type { Metadata } from 'next';
import { MenuSection } from '@/components/sections/MenuSection';
import { getAllProducts } from '@/lib/products';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Menu',
  description: `${siteConfig.name}の店頭に並ぶパンをカテゴリー別にご紹介します。商品の内容や販売状況は日によって異なります。`,
  alternates: { canonical: '/menu' },
  openGraph: {
    title: `Menu | ${siteConfig.name}`,
  },
};

// Supabaseの商品データは60秒ごとに再取得する(ISR)。
export const revalidate = 60;

export default async function MenuPage() {
  const products = await getAllProducts();

  return (
    <div className="pt-[200px] max-[640px]:pt-[130px]">
      <MenuSection products={products} />
    </div>
  );
}

import type { Metadata } from 'next';
import { MenuSection } from '@/components/sections/MenuSection';
import { getAllProducts } from '@/lib/products';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Menu',
  description: '麦の実の商品一覧。食パン、惣菜パン、菓子パン、食事パン、季節限定まで、価格と共にご紹介します。',
  alternates: { canonical: '/menu' },
  openGraph: {
    title: `Menu | ${siteConfig.name}`,
    description: '毎朝焼き上がる、麦の実の全商品ラインナップ。',
  },
};

// Supabaseの商品データは60秒ごとに再取得する(ISR)。
export const revalidate = 60;

export default async function MenuPage() {
  const products = await getAllProducts();

  return (
    <div className="pt-[200px]">
      <MenuSection products={products} />
    </div>
  );
}

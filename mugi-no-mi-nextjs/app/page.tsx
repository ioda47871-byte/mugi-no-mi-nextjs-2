import type { Metadata } from 'next';
import { Hero } from '@/components/sections/Hero';
import { MenuSection } from '@/components/sections/MenuSection';
import { CraftMiniCards } from '@/components/sections/CraftMiniCards';
import { ArtisanCompact } from '@/components/sections/ArtisanCompact';
import { VisitUs } from '@/components/sections/VisitUs';
import { InstagramGrid } from '@/components/sections/InstagramGrid';
import { getAllProducts } from '@/lib/products';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = {
  title: `${siteConfig.name} | 焼きたての一斤に、朝がひとつ生まれる。`,
  description: siteConfig.defaultDescription,
  alternates: { canonical: '/' },
};

// Supabaseの商品データは60秒ごとに再取得する(ISR)。
// 管理者がSupabase上で価格や商品を変更しても、再デプロイなしで
// 最大60秒以内にサイトへ反映される。
export const revalidate = 60;

export default async function HomePage() {
  const products = await getAllProducts();

  return (
    <>
      <Hero />
      <MenuSection products={products} />
      <CraftMiniCards />
      <ArtisanCompact />
      <VisitUs />
      <InstagramGrid />
    </>
  );
}

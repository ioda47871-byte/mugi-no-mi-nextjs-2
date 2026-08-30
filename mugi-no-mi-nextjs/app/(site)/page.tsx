import type { Metadata } from 'next';
import { Hero } from '@/components/sections/Hero';
import { AnnouncementBanner } from '@/components/sections/AnnouncementBanner';
import { FeaturedProducts } from '@/components/sections/FeaturedProducts';
import { CraftMiniCards } from '@/components/sections/CraftMiniCards';
import { StoreInfoStrip } from '@/components/sections/StoreInfoStrip';
import { getAllProducts, getFeaturedHomeProducts } from '@/lib/products';
import { getSitePhoto } from '@/lib/site-photos';
import { getLatestPublishedAnnouncement } from '@/lib/announcements';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = {
  description: siteConfig.defaultDescription,
  alternates: { canonical: '/' },
};

// Supabaseの商品データ・サイト写真は60秒ごとに再取得する(ISR)。
// 管理者がSupabase上で価格・商品・写真を変更しても、再デプロイなしで
// 最大60秒以内にサイトへ反映される。
export const revalidate = 60;

/**
 * トップページの役割は「おすすめ商品で興味を引く」→「カテゴリー導線から
 * 探しやすくする」の2段構成(FeaturedProducts→CraftMiniCards)。
 * 全商品の閲覧・絞り込みはMenuページ(/menu)の役割のため、以前ここに
 * 埋め込んでいたMenuSection(フィルター付き全商品グリッド)は廃止した。
 *
 * 店主紹介(ArtisanCompact)・詳細な来店案内/地図(VisitUs)・Instagram投稿
 * グリッド(InstagramGrid)は、デザイン刷新に伴いHomeでは使用しない
 * (店主紹介はAboutへ、来店詳細はAccessへ集約し、HomeはStoreInfoStripの
 * 軽量な店舗情報+フォローするボタンのみに絞っている)。コンポーネント自体は
 * 削除しておらず、他ページからは引き続き利用可能。
 */
export default async function HomePage() {
  const [products, heroPhoto, announcement] = await Promise.all([
    getAllProducts(),
    getSitePhoto('hero'),
    getLatestPublishedAnnouncement(),
  ]);
  const featuredProducts = getFeaturedHomeProducts(products);

  return (
    <>
      <Hero imageUrl={heroPhoto.url} imageAlt={heroPhoto.alt} />
      <AnnouncementBanner announcement={announcement} />
      <FeaturedProducts products={featuredProducts} />
      <CraftMiniCards />
      <StoreInfoStrip showFollowButton />
    </>
  );
}

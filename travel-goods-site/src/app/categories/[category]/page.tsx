import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Breadcrumbs from '@/components/Breadcrumbs';
import AdDisclosure from '@/components/AdDisclosure';
import ProductFilters from '@/components/ProductFilters';
import { absoluteUrl, siteConfig } from '@/config/site';
import { CATEGORIES, CATEGORY_DESCRIPTIONS, CATEGORY_LABELS, isCategory } from '@/lib/catalog/types';
import { getPublishedArticles, getPublishedProducts, getSiteData } from '@/lib/content/load';
import { buildProductViews } from '@/lib/view';
import Link from 'next/link';
import JsonLd from '@/components/JsonLd';
import { breadcrumbJsonLd } from '@/lib/structured-data';

type Params = { category: string };

export function generateStaticParams(): Params[] {
  return CATEGORIES.map((category) => ({ category }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { category } = await params;
  if (!isCategory(category)) return {};
  const title = `${CATEGORY_LABELS[category]}の仕様比較`;
  const canonical = absoluteUrl(`/categories/${category}/`);
  return {
    title,
    description: `${CATEGORY_DESCRIPTIONS[category]} 重量・サイズ・容量から絞り込めます。`,
    alternates: canonical ? { canonical } : undefined,
    openGraph: { title: `${title}｜${siteConfig.name}`, description: CATEGORY_DESCRIPTIONS[category] },
  };
}

export default async function CategoryPage({ params }: { params: Promise<Params> }) {
  const { category } = await params;
  if (!isCategory(category)) notFound();

  const { catalog, merchantLinks } = getSiteData();
  const products = getPublishedProducts(category);
  const views = buildProductViews(products, merchantLinks, catalog.sources);
  const relatedArticles = getPublishedArticles().filter((article) => article.category === category);

  const crumbs = [
    { name: 'ホーム', href: '/' },
    { name: CATEGORY_LABELS[category], href: null },
  ];

  return (
    <div className="container-page py-6 sm:py-10">
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <Breadcrumbs items={crumbs} />

      <header className="mt-4 max-w-prose">
        <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
          {CATEGORY_LABELS[category]}の仕様比較
        </h1>
        <p className="mt-2 prose-body">{CATEGORY_DESCRIPTIONS[category]}</p>
        <p className="mt-2 text-xs leading-relaxed text-ink-faint">
          掲載しているのはメーカー公表仕様です。確認できなかった項目は「不明」と表示し、推定値では埋めていません。
          販売先の価格・在庫は当サイトでは表示していません。
        </p>
      </header>

      <div className="mt-4">
        <AdDisclosure />
      </div>

      <div className="mt-6">
        {views.length === 0 ? (
          <div className="card p-6" data-testid="empty-state">
            <p className="text-sm font-semibold text-ink">
              このカテゴリで公開できる商品はまだありません。
            </p>
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-soft">
              メーカー公表仕様の出典と確認日をそろえた商品から順に掲載します。
              件数を満たすために、仕様を確認できていない商品や販売終了品を並べることはしません。
            </p>
          </div>
        ) : (
          <ProductFilters views={views} category={category} />
        )}
      </div>

      {relatedArticles.length > 0 ? (
        <section className="mt-12" aria-labelledby="related-heading">
          <h2 id="related-heading" className="text-base font-bold text-ink">
            このカテゴリの記事
          </h2>
          <ul className="mt-3 space-y-2">
            {relatedArticles.map((article) => (
              <li key={article.slug}>
                <Link
                  href={`/articles/${article.slug}/`}
                  className="card block p-3 text-sm text-ink hover:border-accent hover:text-accent-dark"
                >
                  {article.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

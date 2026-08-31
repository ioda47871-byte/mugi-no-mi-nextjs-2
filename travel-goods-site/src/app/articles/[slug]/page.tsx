import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import AdDisclosure from '@/components/AdDisclosure';
import ArticleBody from '@/components/ArticleBody';
import Breadcrumbs from '@/components/Breadcrumbs';
import ComparisonTable from '@/components/ComparisonTable';
import JsonLd from '@/components/JsonLd';
import ProductCard from '@/components/ProductCard';
import { absoluteUrl, siteConfig } from '@/config/site';
import { ARTICLE_CATEGORY_LABELS, isCategory } from '@/lib/catalog/types';
import {
  getArticleBySlug,
  getProductsByIds,
  getPublishedArticles,
  getSiteData,
  getSourcesByIds,
} from '@/lib/content/load';
import { collectProductSources } from '@/lib/content/load';
import { articleJsonLd, breadcrumbJsonLd } from '@/lib/structured-data';
import { extractHeadings, parseMarkdown } from '@/lib/content/markdown';
import { formatDate } from '@/lib/format';
import { buildProductViews } from '@/lib/view';

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return getPublishedArticles().map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) return {};
  const canonical = absoluteUrl(`/articles/${slug}/`);
  return {
    title: article.title,
    description: article.description,
    alternates: canonical ? { canonical } : undefined,
    openGraph: {
      type: 'article',
      title: `${article.title}｜${siteConfig.name}`,
      description: article.description,
      ...(article.publishedAt ? { publishedTime: article.publishedAt } : {}),
      ...(article.updatedAt ? { modifiedTime: article.updatedAt } : {}),
    },
  };
}

export default async function ArticlePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) notFound();

  const { catalog, merchantLinks } = getSiteData();
  const products = getProductsByIds(article.productIds);
  const views = buildProductViews(products, merchantLinks, catalog.sources);
  const headings = extractHeadings(parseMarkdown(article.body));

  // 記事が明示した出典 + 参照商品の仕様が使っている出典
  const sourceIds = [...new Set([...article.sourceIds, ...collectProductSources(products)])];
  const sources = getSourcesByIds(sourceIds);

  const categoryHref = isCategory(article.category) ? `/categories/${article.category}/` : '/articles/';
  const crumbs = [
    { name: 'ホーム', href: '/' },
    { name: '記事一覧', href: '/articles/' },
    { name: ARTICLE_CATEGORY_LABELS[article.category], href: categoryHref },
    { name: article.title, href: null },
  ];

  const comparison =
    products.length > 0 ? (
      <ComparisonTable
        products={products}
        category={isCategory(article.category) ? article.category : undefined}
        caption={`${article.title} の比較表`}
      />
    ) : null;

  return (
    <div className="container-page py-6 sm:py-10">
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <JsonLd data={articleJsonLd(article)} />
      <Breadcrumbs items={crumbs} />

      <article className="mt-4">
        <header className="max-w-prose">
          <p className="text-xs font-medium text-accent-dark">
            {ARTICLE_CATEGORY_LABELS[article.category]}
          </p>
          <h1 className="mt-1 text-xl font-bold leading-snug tracking-tight text-ink sm:text-2xl">
            {article.title}
          </h1>
          <p className="mt-3 prose-body">{article.description}</p>
          <dl className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-faint">
            <div className="flex gap-1">
              <dt>公開:</dt>
              <dd>{formatDate(article.publishedAt)}</dd>
            </div>
            <div className="flex gap-1">
              <dt>実質的な更新:</dt>
              <dd>{formatDate(article.updatedAt)}</dd>
            </div>
            <div className="flex gap-1">
              <dt>情報の確認:</dt>
              <dd>{formatDate(article.reviewedAt)}</dd>
            </div>
            {article.reviewer ? (
              <div className="flex gap-1">
                <dt>確認担当:</dt>
                <dd>{article.reviewer}</dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-4">
            <AdDisclosure />
          </div>
        </header>

        {headings.length > 2 ? (
          <nav aria-labelledby="toc-heading" className="card mt-6 max-w-prose p-4">
            <h2 id="toc-heading" className="text-sm font-bold text-ink">
              目次
            </h2>
            <ol className="mt-2 space-y-1.5 text-sm">
              {headings
                .filter((heading) => heading.level === 2)
                .map((heading) => (
                  <li key={heading.id}>
                    <a href={`#${heading.id}`} className="link-inline">
                      {heading.text}
                    </a>
                  </li>
                ))}
            </ol>
          </nav>
        ) : null}

        <div className="mt-6">
          <ArticleBody body={article.body} comparison={comparison} />
        </div>

        {views.length > 0 ? (
          <section className="mt-12" aria-labelledby="products-heading">
            <h2 id="products-heading" className="border-l-4 border-accent pl-3 text-lg font-bold text-ink sm:text-xl">
              取り上げた商品
            </h2>
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-soft">
              向いている用途と仕様上の制約、確認できた出典を商品ごとに示します。
              販売先のボタンは、型番・バリエーションの一致を確認できたものだけ表示しています。
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {views.map((view) => (
                <ProductCard
                  key={view.product.id}
                  view={view}
                  placement="article-card"
                  articleSlug={article.slug}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-12 max-w-prose" aria-labelledby="sources-heading">
          <h2 id="sources-heading" className="text-base font-bold text-ink">
            出典
          </h2>
          {sources.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">登録された出典がありません。</p>
          ) : (
            <ol className="mt-3 space-y-2 text-sm">
              {sources.map((source) =>
                source ? (
                  <li key={source.id} className="leading-relaxed text-ink-soft">
                    <a className="link-inline" href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.publisher}
                    </a>
                    <span className="text-ink-faint">
                      {' '}
                      — {source.locator}（確認日: {formatDate(source.checkedAt)}）
                    </span>
                  </li>
                ) : null,
              )}
            </ol>
          )}
          <p className="mt-4 text-xs leading-relaxed text-ink-faint">
            仕様はメーカーの公表情報に基づきます。実際の使用感を試した記述は含みません。
            誤りを見つけた場合は<Link className="link-inline" href="/contact/">お問い合わせ</Link>からご連絡ください。
          </p>
        </section>
      </article>
    </div>
  );
}

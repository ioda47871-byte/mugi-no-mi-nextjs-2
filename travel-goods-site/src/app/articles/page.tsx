import type { Metadata } from 'next';
import Link from 'next/link';
import Breadcrumbs from '@/components/Breadcrumbs';
import JsonLd from '@/components/JsonLd';
import { breadcrumbJsonLd } from '@/lib/structured-data';
import { absoluteUrl } from '@/config/site';
import { ARTICLE_CATEGORY_LABELS, CATEGORIES } from '@/lib/catalog/types';
import { getPublishedArticles } from '@/lib/content/load';
import { formatDate } from '@/lib/format';

const GROUPS = [...CATEGORIES, 'packing'] as const;

export const metadata: Metadata = {
  title: '記事一覧',
  description: '旅行用品の比較・選び方・荷づくりの記事一覧です。公開条件を満たした記事だけを掲載しています。',
  alternates: absoluteUrl('/articles/') ? { canonical: absoluteUrl('/articles/') as string } : undefined,
};

export default function ArticlesPage() {
  const articles = getPublishedArticles();
  const crumbs = [
    { name: 'ホーム', href: '/' },
    { name: '記事一覧', href: null },
  ];

  return (
    <div className="container-page py-6 sm:py-10">
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <Breadcrumbs items={crumbs} />
      <header className="mt-4 max-w-prose">
        <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">記事一覧</h1>
        <p className="mt-2 prose-body">
          比較・選び方・荷づくりの記事です。出典と確認日をそろえ、編集上のレビューを済ませた記事だけを公開しています。
        </p>
      </header>

      {articles.length === 0 ? (
        <p className="card mt-6 p-4 text-sm text-ink-soft" data-testid="empty-state">
          公開済みの記事はまだありません。
        </p>
      ) : (
        <div className="mt-8 space-y-10">
          {GROUPS.map((group) => {
            const items = articles.filter((article) => article.category === group);
            if (items.length === 0) return null;
            return (
              <section key={group} aria-labelledby={`group-${group}`}>
                <h2 id={`group-${group}`} className="text-base font-bold text-ink">
                  {ARTICLE_CATEGORY_LABELS[group]}
                </h2>
                <ul className="mt-3 space-y-3">
                  {items.map((article) => (
                    <li key={article.slug} className="card p-4">
                      <Link href={`/articles/${article.slug}/`} className="block">
                        <h3 className="text-base font-bold leading-snug text-ink">{article.title}</h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                          {article.description}
                        </p>
                        <p className="mt-2 text-xs text-ink-faint">
                          更新: {formatDate(article.updatedAt)} / 参照商品 {article.productIds.length} 件
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

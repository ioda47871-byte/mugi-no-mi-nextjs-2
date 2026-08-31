import Link from 'next/link';
import { siteConfig } from '@/config/site';
import {
  CATEGORIES,
  CATEGORY_DESCRIPTIONS,
  CATEGORY_LABELS,
  ARTICLE_CATEGORY_LABELS,
} from '@/lib/catalog/types';
import { getPublishedArticles, getPublishedProducts, getSiteData } from '@/lib/content/load';
import { formatDate } from '@/lib/format';

const PURPOSES = [
  {
    title: '荷物を軽くしたい',
    body: '本体重量から絞り込みます。重量が公表されていない商品は候補に出しません。',
    href: '/categories/suitcases/',
  },
  {
    title: '機内持ち込みで収めたい',
    body: '外寸（ハンドル・キャスター込み）と本体寸法を分けて確認できます。',
    href: '/categories/suitcases/',
  },
  {
    title: '荷物を整理したい',
    body: 'ポーチ自身の重量・収納時の厚み・仕切り数から選べます。',
    href: '/categories/pouches/',
  },
  {
    title: '充電まわりを軽くしたい',
    body: '重量・電池容量・定格電力量(Wh)・出力を並べて確認できます。',
    href: '/categories/power-banks/',
  },
];

export default function HomePage() {
  const { catalog } = getSiteData();
  const articles = getPublishedArticles();
  const products = getPublishedProducts();
  const featured = articles.slice(0, 4);

  return (
    <div className="container-page py-8 sm:py-12">
      <section className="max-w-prose">
        <h1 className="text-2xl font-bold leading-snug tracking-tight text-ink sm:text-3xl">
          {siteConfig.tagline}
        </h1>
        <p className="mt-3 prose-body">
          重さ・サイズ・使い方から、旅行に合う持ちものを探せます。
          2〜3泊の旅行で「荷物を軽く・少なく・整理しやすく」したい人向けに、
          メーカーが公表している仕様を横並びにして比較できるようにしました。
        </p>
        <ul className="mt-4 space-y-1.5 text-sm text-ink-soft">
          <li>・掲載しているのは公表仕様と、その出典・確認日です。</li>
          <li>・確認できなかった項目は「不明」と表示し、推定値では埋めません。</li>
          <li>・使っていない商品の使用感・体験談は書きません。</li>
        </ul>
        {siteConfig.nameIsProvisional ? (
          <p className="mt-4 rounded-lg bg-paper px-3 py-2 text-xs text-ink-faint">
            サイト名「{siteConfig.name}」は仮称です。正式名称・商標・ドメインの確認は未実施です。
          </p>
        ) : null}
      </section>

      <section className="mt-10" aria-labelledby="categories-heading">
        <h2 id="categories-heading" className="text-lg font-bold text-ink">
          4つの分野から比較する
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {CATEGORIES.map((category) => {
            const count = products.filter((product) => product.category === category).length;
            return (
              <Link
                key={category}
                href={`/categories/${category}/`}
                className="card group flex flex-col gap-1.5 p-4 transition-colors hover:border-accent"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-base font-bold text-ink group-hover:text-accent-dark">
                    {CATEGORY_LABELS[category]}
                  </span>
                  <span className="shrink-0 text-xs text-ink-faint">掲載 {count} 件</span>
                </span>
                <span className="text-sm leading-relaxed text-ink-soft">
                  {CATEGORY_DESCRIPTIONS[category]}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-10" aria-labelledby="purpose-heading">
        <h2 id="purpose-heading" className="text-lg font-bold text-ink">
          目的から探す
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {PURPOSES.map((purpose) => (
            <li key={purpose.title} className="card p-4">
              <Link href={purpose.href} className="text-sm font-bold text-ink hover:text-accent-dark">
                {purpose.title}
              </Link>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{purpose.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10" aria-labelledby="articles-heading">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="articles-heading" className="text-lg font-bold text-ink">
            主な比較・選び方の記事
          </h2>
          <Link href="/articles/" className="text-sm font-medium text-accent-dark hover:underline">
            すべて見る
          </Link>
        </div>
        {featured.length === 0 ? (
          <p className="card mt-4 p-4 text-sm text-ink-soft">
            公開条件（出典・確認日・レビュー記録）を満たした記事から順に公開します。現在は公開済みの記事がありません。
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {featured.map((article) => (
              <li key={article.slug} className="card p-4">
                <Link href={`/articles/${article.slug}/`} className="block">
                  <span className="text-xs font-medium text-accent-dark">
                    {ARTICLE_CATEGORY_LABELS[article.category]}
                  </span>
                  <h3 className="mt-1 text-base font-bold leading-snug text-ink">{article.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{article.description}</p>
                  <p className="mt-2 text-xs text-ink-faint">更新: {formatDate(article.updatedAt)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 card p-4 sm:p-5" aria-labelledby="status-heading">
        <h2 id="status-heading" className="text-sm font-bold text-ink">
          現在の掲載状況
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-ink-faint">公開商品</dt>
            <dd className="font-bold text-ink">{products.length} 件</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">公開記事</dt>
            <dd className="font-bold text-ink">{articles.length} 本</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">登録済み出典</dt>
            <dd className="font-bold text-ink">{catalog.sources.length} 件</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">データセット</dt>
            <dd className="font-bold text-ink">
              {catalog.dataset.kind === 'demo' ? 'デモ' : '本番'}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

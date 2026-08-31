import Link from 'next/link';
import { siteConfig } from '@/config/site';
import { CATEGORIES, CATEGORY_SHORT_LABELS } from '@/lib/catalog/types';

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-paper-line bg-paper-card/95 backdrop-blur">
      <div className="container-page flex flex-col gap-2 py-3">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="text-base font-bold tracking-tight text-ink">
            {siteConfig.name}
          </Link>
          <Link
            href="/articles/"
            className="rounded-lg px-2 py-1 text-sm font-medium text-accent-dark hover:bg-accent-soft"
          >
            記事一覧
          </Link>
        </div>
        <nav aria-label="カテゴリ" className="-mx-1 overflow-x-auto">
          <ul className="flex gap-1 px-1 text-sm">
            {CATEGORIES.map((category) => (
              <li key={category}>
                <Link
                  href={`/categories/${category}/`}
                  className="inline-block whitespace-nowrap rounded-lg border border-paper-line px-3 py-1.5 text-ink-soft transition-colors hover:border-accent hover:text-accent-dark"
                >
                  {CATEGORY_SHORT_LABELS[category]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}

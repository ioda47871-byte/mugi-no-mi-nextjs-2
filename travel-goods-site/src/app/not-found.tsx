import Link from 'next/link';
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/catalog/types';

export default function NotFound() {
  return (
    <div className="container-page py-16">
      <h1 className="text-2xl font-bold text-ink">ページが見つかりません</h1>
      <p className="mt-3 max-w-prose prose-body">
        お探しのページは移動または削除された可能性があります。下のカテゴリか記事一覧からお探しください。
      </p>
      <ul className="mt-6 flex flex-wrap gap-2">
        {CATEGORIES.map((category) => (
          <li key={category}>
            <Link
              href={`/categories/${category}/`}
              className="inline-block rounded-lg border border-paper-line px-3 py-2 text-sm text-ink-soft hover:border-accent hover:text-accent-dark"
            >
              {CATEGORY_LABELS[category]}
            </Link>
          </li>
        ))}
        <li>
          <Link
            href="/articles/"
            className="inline-block rounded-lg border border-paper-line px-3 py-2 text-sm text-ink-soft hover:border-accent hover:text-accent-dark"
          >
            記事一覧
          </Link>
        </li>
      </ul>
    </div>
  );
}

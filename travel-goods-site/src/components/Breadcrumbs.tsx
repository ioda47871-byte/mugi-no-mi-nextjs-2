import Link from 'next/link';

export type Crumb = { name: string; href: string | null };

/** パンくず（計画書 9節）。構造化データは各ページ側で同じ内容から生成する。 */
export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="パンくずリスト" className="text-xs text-ink-faint">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => (
          <li key={`${item.name}-${index}`} className="flex items-center gap-1">
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {item.href ? (
              <Link href={item.href} className="hover:text-accent-dark hover:underline">
                {item.name}
              </Link>
            ) : (
              <span aria-current="page" className="text-ink-soft">
                {item.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

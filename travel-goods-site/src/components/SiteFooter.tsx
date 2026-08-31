import Link from 'next/link';
import { siteConfig } from '@/config/site';

const LINKS = [
  { href: '/about/', label: '運営者情報' },
  { href: '/editorial-policy/', label: '編集・広告方針' },
  { href: '/privacy/', label: 'プライバシー' },
  { href: '/contact/', label: 'お問い合わせ' },
];

export default function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-paper-line bg-paper-card">
      <div className="container-page space-y-4 py-8">
        <p className="text-sm font-bold text-ink">{siteConfig.name}</p>
        <p className="max-w-prose text-xs leading-relaxed text-ink-soft">
          メーカーが公表している仕様をもとに、旅行用品を比較できるようにしたサイトです。
          当サイトは商品を実際に使用した体験としての評価は掲載していません。
          広告・アフィリエイトリンクを含みます。
        </p>
        <nav aria-label="サイト情報">
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-ink-soft hover:text-accent-dark hover:underline">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="text-xs text-ink-faint">
          © {new Date().getFullYear()} {siteConfig.operatorName ?? siteConfig.name}
        </p>
      </div>
    </footer>
  );
}

import Link from 'next/link';
import { getAdminProducts } from '@/lib/admin/products';
import { getAdminSitePhotos } from '@/lib/admin/site-photos';
import { ADMIN_NAV_ITEMS } from '@/lib/admin/nav';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const [products, sitePhotos] = await Promise.all([getAdminProducts(), getAdminSitePhotos()]);
  const filledPhotoCount = sitePhotos.filter((photo) => photo.imageUrl).length;

  const summaryByHref: Record<string, string> = {
    '/admin/products': `${products.length}件`,
    '/admin/site-photos': `${filledPhotoCount} / ${sitePhotos.length}枚 設定済み`,
  };

  const cards = ADMIN_NAV_ITEMS.filter((item) => item.href !== '/admin');

  return (
    <div>
      <h1 className="mb-2 font-display text-2xl text-ink">ダッシュボード</h1>
      <p className="mb-8 text-sm text-kura">各メニューへはこちらから移動できます。</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-[4px] border border-line bg-white px-5 py-4 transition-colors hover:border-ink"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-accent text-sm italic tracking-wide text-brand-text">{item.label}</span>
              {item.comingSoon && (
                <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] tracking-wide text-kura">
                  準備中
                </span>
              )}
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-kura">{item.description}</p>
            {summaryByHref[item.href] && <p className="mt-3 text-[13px] text-ink">{summaryByHref[item.href]}</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}

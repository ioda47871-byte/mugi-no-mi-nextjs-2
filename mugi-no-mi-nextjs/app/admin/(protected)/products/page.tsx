import Link from 'next/link';
import { getAdminProducts } from '@/lib/admin/products';
import { CATEGORY_OPTIONS } from '@/lib/admin/validation';
import { AdminProductsTable } from '@/components/admin/AdminProductsTable';

export const dynamic = 'force-dynamic';

const CATEGORY_LABEL_MAP = Object.fromEntries(CATEGORY_OPTIONS.map((c) => [c.id, c.label]));

const FLASH_MESSAGES: Record<string, { text: string; tone: 'success' | 'error' }> = {
  created: { text: '商品を追加しました。', tone: 'success' },
  updated: { text: '商品を更新しました。', tone: 'success' },
  deleted: { text: '商品を削除しました。', tone: 'success' },
  delete_failed: { text: '削除に失敗しました。時間をおいて再度お試しください。', tone: 'error' },
};

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: { msg?: string };
}) {
  const products = await getAdminProducts();
  const flash = searchParams.msg ? FLASH_MESSAGES[searchParams.msg] : undefined;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl text-ink">商品一覧</h1>
        <Link
          href="/admin/products/new"
          className="inline-flex min-h-[48px] items-center rounded-[2px] bg-brand px-6 text-[13px] tracking-[0.12em] text-ink transition-all duration-300 hover:bg-brand-deep"
        >
          + 商品を追加
        </Link>
      </div>

      {flash && (
        <p
          className={`mb-6 rounded-[2px] border px-4 py-3 text-sm ${
            flash.tone === 'success'
              ? 'border-brand/50 bg-brand-pale text-ink'
              : 'border-red-300 bg-red-50 text-red-700'
          }`}
        >
          {flash.text}
        </p>
      )}

      <AdminProductsTable initialProducts={products} categoryLabelMap={CATEGORY_LABEL_MAP} />
    </div>
  );
}

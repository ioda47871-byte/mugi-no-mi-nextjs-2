'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { AdminProduct } from '@/lib/admin/products';
import { toggleProductFlagAction, type ToggleField } from '@/app/admin/(protected)/actions';
import { DeleteProductButton } from '@/components/admin/DeleteProductButton';

interface AdminProductsTableProps {
  initialProducts: AdminProduct[];
  categoryLabelMap: Record<string, string>;
}

interface ToggleDef {
  field: ToggleField;
  label: string;
  isOn: (p: AdminProduct) => boolean;
  toneOn: string;
}

const TOGGLES: ToggleDef[] = [
  { field: 'is_active', label: '公開', isOn: (p) => p.isActive, toneOn: 'bg-brand-pale text-ink border-brand/50' },
  { field: 'is_popular', label: '人気', isOn: (p) => p.isPopular, toneOn: 'bg-brand text-ink border-brand' },
  {
    field: 'is_seasonal',
    label: '季節限定',
    isOn: (p) => p.isSeasonal,
    toneOn: 'bg-brand-deep text-white border-brand-deep',
  },
  { field: 'is_sold_out', label: '売り切れ', isOn: (p) => p.isSoldOut, toneOn: 'bg-red-100 text-red-700 border-red-300' },
  {
    field: 'is_featured_home',
    label: 'ホームおすすめ',
    isOn: (p) => p.isFeaturedHome,
    toneOn: 'bg-ink text-brand-pale border-ink',
  },
];

function applyToggle(product: AdminProduct, field: ToggleField, value: boolean): AdminProduct {
  if (field === 'is_active') return { ...product, isActive: value };
  if (field === 'is_popular') return { ...product, isPopular: value };
  if (field === 'is_seasonal') return { ...product, isSeasonal: value };
  if (field === 'is_sold_out') return { ...product, isSoldOut: value };
  return { ...product, isFeaturedHome: value };
}

/**
 * 一覧テーブル。公開/人気/季節限定/売り切れは、編集画面を開かずに
 * ワンクリックでON/OFFできる(楽観的更新: 即座に画面へ反映し、
 * Server Actionの結果が失敗だった場合のみ元に戻す。ページ遷移・リロードは行わない)。
 */
export function AdminProductsTable({ initialProducts, categoryLabelMap }: AdminProductsTableProps) {
  const [products, setProducts] = useState(initialProducts);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const handleToggle = (product: AdminProduct, def: ToggleDef) => {
    const nextValue = !def.isOn(product);
    const key = `${product.id}:${def.field}`;
    setToggleError(null);
    setPendingKey(key);

    // 楽観的更新: サーバーの応答を待たずに即座にUIへ反映する
    setProducts((prev) => prev.map((p) => (p.id === product.id ? applyToggle(p, def.field, nextValue) : p)));

    startTransition(async () => {
      const result = await toggleProductFlagAction(product.id, def.field, nextValue);
      setPendingKey(null);

      if (!result.ok) {
        // 失敗時は元の状態へ戻す
        setProducts((prev) => prev.map((p) => (p.id === product.id ? applyToggle(p, def.field, !nextValue) : p)));
        setToggleError(result.error ?? '更新に失敗しました。');
      }
    });
  };

  if (products.length === 0) {
    return (
      <p className="rounded-[2px] border border-dashed border-line px-6 py-12 text-center text-sm text-kura">
        商品がまだ登録されていません。「商品を追加」から最初の1件を登録してください。
      </p>
    );
  }

  return (
    <div>
      {toggleError && (
        <p className="mb-4 rounded-[2px] border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{toggleError}</p>
      )}

      <div className="overflow-x-auto rounded-[2px] border border-line">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-white text-left text-kura">
              <th className="px-4 py-3 font-normal">表示順</th>
              <th className="px-4 py-3 font-normal">商品名</th>
              <th className="px-4 py-3 font-normal">価格</th>
              <th className="px-4 py-3 font-normal">カテゴリ</th>
              <th className="px-4 py-3 font-normal">タグ</th>
              <th className="px-4 py-3 font-normal">状態(クリックで切替)</th>
              <th className="px-4 py-3 font-normal">操作</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-b border-line last:border-b-0 odd:bg-white">
                <td className="px-4 py-3 text-kura">{product.displayOrder}</td>
                <td className="px-4 py-3 text-ink">{product.name}</td>
                <td className="px-4 py-3 text-ink">¥{product.price.toLocaleString()}</td>
                <td className="px-4 py-3 text-kura">{categoryLabelMap[product.categoryId] ?? product.categoryId}</td>
                <td className="px-4 py-3 text-kura">{product.tag ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {TOGGLES.map((def) => {
                      const on = def.isOn(product);
                      const key = `${product.id}:${def.field}`;
                      const isPending = pendingKey === key;
                      return (
                        <button
                          key={def.field}
                          type="button"
                          disabled={isPending}
                          onClick={() => handleToggle(product, def)}
                          aria-pressed={on}
                          title={`${def.label}を${on ? 'OFF' : 'ON'}にする`}
                          className={`min-h-[32px] rounded-full border px-3 text-[11px] tracking-wide transition-all duration-200 disabled:opacity-50 ${
                            on ? def.toneOn : 'border-line bg-white text-kura/50 hover:text-kura hover:border-kura/40'
                          }`}
                        >
                          {def.label}
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/admin/products/${product.id}/edit`}
                      className="inline-flex min-h-[44px] items-center rounded-[2px] border border-line px-4 text-[13px] text-ink transition-colors hover:border-ink"
                    >
                      編集
                    </Link>
                    <DeleteProductButton id={product.id} name={product.name} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

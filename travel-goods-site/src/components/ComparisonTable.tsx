import { CATEGORY_SPEC_SCHEMAS, SPEC_LABELS, SPEC_UNITS } from '@/lib/catalog/schema';
import type { Category, Product } from '@/lib/catalog/types';
import { formatSpec, formatWeight, measurementRows, productName } from '@/lib/format';

/**
 * 仕様比較表（計画書 3節・5-2節）。
 * - 不明値は「不明」と表示する。空欄・0・推定値で埋めない。
 * - 外寸と本体寸法を別の行として扱う。
 * - 360px でも本文がはみ出さないよう、表だけ横スクロールさせ、その旨を伝える。
 */

type Props = {
  products: Product[];
  category?: Category;
  caption?: string;
};

type Row = { label: string; render: (product: Product) => string };

function buildRows(products: Product[], category?: Category): Row[] {
  const rows: Row[] = [{ label: '本体重量', render: (p) => formatWeight(p.weightG) }];

  // 寸法・容量は「条件つきの行」として展開する。
  // 測定条件（ハンドル込み／除く、通常時／拡張時）が違う値を同じ行に混ぜない。
  const measurementLabels: string[] = [];
  for (const product of products) {
    for (const row of measurementRows(product)) {
      if (!measurementLabels.includes(row.label)) measurementLabels.push(row.label);
    }
  }
  for (const label of measurementLabels) {
    rows.push({
      label,
      render: (product) => measurementRows(product).find((row) => row.label === label)?.value ?? '不明',
    });
  }

  // 表示する spec 列は、実際に 1 件以上値があるものだけ。
  const categories = category ? [category] : [...new Set(products.map((p) => p.category))];
  const specKeys: string[] = [];
  for (const cat of categories) {
    for (const key of Object.keys(CATEGORY_SPEC_SCHEMAS[cat])) {
      if (!specKeys.includes(key)) specKeys.push(key);
    }
  }

  for (const key of specKeys) {
    if (!products.some((p) => p.specs[key]?.value !== undefined && p.specs[key]?.value !== null)) {
      continue;
    }
    rows.push({
      label: SPEC_LABELS[key] ?? key,
      render: (p) => formatSpec(p.specs[key], SPEC_UNITS[key]),
    });
  }

  return rows;
}

export default function ComparisonTable({ products, category, caption }: Props) {
  if (products.length === 0) {
    return (
      <p className="card p-4 text-sm text-ink-soft">
        比較できる商品がまだありません。仕様を確認できた商品から順に追加します。
      </p>
    );
  }

  const rows = buildRows(products, category);

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-faint sm:hidden" aria-hidden="true">
        ← 表は横にスクロールできます →
      </p>
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label={caption ?? '仕様比較表（横にスクロールできます）'}
      >
        <table className="w-max min-w-full border-collapse text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 w-28 min-w-28 border-b border-r border-paper-line bg-paper px-3 py-2.5 text-left text-xs font-semibold text-ink-faint"
              >
                項目
              </th>
              {products.map((product) => (
                <th
                  key={product.id}
                  scope="col"
                  className="w-48 min-w-48 border-b border-paper-line bg-paper px-3 py-2.5 text-left text-xs font-semibold leading-snug text-ink"
                >
                  {productName(product)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="even:bg-paper/60">
                <th
                  scope="row"
                  className="sticky left-0 z-10 w-28 min-w-28 border-b border-r border-paper-line bg-paper-card px-3 py-2.5 text-left text-xs font-medium leading-snug text-ink-faint"
                >
                  {row.label}
                </th>
                {products.map((product) => {
                  const value = row.render(product);
                  return (
                    <td
                      key={product.id}
                      className={`w-48 min-w-48 border-b border-paper-line px-3 py-2.5 leading-snug ${
                        value === '不明' ? 'text-ink-faint' : 'text-ink'
                      }`}
                    >
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-relaxed text-ink-faint">
        「不明」はメーカー公表仕様で確認できなかった項目です。推定値は入れていません。
        寸法の行は測定条件（ハンドルを含むか、通常時か拡張時か）ごとに分けています。
        条件の違う商品どうしでは、同じ行に値が並びません。
      </p>
    </div>
  );
}

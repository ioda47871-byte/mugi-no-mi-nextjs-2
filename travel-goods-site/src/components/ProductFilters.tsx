'use client';

import { useId, useMemo, useState } from 'react';
import { CATEGORY_SPEC_SCHEMAS, SPEC_LABELS } from '@/lib/catalog/schema';
import { filterProducts, sortProducts, type FilterCriteria, type SortKey } from '@/lib/catalog/filter';
import type { Category } from '@/lib/catalog/types';
import type { ProductView } from '@/lib/view';
import ComparisonTable from './ComparisonTable';
import ProductCard from './ProductCard';

/**
 * カテゴリ画面の絞り込み（計画書 3節）。
 *
 * - ラベル付き、選択解除あり、結果件数を常時表示、0件時の案内あり
 * - すべてネイティブのフォーム要素でキーボード操作できる
 * - 絞り込みはページ内の状態だけで扱い、組合せごとのURL/SEOページを作らない
 * - 「不明」は条件一致にしない（filterProducts の責務）
 */

type Props = {
  views: ProductView[];
  category: Category;
};

type WeightPreset = 'all' | 'under-2500' | 'under-3000' | 'under-3500' | 'under-500' | 'under-250';
type CapacityPreset = 'all' | 'under-25' | '25-40' | '40-60' | 'over-60';

const WEIGHT_PRESETS: Record<Category, { value: WeightPreset; label: string; max?: number }[]> = {
  suitcases: [
    { value: 'all', label: 'すべて' },
    { value: 'under-2500', label: '2.5kg以下', max: 2500 },
    { value: 'under-3000', label: '3.0kg以下', max: 3000 },
    { value: 'under-3500', label: '3.5kg以下', max: 3500 },
  ],
  backpacks: [
    { value: 'all', label: 'すべて' },
    { value: 'under-500', label: '500g以下', max: 500 },
    { value: 'under-2500', label: '1.0kg以下', max: 1000 },
  ],
  pouches: [
    { value: 'all', label: 'すべて' },
    { value: 'under-250', label: '100g以下', max: 100 },
    { value: 'under-500', label: '200g以下', max: 200 },
  ],
  'power-banks': [
    { value: 'all', label: 'すべて' },
    { value: 'under-250', label: '250g以下', max: 250 },
    { value: 'under-500', label: '500g以下', max: 500 },
  ],
};

const CAPACITY_PRESETS: { value: CapacityPreset; label: string; min?: number; max?: number }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'under-25', label: '25L未満', max: 24.9 },
  { value: '25-40', label: '25〜40L', min: 25, max: 40 },
  { value: '40-60', label: '40〜60L', min: 40, max: 60 },
  { value: 'over-60', label: '60L以上', min: 60 },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name', label: '名前順' },
  { value: 'weightG', label: '本体重量が軽い順' },
  { value: 'capacityL', label: '容量が小さい順' },
  { value: 'outerSizeSumMm', label: '外寸(3辺合計)が小さい順' },
];

function booleanSpecKeys(category: Category): string[] {
  const schema = CATEGORY_SPEC_SCHEMAS[category] as Record<string, string>;
  return Object.entries(schema)
    .filter(([, kind]) => kind === 'boolean')
    .map(([key]) => key);
}

export default function ProductFilters({ views, category }: Props) {
  const baseId = useId();
  const [weightPreset, setWeightPreset] = useState<WeightPreset>('all');
  const [capacityPreset, setCapacityPreset] = useState<CapacityPreset>('all');
  const [requiredSpecs, setRequiredSpecs] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [showTable, setShowTable] = useState(false);

  const weightOptions = WEIGHT_PRESETS[category];
  // データに実在する boolean spec だけを選択肢にする。
  const availableSpecs = useMemo(
    () =>
      booleanSpecKeys(category).filter((key) =>
        views.some((view) => view.product.specs[key]?.value === true),
      ),
    [category, views],
  );

  const criteria: FilterCriteria = useMemo(() => {
    const weight = weightOptions.find((option) => option.value === weightPreset);
    const capacity = CAPACITY_PRESETS.find((option) => option.value === capacityPreset);
    return {
      weightG: weight?.max === undefined ? undefined : { max: weight.max },
      capacityL:
        capacity && (capacity.min !== undefined || capacity.max !== undefined)
          ? { min: capacity.min, max: capacity.max }
          : undefined,
      requiredBooleanSpecs: requiredSpecs,
      statuses: ['published'],
    };
  }, [capacityPreset, requiredSpecs, weightOptions, weightPreset]);

  const results = useMemo(() => {
    const products = sortProducts(
      filterProducts(
        views.map((view) => view.product),
        criteria,
      ),
      sortKey,
    );
    const byId = new Map(views.map((view) => [view.product.id, view]));
    return products.map((product) => byId.get(product.id)!).filter(Boolean);
  }, [criteria, sortKey, views]);

  const hasFilters =
    weightPreset !== 'all' || capacityPreset !== 'all' || requiredSpecs.length > 0;

  const toggleSpec = (key: string) => {
    setRequiredSpecs((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  const clearAll = () => {
    setWeightPreset('all');
    setCapacityPreset('all');
    setRequiredSpecs([]);
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby={`${baseId}-filters`} className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id={`${baseId}-filters`} className="text-sm font-bold text-ink">
            条件で絞り込む
          </h2>
          <button
            type="button"
            onClick={clearAll}
            disabled={!hasFilters}
            className="min-h-9 rounded-lg border border-paper-line px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
          >
            選択を解除
          </button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${baseId}-weight`} className="block text-xs font-medium text-ink-faint">
              本体重量
            </label>
            <select
              id={`${baseId}-weight`}
              value={weightPreset}
              onChange={(event) => setWeightPreset(event.target.value as WeightPreset)}
              className="mt-1 min-h-11 w-full rounded-lg border border-paper-line bg-white px-3 text-sm text-ink"
            >
              {weightOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${baseId}-capacity`} className="block text-xs font-medium text-ink-faint">
              容量
            </label>
            <select
              id={`${baseId}-capacity`}
              value={capacityPreset}
              onChange={(event) => setCapacityPreset(event.target.value as CapacityPreset)}
              className="mt-1 min-h-11 w-full rounded-lg border border-paper-line bg-white px-3 text-sm text-ink"
            >
              {CAPACITY_PRESETS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {availableSpecs.length > 0 ? (
          <fieldset className="mt-4">
            <legend className="text-xs font-medium text-ink-faint">必要な機能</legend>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              {availableSpecs.map((key) => (
                <label key={key} className="inline-flex min-h-9 items-center gap-2 text-sm text-ink-soft">
                  <input
                    type="checkbox"
                    checked={requiredSpecs.includes(key)}
                    onChange={() => toggleSpec(key)}
                    className="h-4 w-4 rounded border-paper-line text-accent"
                  />
                  {SPEC_LABELS[key] ?? key}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <p className="mt-3 text-xs leading-relaxed text-ink-faint">
          条件を指定した項目が「不明」の商品は、条件に合うものとして数えません。
        </p>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink" role="status" data-testid="result-count">
          該当 {results.length} 件 / 全 {views.length} 件
        </p>
        <div className="flex items-center gap-2">
          <label htmlFor={`${baseId}-sort`} className="text-xs text-ink-faint">
            並び順
          </label>
          <select
            id={`${baseId}-sort`}
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            className="min-h-10 rounded-lg border border-paper-line bg-white px-2 text-sm text-ink"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowTable((value) => !value)}
            aria-pressed={showTable}
            className="min-h-10 rounded-lg border border-paper-line px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-paper"
          >
            {showTable ? 'カード表示' : '表で比較'}
          </button>
        </div>
      </div>

      {results.length === 0 ? (
        <div className="card p-6 text-center" data-testid="empty-state">
          <p className="text-sm font-semibold text-ink">条件に合う商品が見つかりませんでした。</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            条件をゆるめるか、選択を解除してください。仕様が確認できていない商品は掲載していないため、
            該当が0件になることがあります。
          </p>
          <button
            type="button"
            onClick={clearAll}
            className="mt-4 min-h-11 rounded-lg border border-accent px-4 py-2 text-sm font-semibold text-accent-dark transition-colors hover:bg-accent-soft"
          >
            条件をすべて解除する
          </button>
        </div>
      ) : showTable ? (
        <ComparisonTable
          products={results.map((view) => view.product)}
          category={category}
          caption="絞り込み結果の仕様比較"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {results.map((view) => (
            <ProductCard
              key={view.product.id}
              view={view}
              placement="category-card"
              categoryId={category}
            />
          ))}
        </div>
      )}
    </div>
  );
}

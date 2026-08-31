import type { Category, Product, SpecValue } from './types';

/**
 * 絞り込み。最重要ルール（計画書 5-2節）:
 *   「不明(null)」は条件一致と扱わない。
 *   数値条件が指定されたとき、その項目が不明な商品は結果から外す。
 *   条件が指定されていない項目については、不明でも除外しない。
 */

export type NumericRange = {
  min?: number;
  max?: number;
};

export type FilterCriteria = {
  category?: Category;
  /** 本体重量 (g) */
  weightG?: NumericRange;
  /** 容量 (L) */
  capacityL?: NumericRange;
  /** 外寸3辺の合計 (mm)。外寸が不明な商品は条件指定時に除外される。 */
  outerSizeSumMm?: NumericRange;
  /** boolean spec のうち true を要求するキー。 */
  requiredBooleanSpecs?: string[];
  /** 文字列 spec の完全一致条件。 */
  specEquals?: Record<string, SpecValue>;
  /** 数値 spec の範囲条件。 */
  specRanges?: Record<string, NumericRange>;
  /** 公開状態の絞り込み。既定は published のみ。 */
  statuses?: Product['status'][];
};

function isEmptyRange(range: NumericRange | undefined): range is undefined {
  return !range || (range.min === undefined && range.max === undefined);
}

function withinRange(value: number, range: NumericRange): boolean {
  if (range.min !== undefined && value < range.min) return false;
  if (range.max !== undefined && value > range.max) return false;
  return true;
}

function matchNumericFact(
  value: number | null,
  range: NumericRange | undefined,
): boolean {
  if (isEmptyRange(range)) return true; // 条件なし → 不明でも残す
  if (value === null) return false; // 条件あり + 不明 → 一致とみなさない
  return withinRange(value, range);
}

export function outerSizeSumMm(product: Product): number | null {
  const size = product.outerSizeMm.value;
  if (!size) return null;
  return size[0] + size[1] + size[2];
}

export function filterProducts(products: Product[], criteria: FilterCriteria = {}): Product[] {
  const statuses = criteria.statuses ?? ['published'];

  return products.filter((product) => {
    if (!statuses.includes(product.status)) return false;
    if (criteria.category && product.category !== criteria.category) return false;

    if (!matchNumericFact(product.weightG.value, criteria.weightG)) return false;
    if (!matchNumericFact(product.capacityL.value, criteria.capacityL)) return false;
    if (!matchNumericFact(outerSizeSumMm(product), criteria.outerSizeSumMm)) return false;

    for (const key of criteria.requiredBooleanSpecs ?? []) {
      const fact = product.specs[key];
      // 不明・未掲載は「条件を満たす」と扱わない。
      if (!fact || fact.value !== true) return false;
    }

    for (const [key, expected] of Object.entries(criteria.specEquals ?? {})) {
      const fact = product.specs[key];
      if (!fact || fact.value === null || fact.value !== expected) return false;
    }

    for (const [key, range] of Object.entries(criteria.specRanges ?? {})) {
      const fact = product.specs[key];
      const value = typeof fact?.value === 'number' ? fact.value : null;
      if (!matchNumericFact(value, range)) return false;
    }

    return true;
  });
}

export type SortKey = 'weightG' | 'capacityL' | 'outerSizeSumMm' | 'name';

/**
 * 並び替え。数値が不明な商品は「昇順ランキングの対象にしない」ため、
 * 値の有無で二段階に分け、不明は常に末尾へ置く（順位を持たせない）。
 */
export function sortProducts(products: Product[], key: SortKey): Product[] {
  const readValue = (product: Product): number | null => {
    switch (key) {
      case 'weightG':
        return product.weightG.value;
      case 'capacityL':
        return product.capacityL.value;
      case 'outerSizeSumMm':
        return outerSizeSumMm(product);
      default:
        return null;
    }
  };

  const byName = (a: Product, b: Product) =>
    `${a.brand} ${a.model} ${a.variant}`.localeCompare(`${b.brand} ${b.model} ${b.variant}`, 'ja');

  if (key === 'name') return [...products].sort(byName);

  const known = products.filter((p) => readValue(p) !== null);
  const unknown = products.filter((p) => readValue(p) === null);

  known.sort((a, b) => {
    const diff = (readValue(a) as number) - (readValue(b) as number);
    return diff !== 0 ? diff : byName(a, b);
  });
  unknown.sort(byName);

  return [...known, ...unknown];
}

/** フィルタUIの選択肢を、実際にデータへ存在する値からだけ作る。 */
export function collectSpecOptions(products: Product[], key: string): string[] {
  const values = new Set<string>();
  for (const product of products) {
    const fact = product.specs[key];
    if (fact && typeof fact.value === 'string') values.add(fact.value);
  }
  return [...values].sort((a, b) => a.localeCompare(b, 'ja'));
}

import type { AlternateMeasurement, Fact, Product, SizeMm } from '@/lib/catalog/types';
import { capacityLabel, sizeLabel } from '@/lib/catalog/types';

/** 不明値は必ず「不明」と表示する（0や推定値に置き換えない）。 */
export const UNKNOWN_LABEL = '不明';

export function formatWeight(fact: Fact<number>): string {
  if (fact.value === null) return UNKNOWN_LABEL;
  return fact.value >= 1000
    ? `${(fact.value / 1000).toFixed(2).replace(/\.?0+$/, '')} kg`
    : `${fact.value} g`;
}

export function formatCapacity(fact: Fact<number>): string {
  return fact.value === null ? UNKNOWN_LABEL : `${fact.value} L`;
}

export function formatSize(fact: Fact<SizeMm> | undefined): string {
  if (!fact || fact.value === null) return UNKNOWN_LABEL;
  const [w, h, d] = fact.value;
  return `${w} × ${h} × ${d} mm`;
}

export function formatBoolean(value: boolean): string {
  return value ? 'あり' : 'なし';
}

export function formatSpec(fact: Fact<string | number | boolean> | undefined, unit?: string): string {
  if (!fact || fact.value === null) return UNKNOWN_LABEL;
  if (typeof fact.value === 'boolean') return formatBoolean(fact.value);
  if (typeof fact.value === 'number') return unit ? `${fact.value} ${unit}` : String(fact.value);
  return fact.value;
}

export function formatDate(value: string | null): string {
  if (!value) return UNKNOWN_LABEL;
  const [year, month, day] = value.split('-');
  return `${year}年${Number(month)}月${Number(day)}日`;
}

/** 商品の表示名。ブランド + 型番 + バリエーション。 */
export function productName(product: { brand: string; model: string; variant: string }): string {
  return `${product.brand} ${product.model}（${product.variant}）`;
}

/** 商品の寸法・容量を、条件つきの行に展開する。条件を落とさないための唯一の入口。 */
export type MeasurementRow = { label: string; value: string };

export function measurementRows(product: Product): MeasurementRow[] {
  const rows: MeasurementRow[] = [
    { label: capacityLabel(product.measurementState), value: formatCapacity(product.capacityL) },
    {
      label: sizeLabel(product.sizeBasis, product.measurementState),
      value: formatSize(product.outerSizeMm),
    },
  ];
  if (product.bodySizeMm) {
    rows.push({ label: '本体寸法（本体のみ）', value: formatSize(product.bodySizeMm) });
  }
  for (const measurement of product.alternateMeasurements) {
    rows.push(...alternateRows(measurement));
  }
  return rows;
}

export function alternateRows(measurement: AlternateMeasurement): MeasurementRow[] {
  return [
    { label: `${measurement.label}の容量`, value: formatCapacity(measurement.capacityL) },
    {
      label: sizeLabel(measurement.sizeBasis, measurement.state),
      value: formatSize(measurement.sizeMm),
    },
  ];
}

/**
 * 仕様表の値を読むための共通パーサ。
 *
 * 読めなければ null を返す。**推定しない。**
 * 呼び出し側は null を受けたら unit-unparseable として扱う。
 *
 * 実装計画: docs/superpowers/plans/2026-09-02-travel-goods-automation-foundation.md Task 7・8
 */

/** 「約1,250g」「約360g」「2.9kg」。カンマと「約」を落として読む。 */
export function parseWeightG(raw: string): number | null {
  const text = raw.replace(/,/g, '').replace(/約/g, '').trim();
  const kg = /^([\d.]+)\s*kg$/.exec(text)?.[1];
  if (kg !== undefined) return Math.round(Number(kg) * 1000);
  const g = /^([\d.]+)\s*g$/.exec(text)?.[1];
  if (g !== undefined) return Math.round(Number(g));
  return null;
}

/**
 * 「約W320×D200×H510mm」「W35×H55×D25cm（…）」。
 * **W・H・D のラベルで読む**（並び順に依存しない）。
 * 返す配列は登録データと同じ [幅, 高さ, 奥行]。
 */
export function parseLabeledSizeMm(raw: string): [number, number, number] | null {
  const text = raw.replace(/,/g, '').replace(/約/g, '').trim();
  const unit = /(mm|cm)/.exec(text)?.[1];
  if (unit === undefined) return null;
  const scale = unit === 'cm' ? 10 : 1;

  const pick = (label: 'W' | 'H' | 'D'): number | null => {
    const value = new RegExp(`${label}([\\d.]+)`).exec(text)?.[1];
    return value === undefined ? null : Math.round(Number(value) * scale);
  };
  const w = pick('W');
  const h = pick('H');
  const d = pick('D');
  if (w === null || h === null || d === null) return null;
  return [w, h, d];
}

/** 「約30L」「35L」。 */
export function parseCapacityL(raw: string): number | null {
  const text = raw.replace(/約/g, '').trim();
  const value = /^([\d.]+)\s*L$/.exec(text)?.[1];
  return value === undefined ? null : Number(value);
}

/** 「12000mAh」。 */
export function parseCapacityMah(raw: string): number | null {
  const text = raw.replace(/,/g, '').replace(/約/g, '').trim();
  const value = /^([\d.]+)\s*mAh$/i.exec(text)?.[1];
  return value === undefined ? null : Number(value);
}

/** 「最大65W」。 */
export function parseWatt(raw: string): number | null {
  const text = raw.replace(/最大/g, '').replace(/約/g, '').trim();
  const value = /^([\d.]+)\s*W$/.exec(text)?.[1];
  return value === undefined ? null : Number(value);
}

/** `<dl>` の `<dt>`/`<dd>` を対にして読む。 */
export function definitionRows(html: string, listPattern: RegExp): Map<string, string> | null {
  const list = listPattern.exec(html)?.[0];
  if (list === undefined) return null;
  const rows = new Map<string, string>();
  for (const match of list.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)) {
    const label = match[1];
    const value = match[2];
    if (label === undefined || value === undefined) continue;
    rows.set(label.trim(), value.trim());
  }
  return rows;
}

/** `<table>` の `<th>`/`<td>` を対にして読む。 */
export function tableRows(html: string, tablePattern: RegExp): Map<string, string> | null {
  const table = tablePattern.exec(html)?.[0];
  if (table === undefined) return null;
  const rows = new Map<string, string>();
  for (const match of table.matchAll(/<tr>\s*<th>([\s\S]*?)<\/th>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g)) {
    const label = match[1];
    const value = match[2];
    if (label === undefined || value === undefined) continue;
    rows.set(label.trim(), value.trim());
  }
  return rows;
}

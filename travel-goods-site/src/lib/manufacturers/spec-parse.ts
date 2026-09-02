/**
 * 仕様表の値を読むための共通パーサ。
 *
 * 読めなければ null を返す。**推定しない。**
 * 呼び出し側は null を受けたら unit-unparseable として扱う。
 *
 * 数値は「桁があり、有限で、正」であることを必ず確かめる。
 * `[\d.]+` のような緩い形は `.`・`1.2.3`・`0` を通してしまい、
 * Number() が NaN や 0 を返しても成功扱いになる。fail-closed にならないため使わない。
 *
 * 実装計画: docs/superpowers/plans/2026-09-02-travel-goods-automation-foundation.md Task 7・8
 */

/** 数字の形。整数部が必須で、小数点は 1 つまで。 */
const NUMBER_SOURCE = '\\d+(?:\\.\\d+)?';

/**
 * 厳密な正数パーサ。次をすべて満たすときだけ値を返す。
 *   - 形が \d+(?:\.\d+)? に完全一致する
 *   - Number.isFinite(value)
 *   - value > 0
 */
export function parsePositiveNumber(raw: string): number | null {
  if (!new RegExp(`^${NUMBER_SOURCE}$`).test(raw)) return null;
  return finitePositive(Number(raw));
}

/**
 * 有限かつ正でなければ null。
 *
 * **換算と丸めの後にも必ず通す。** 入力の検査だけでは足りない。
 *   0.0001kg → ×1000 → 0.1 → Math.round → 0
 *   W0.01cm  → ×10   → 0.1 → Math.round → 0
 *   1e307kg  → ×1000 → Infinity
 * いずれも入力は正の有限値だが、結果は使えない値になる。
 */
function finitePositive(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** 「約」「,」を落とし、前後の空白を取る。 */
function clean(raw: string): string {
  return raw.replace(/,/g, '').replace(/約/g, '').trim();
}

/** 単位付きの値を、単位に完全一致させてから厳密パースする。 */
function parseWithUnit(raw: string, unit: string, flags = ''): number | null {
  const match = new RegExp(`^(${NUMBER_SOURCE})\\s*${unit}$`, flags).exec(clean(raw));
  const captured = match?.[1];
  return captured === undefined ? null : parsePositiveNumber(captured);
}

/** 「約1,250g」「2.9kg」。kg は g へ換算する。換算・丸めの後も正で有限であることを確かめる。 */
export function parseWeightG(raw: string): number | null {
  const kg = parseWithUnit(raw, 'kg');
  if (kg !== null) return finitePositive(Math.round(kg * 1000));
  const g = parseWithUnit(raw, 'g');
  if (g !== null) return finitePositive(Math.round(g));
  return null;
}

/**
 * 「約W320×D200×H510mm」「W35×H55×D25cm（…）」。
 * **W・H・D のラベルで読む**（並び順に依存しない）。
 * 返す配列は登録データと同じ [幅, 高さ, 奥行]。
 *
 * 1 要素でも読めなければ寸法全体を null にする。
 * mm と cm が混在した表記は、どちらの尺度か決められないので推定せず null。
 */
export function parseLabeledSizeMm(raw: string): [number, number, number] | null {
  const text = clean(raw);

  const units = [...text.matchAll(/(mm|cm)/g)].map((m) => m[1]);
  const unit = units[0];
  if (unit === undefined) return null;
  // 単位が混在していたら尺度を決められない
  if (units.some((u) => u !== unit)) return null;
  const scale = unit === 'cm' ? 10 : 1;

  const pick = (label: 'W' | 'H' | 'D'): number | null => {
    // ラベルの直後は数字で始まらなければならない（W. や W-35 を通さない）
    const captured = new RegExp(`${label}(${NUMBER_SOURCE})`).exec(text)?.[1];
    if (captured === undefined) return null;
    // 「W1.2.3」のように余分な小数点が続く形を弾く
    if (new RegExp(`${label}${captured.replace('.', '\\.')}\\.`).test(text)) return null;
    const value = parsePositiveNumber(captured);
    // 換算・丸めの後も正で有限であること（0.01cm → 0、巨大値 → Infinity を弾く）
    return value === null ? null : finitePositive(Math.round(value * scale));
  };

  const w = pick('W');
  const h = pick('H');
  const d = pick('D');
  if (w === null || h === null || d === null) return null;
  return [w, h, d];
}

/** 「約30L」「35L」。 */
export function parseCapacityL(raw: string): number | null {
  return parseWithUnit(raw, 'L');
}

/** 「12000mAh」。 */
export function parseCapacityMah(raw: string): number | null {
  return parseWithUnit(raw, 'mAh', 'i');
}

/** 「最大65W」。 */
export function parseWatt(raw: string): number | null {
  return parseWithUnit(raw.replace(/最大/g, ''), 'W');
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

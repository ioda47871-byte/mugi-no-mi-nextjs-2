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
 * 「約W320×D200×H510mm」「W35×H55×D25cm（…）」「W35cm×H55cm×D25cm」。
 *
 * **W・H・D のラベルで読む**（並び順に依存しない）。
 * 返す配列は登録データと同じ [幅, 高さ, 奥行]。
 *
 * 受理するのは次の 2 つだけ。
 *   A. グループ全体の単位が最後のラベルに 1 つ付く（`W35×H55×D25cm`）
 *   B. 3 要素すべてに同じ単位が直接付く（`W35cm×H55cm×D25cm`）
 *
 * 次はすべて null に倒す。
 *   - `in` `kg` `m` `cm2` など未対応・不明な単位が付く
 *   - 一部だけに単位が付き、それがグループ末尾ではない（`W35cm×H55×D25`）
 *   - `mm` と `cm` の混在
 *   - 単位が 1 つも無い（`W35×H55×D25（梱包サイズは80cm）` の 80cm を借りない）
 *   - 同じラベルが複数（寸法セットが複数あって組を決められない）
 *   - 範囲表記や余分な小数点が続く（`W35〜40` `W1.2.3`）
 */
export function parseLabeledSizeMm(raw: string): [number, number, number] | null {
  const text = clean(raw);

  type Picked = { value: number; unit: 'mm' | 'cm' | null; at: number };

  /**
   * ラベルの直後の数値と、その数値に直接続く単位を取り出す。
   * ラベルが複数回現れたら曖昧なので null。
   */
  const pick = (label: 'W' | 'H' | 'D'): Picked | null => {
    // 数値の直後に続く英数字の連なりをそのまま捕まえ、単位として妥当かを別に判定する
    const matches = [...text.matchAll(new RegExp(`${label}(${NUMBER_SOURCE})([0-9A-Za-z]*)`, 'g'))];
    if (matches.length !== 1) return null; // 0 件＝無い、2 件以上＝曖昧
    const match = matches[0];
    if (match === undefined) return null;
    const captured = match[1];
    const suffix = match[2] ?? '';
    if (captured === undefined) return null;

    // 単位は mm / cm のみ。in・kg・cm2・mmX などは不明な単位として拒否する
    let unit: 'mm' | 'cm' | null;
    if (suffix === '') unit = null;
    else if (suffix === 'mm' || suffix === 'cm') unit = suffix;
    else return null;

    // 範囲表記や余分な小数点が続く形を拒否する（W35〜40、W1.2.3）
    const rest = text.slice(match.index + match[0].length);
    if (/^[.〜～~\u2010-\u2015-]/.test(rest)) return null;

    const value = parsePositiveNumber(captured);
    if (value === null) return null;
    return { value, unit, at: match.index };
  };

  const w = pick('W');
  const h = pick('H');
  const d = pick('D');
  if (w === null || h === null || d === null) return null;

  const picked = [w, h, d];
  const withUnit = picked.filter((p) => p.unit !== null);

  let unit: 'mm' | 'cm';
  if (withUnit.length === 3) {
    // B: 3 要素すべてに単位。混在は拒否する
    const first = withUnit[0]?.unit;
    if (first === undefined || first === null) return null;
    if (withUnit.some((p) => p.unit !== first)) return null;
    unit = first;
  } else if (withUnit.length === 1) {
    // A: グループ末尾のラベルにだけ単位が付く形だけを認める
    const only = withUnit[0];
    if (only === undefined || only.unit === null) return null;
    const lastAt = Math.max(...picked.map((p) => p.at));
    if (only.at !== lastAt) return null;
    unit = only.unit;
  } else {
    // 0 件＝単位なし、2 件＝部分的にしか付いていない
    return null;
  }

  const scale = unit === 'cm' ? 10 : 1;
  // 換算・丸めの後も正で有限であること（0.01cm → 0、巨大値 → Infinity を弾く）
  const toMm = (value: number): number | null => finitePositive(Math.round(value * scale));
  const mmW = toMm(w.value);
  const mmH = toMm(h.value);
  const mmD = toMm(d.value);
  if (mmW === null || mmH === null || mmD === null) return null;
  return [mmW, mmH, mmD];
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

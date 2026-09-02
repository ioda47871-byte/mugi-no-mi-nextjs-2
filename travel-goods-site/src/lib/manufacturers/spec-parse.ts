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
 * ラベルを 1 つずつ拾うのではなく、**受理できる寸法表記の全体を文法として検証する**。
 * 個別に拾うと、数値の直後にある未対応の文字（`インチ` `センチ` `㎝` `"` など）を
 * 読み飛ばして「単位なし」と誤判定し、離れた場所の `cm` を全要素へ適用してしまう。
 *
 * 受理するのは次の 2 形式だけ。
 *   A. グループ全体の単位が最後に 1 つ付く（`W35×H55×D25cm`）
 *   B. 3 要素すべてに同じ単位が直接付く（`W35cm×H55cm×D25cm`）
 *
 * 次はすべて null に倒す。
 *   - 数値の直後が区切り（`×`）・単位（`mm`/`cm`）・終端以外
 *     （`in` `kg` `インチ` `センチ` `㎝` `"` `%` など未対応・不明な単位を含む）
 *   - 一部だけに単位が付き、それがグループ末尾ではない（`W35cm×H55×D25`）
 *   - `mm` と `cm` の混在
 *   - 単位が 1 つも無い（`W35×H55×D25（梱包サイズは80cm）` の 80cm を借りない）
 *   - 単位の直後に英数字が続く（`cm2` `mmX`）
 *   - W/H/D の組が 1 つでない（寸法セットが複数、ラベル欠落、範囲表記）
 */
const SIZE_LABEL = '[WHD]';
const SIZE_SEPARATOR = '\\s*[×xX]\\s*';
const SIZE_UNIT = '(mm|cm)';
/** 単位の直後に英数字が続く形（cm2・mmX）を拒否する。 */
const SIZE_TAIL = '(?![0-9A-Za-z])';

/** A: 末尾に単位が 1 つ。 */
const SIZE_TRAILING_UNIT = new RegExp(
  `(${SIZE_LABEL})(${NUMBER_SOURCE})${SIZE_SEPARATOR}` +
    `(${SIZE_LABEL})(${NUMBER_SOURCE})${SIZE_SEPARATOR}` +
    `(${SIZE_LABEL})(${NUMBER_SOURCE})\\s*${SIZE_UNIT}${SIZE_TAIL}`,
);

/** B: 3 要素すべてに単位。 */
const SIZE_EACH_UNIT = new RegExp(
  `(${SIZE_LABEL})(${NUMBER_SOURCE})\\s*${SIZE_UNIT}${SIZE_TAIL}${SIZE_SEPARATOR}` +
    `(${SIZE_LABEL})(${NUMBER_SOURCE})\\s*${SIZE_UNIT}${SIZE_TAIL}${SIZE_SEPARATOR}` +
    `(${SIZE_LABEL})(${NUMBER_SOURCE})\\s*${SIZE_UNIT}${SIZE_TAIL}`,
);

/** 文字列中の「ラベル＋数字」の出現数。3 でなければ組を決められない。 */
const SIZE_LABEL_OCCURRENCE = /[WHD]\d/g;

export function parseLabeledSizeMm(raw: string): [number, number, number] | null {
  const text = clean(raw);

  // 寸法セットが複数ある、ラベルが欠けている、といった曖昧な入力を先に落とす
  if ([...text.matchAll(SIZE_LABEL_OCCURRENCE)].length !== 3) return null;

  const parsed = matchTrailingUnit(text) ?? matchEachUnit(text);
  if (parsed === null) return null;

  const { entries, unit } = parsed;
  // ラベルは W・H・D がちょうど 1 つずつ
  const labels = entries.map((entry) => entry.label);
  if (new Set(labels).size !== 3) return null;

  const scale = unit === 'cm' ? 10 : 1;
  const byLabel = new Map<string, number>();
  for (const entry of entries) {
    const value = parsePositiveNumber(entry.raw);
    if (value === null) return null;
    // 換算・丸めの後も正で有限であること（0.01cm → 0、巨大値 → Infinity を弾く）
    const mm = finitePositive(Math.round(value * scale));
    if (mm === null) return null;
    byLabel.set(entry.label, mm);
  }

  const w = byLabel.get('W');
  const h = byLabel.get('H');
  const d = byLabel.get('D');
  if (w === undefined || h === undefined || d === undefined) return null;
  return [w, h, d];
}

type SizeEntry = { label: string; raw: string };
type SizeMatch = { entries: SizeEntry[]; unit: 'mm' | 'cm' };

function asUnit(value: string | undefined): 'mm' | 'cm' | null {
  return value === 'mm' || value === 'cm' ? value : null;
}

function matchTrailingUnit(text: string): SizeMatch | null {
  const m = SIZE_TRAILING_UNIT.exec(text);
  if (m === null) return null;
  const [, l1, n1, l2, n2, l3, n3, rawUnit] = m;
  const unit = asUnit(rawUnit);
  if (
    l1 === undefined || n1 === undefined || l2 === undefined || n2 === undefined ||
    l3 === undefined || n3 === undefined || unit === null
  ) {
    return null;
  }
  return {
    entries: [
      { label: l1, raw: n1 },
      { label: l2, raw: n2 },
      { label: l3, raw: n3 },
    ],
    unit,
  };
}

function matchEachUnit(text: string): SizeMatch | null {
  const m = SIZE_EACH_UNIT.exec(text);
  if (m === null) return null;
  const [, l1, n1, u1, l2, n2, u2, l3, n3, u3] = m;
  const unit = asUnit(u1);
  if (
    l1 === undefined || n1 === undefined || l2 === undefined || n2 === undefined ||
    l3 === undefined || n3 === undefined || unit === null
  ) {
    return null;
  }
  // 単位が混在していたら尺度を決められない
  if (asUnit(u2) !== unit || asUnit(u3) !== unit) return null;
  return {
    entries: [
      { label: l1, raw: n1 },
      { label: l2, raw: n2 },
      { label: l3, raw: n3 },
    ],
    unit,
  };
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

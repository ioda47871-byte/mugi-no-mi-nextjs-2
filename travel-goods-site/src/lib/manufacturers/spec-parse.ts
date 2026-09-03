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

/**
 * 入力を検証してから正規化する。**不正表記を削除してから解析しない。**
 *
 * 落とすだけの実装（`replace(/約/g,'')` `replace(/,/g,'')`）は、
 * 壊れた表記を正常値へ「直して」しまう。
 *   `3約0L`     → 30L   （書いていない値を作る）
 *   `1,2,5,0g`  → 1250g （区切りとして成立していない）
 * そこで、許可された文法（先頭の「約」と 3 桁区切りのカンマ）だけを認め、
 * それ以外は null を返して呼び出し側で unit-unparseable に倒す。
 */
function clean(raw: string): string | null {
  let text = raw.trim();

  // 「約」は入力全体の先頭に 1 つだけ許可する
  if (text.startsWith('約')) text = text.slice(1).trim();
  if (text.includes('約')) return null;

  // カンマは 3 桁区切りとしてのみ許可する。
  //
  // **数値は「整数部・小数点・小数部」を含む全体を 1 つの文法として検査する。**
  // 走査を `[\d,]+` にすると小数点で数値が分断され、`1.2,345` が
  // `1` と `2,345` の 2 つの正しい数値に見えてしまう。カンマを落とした
  // `1.2345` は元の入力に無い値であり、丸めれば 1 になって成功扱いになる。
  // 走査に `.` を含め、小数部のカンマを必ず拒否する。
  //   許可: 1250 / 1250.5 / 1,250 / 1,250.5 / 1,000,000
  //   拒否: 1.2,345 / 12.3,000 / 12,000.0,001 / 1,2,5,0 / 12,50
  for (const match of text.matchAll(/[\d.,]+/g)) {
    const run = match[0];
    if (!run.includes(',')) continue;
    if (!/^\d{1,3}(?:,\d{3})*(?:\.\d+)?$/.test(run)) return null;
  }
  return text.replace(/,/g, '');
}

/**
 * 単位付きの値の読み取り。
 *
 * `prefix`（`最大` など）は**入力全体の先頭に 1 回だけ**認める接頭辞として扱う。
 * `replace(/最大/g,'')` のような全置換は、壊れた表記を正常値へ「直して」しまう。
 *   `6最大5W`      → 65W  （書いていない値を作る）
 *   `最大最大65W`  → 65W  （重複を黙って許す）
 *   `65W最大`      → 65W  （後置の語を無視する）
 * 「約」と同じ規則で、先頭の 1 回だけ剥がし、残りに現れたら null に倒す。
 */
type UnitOptions = { flags?: string; prefix?: string };

function stripLeadingPrefix(text: string, prefix: string | undefined): string | null {
  if (prefix === undefined) return text;
  const stripped = text.startsWith(prefix) ? text.slice(prefix.length).trim() : text;
  return stripped.includes(prefix) ? null : stripped;
}

function parseWithUnit(raw: string, unit: string, options: UnitOptions = {}): number | null {
  const cleaned = clean(raw);
  if (cleaned === null) return null;
  const text = stripLeadingPrefix(cleaned, options.prefix);
  if (text === null) return null;
  const match = new RegExp(`^(${NUMBER_SOURCE})\\s*${unit}$`, options.flags ?? '').exec(text);
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
/**
 * 寸法表記の直後に置いてよい文字。
 *
 * 終端・空白・注記の開始記号だけを認める。
 * `(?![0-9A-Za-z])` だけでは Unicode の単位記号や日本語が通ってしまい、
 * `cm²` `cmセンチ` `cm㎝` を受理してしまう。
 *
 * `/` `、` `,` `。` は注記の開始として認めない。`cm/㎝` `cm、mm` `cm。mm` のように
 * 区切りの後へ別の単位や寸法が続く表記は、注記ではなく曖昧・混在であり、
 * 先頭側だけを採用すると書かれていない解釈を選んでしまう。曖昧なら null に倒す。
 *
 * ここを通っただけでは足りない。境界は 1 文字しか見ないので、
 * `W35×H55×D25cm mm` のように空白の後へ単位が続く形を止められない。
 * **寸法表記の後ろに残った文字列も `SIZE_NOTE` で必ず検証する。**
 */
const SIZE_END = '(?=$|[\\s（(［\\[【※])';

/**
 * 寸法表記の後ろに残ってよい文字列。
 *
 * 認めるのは「空白」「**入れ子を含まない**対応の取れた括弧の注記」「`※` で始まる注記」だけ。
 * 括弧の中身は注記なので読まない（`（梱包サイズは80cm）` の 80cm を借りない）。
 * 入れ子の括弧（`（外寸（実測）80cm）`）は対応が取れていないものとして拒否する。
 * 入れ子まで読む必要は今のところ無く、曖昧なら null に倒す方が安全なため。
 * それ以外が残っていれば、単位・数値・別寸法の可能性があるので曖昧として null に倒す。
 *   `cm mm` `cm ㎝` `cm インチ` `cm 25cm` はここで落ちる。
 */
const SIZE_NOTE =
  /^(?:\s|（[^（）]*）|\([^()]*\)|［[^［］]*］|\[[^\[\]]*\]|【[^【】]*】)*(?:※[\s\S]*)?$/;

/** A: 末尾に単位が 1 つ。 */
const SIZE_TRAILING_UNIT = new RegExp(
  `(${SIZE_LABEL})(${NUMBER_SOURCE})${SIZE_SEPARATOR}` +
    `(${SIZE_LABEL})(${NUMBER_SOURCE})${SIZE_SEPARATOR}` +
    `(${SIZE_LABEL})(${NUMBER_SOURCE})\\s*${SIZE_UNIT}${SIZE_END}`,
);

/**
 * B: 3 要素すべてに単位。
 * 途中の単位の直後は区切り（`×`）でなければならず、`SIZE_SEPARATOR` がそれを強制する。
 * `cm²×` や `cmセンチ×` はここで一致しない。末尾だけ `SIZE_END` で閉じる。
 */
const SIZE_EACH_UNIT = new RegExp(
  `(${SIZE_LABEL})(${NUMBER_SOURCE})\\s*${SIZE_UNIT}${SIZE_SEPARATOR}` +
    `(${SIZE_LABEL})(${NUMBER_SOURCE})\\s*${SIZE_UNIT}${SIZE_SEPARATOR}` +
    `(${SIZE_LABEL})(${NUMBER_SOURCE})\\s*${SIZE_UNIT}${SIZE_END}`,
);

/** 文字列中の「ラベル＋数字」の出現数。3 でなければ組を決められない。 */
const SIZE_LABEL_OCCURRENCE = /[WHD]\d/g;

export function parseLabeledSizeMm(raw: string): [number, number, number] | null {
  const text = clean(raw);
  if (text === null) return null;

  // 寸法セットが複数ある、ラベルが欠けている、といった曖昧な入力を先に落とす
  if ([...text.matchAll(SIZE_LABEL_OCCURRENCE)].length !== 3) return null;

  const parsed = matchTrailingUnit(text) ?? matchEachUnit(text);
  if (parsed === null) return null;

  const { entries, unit } = parsed;
  // 寸法表記の後ろに、注記として認められない文字列が残っていれば曖昧
  if (!SIZE_NOTE.test(parsed.rest)) return null;
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
type SizeMatch = { entries: SizeEntry[]; unit: 'mm' | 'cm'; rest: string };

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
    rest: text.slice(m.index + m[0].length),
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
    rest: text.slice(m.index + m[0].length),
  };
}

/** 「約30L」「35L」。 */
export function parseCapacityL(raw: string): number | null {
  return parseWithUnit(raw, 'L');
}

/** 「12000mAh」。 */
export function parseCapacityMah(raw: string): number | null {
  return parseWithUnit(raw, 'mAh', { flags: 'i' });
}

/** 「最大65W」「65W」。「最大」は先頭に 1 回だけ。 */
export function parseWatt(raw: string): number | null {
  return parseWithUnit(raw, 'W', { prefix: '最大' });
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

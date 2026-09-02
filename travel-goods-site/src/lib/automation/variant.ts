/**
 * variant（色・サイズ・容量・セット数）の抽出と、販売ページ文言との照合。
 *
 * 目的は「一致を増やすこと」ではなく「取り違えたリンクを書かせないこと」。
 * 取り出せなければ空配列にし、矛盾があれば一致にしない。
 * matched が false なら matchedVariantLabel は null になり、
 * 呼び出し側は販売先リンクを書けない（設計書 5.6）。
 *
 * 実装計画: docs/superpowers/plans/2026-09-02-travel-goods-automation-foundation.md Task 5
 * 設計書 5.5 条件4・5、5.6、8.4 に対応する。
 */
import { normalizeForMatch } from '@/lib/rakuten/match';

export type VariantTokens = {
  colors: string[];
  sizes: string[];
  capacities: string[];
  setCounts: string[];
};

export type VariantVerdict = {
  matched: boolean;
  /** variant にあるが販売ページ文言に出てこなかったトークン。 */
  missing: string[];
  /** 販売ページ文言に出てくる、対象と異なる容量・サイズ・セット数。 */
  conflicting: string[];
  matchedVariantLabel: string | null;
};

/**
 * 現行 23 商品の variant に実在する色名を基にした辞書。
 * 長い名前を先に並べ、「ブラックヘアライン」を「ブラック」に縮めない。
 * 辞書に無い色は推測しない（空配列のままにする）。
 */
const COLOR_NAMES: readonly string[] = [
  'ターコイズカーボン',
  'ブラックヘアライン',
  'ダークネイビー',
  'ガンメタリック',
  'ブルーグリーン',
  'ターコイズ',
  'シルバー',
  'ネイビー',
  'ホワイト',
  'ブラック',
].slice();

/** 中古・訳あり等。1 つでも出てきたら候補にしない（設計書 8.4）。 */
export const EXCLUDED_LISTING_TERMS: readonly string[] = [
  '中古',
  '訳あり',
  '並行輸入',
  'まとめ買い',
  'セット販売',
  'アウトレット',
];

/**
 * variant 用の正規化。**意味を保つ。**
 *
 * `normalizeForMatch` は `.` と `/` を削除するため、容量の意味が変わってしまう。
 *   30.5L → 305L（別の容量になる）
 *   18/24L → 1824L（拡張容量の区切りが消える）
 * そこで全角→半角と大文字化だけを行い、小数点と区切りは残す正規化をここに置く。
 * 対象と販売ページの両方を同じ経路に通してからトークン化する。
 */
function normalizeVariantText(value: string): string {
  return value
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/／/g, '/')
    .replace(/．/g, '.')
    .toUpperCase();
}

/**
 * 容量・mAh・セット数・サイズの**唯一の字句解析**。
 *
 * 抽出と「解析できなかった箇所の検出」で別々の正規表現を持たない。
 * 左から 1 回だけ走査し、読めたトークンと解析状態を同時に返す。
 * 呼び出し側は target・listing の**両方**でこの結果を評価する。
 *
 * 解析状態は 3 つを区別する。
 *   - `absent`:    その種類の表記が元から無い（色だけの variant など）
 *   - `valid`:     厳密な文法で解析できた
 *   - `malformed`: 単位・容量・セット数らしい表記があるのに解析できない
 * 「抽出対象ではない」と「不正な構造化表記」を混同しないための区別で、
 * `malformed` は色が一致していても variant 全体を不一致にする。
 *
 * 走査の規則:
 *   1. サイズ（`2XL|XL|S|M|L` ＋ `サイズ`）を先に読む。前が ASCII 英数字なら
 *      独立したサイズではないので採らない（`LLサイズ` `XSサイズ` `2Mサイズ`）。
 *   2. 単位（`L` / `MAH` / `個セット`）を見つけたら、その直前の連なりを 2 通りに測る。
 *      - **region**: ASCII 英数字を含む広い連なり。数字が 1 つも無ければ、
 *        単位に見える文字は別の語の一部（`BLACK` の `L`）なので候補にしない。
 *      - **number**: 数字と区切り・演算記号だけの連なり。ここから数値を取り出す。
 *   3. 数値の直前、または単位の直後が ASCII 英数字なら **malformed**。
 *      `A30L` `30L2` `500ML` は型番や別単位の一部であって容量ではない。
 *   4. 取り出した数値**全体**を単位ごとの文法で検査する。一部分だけを採らない。
 *      `18 / / 24L` から `24L` を、`30＋5L` から `5L` を切り出さない。
 *
 * 連なりの探索は直前に読み終えた位置（`consumedEnd`）より前へは戻らない。
 * これにより `30L / 40L` の 2 つ目が 1 つ目を巻き込まない。
 */

/** 数値の連なりを構成しうる文字。数字・小数点・区切り・演算/範囲記号。 */
const NUMBER_CHAR = /[0-9.,\s/+＋\-−–—~〜～ーから]/;
/**
 * NUMBER_CHAR に ASCII 英字を加えたもの。「構造化表記らしさ」だけを見る。
 * ここに数字が無ければ、単位に見える文字は語の一部であって単位ではない。
 */
const REGION_CHAR = /[0-9A-Za-z.,\s/+＋\-−–—~〜～ーから]/;
const ASCII_ALNUM = /[0-9A-Za-z]/;
const DIGIT = /[0-9]/;

/** 容量(L)。`18/24` のような拡張表記だけを許す。 */
const VALID_CAPACITY_L = /^\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)*$/;
/** mAh。区切りは許さない。 */
const VALID_CAPACITY_MAH = /^\d+(?:\.\d+)?$/;
/** セット数。小数も区切りも許さない。 */
const VALID_SET_COUNT = /^\d+$/;

/** 長いものから見る。`2XL` を `XL` に縮めない。 */
const SIZE_LABELS: readonly string[] = ['2XL', 'XL', 'S', 'M', 'L'];
const SIZE_SUFFIX = 'サイズ';

type UnitKind = 'capacityL' | 'capacityMah' | 'setCount';
/** 正規化後（大文字化後）の綴りで持つ。 */
const UNITS: readonly { text: string; kind: UnitKind }[] = [
  { text: 'MAH', kind: 'capacityMah' },
  { text: '個セット', kind: 'setCount' },
  { text: 'L', kind: 'capacityL' },
];

export type VariantPresence = 'absent' | 'valid' | 'malformed';

type StructuredScan = {
  sizes: string[];
  capacities: string[];
  setCounts: string[];
  presence: VariantPresence;
};

/** 文字が undefined（文字列の端）なら常に false。端は境界として扱う。 */
function charIs(pattern: RegExp, char: string | undefined): boolean {
  return char !== undefined && pattern.test(char);
}

function sizeLabelAt(text: string, index: number): string | null {
  for (const label of SIZE_LABELS) {
    if (text.startsWith(`${label}${SIZE_SUFFIX}`, index)) return label;
  }
  return null;
}

function unitAt(text: string, index: number): { text: string; kind: UnitKind } | null {
  for (const unit of UNITS) {
    if (text.startsWith(unit.text, index)) return unit;
  }
  return null;
}

function isValidNumber(kind: UnitKind, numberPart: string): boolean {
  if (kind === 'capacityL') return VALID_CAPACITY_L.test(numberPart);
  if (kind === 'capacityMah') return VALID_CAPACITY_MAH.test(numberPart);
  return VALID_SET_COUNT.test(numberPart);
}

function scanStructured(text: string): StructuredScan {
  const sizes: string[] = [];
  const capacities: string[] = [];
  const setCounts: string[] = [];
  let malformed = false;
  // 直前に読み終えた位置。連なりの探索はここより前へ戻らない。
  let consumedEnd = 0;
  let index = 0;

  while (index < text.length) {
    const label = sizeLabelAt(text, index);
    if (label !== null && !charIs(ASCII_ALNUM, text[index - 1])) {
      sizes.push(`${label}${SIZE_SUFFIX}`);
      index += label.length + SIZE_SUFFIX.length;
      consumedEnd = index;
      continue;
    }

    const unit = unitAt(text, index);
    if (unit === null) {
      index += 1;
      continue;
    }
    const unitEnd = index + unit.text.length;

    let regionStart = index;
    while (regionStart > consumedEnd && charIs(REGION_CHAR, text[regionStart - 1])) regionStart -= 1;
    if (!DIGIT.test(text.slice(regionStart, index))) {
      // 数字が無い。単位に見える文字は別の語の一部（`BLACK` の `L`）。
      index = unitEnd;
      consumedEnd = unitEnd;
      continue;
    }

    let numberStart = index;
    while (numberStart > consumedEnd && charIs(NUMBER_CHAR, text[numberStart - 1])) numberStart -= 1;
    // 先頭の区切り（`商品名 - 30L` の `- `）は数値の一部ではない
    while (numberStart < index && !charIs(DIGIT, text[numberStart])) numberStart += 1;

    const numberPart = text.slice(numberStart, index).trim();
    const attachedBefore = charIs(ASCII_ALNUM, text[numberStart - 1]);
    const attachedAfter = charIs(ASCII_ALNUM, text[unitEnd]);

    if (numberPart === '' || attachedBefore || attachedAfter || !isValidNumber(unit.kind, numberPart)) {
      malformed = true;
    } else if (unit.kind === 'capacityL') {
      // 「18/24L」は 18L と 24L の 2 つに分ける
      for (const part of numberPart.split('/')) capacities.push(`${part.trim()}L`);
    } else if (unit.kind === 'capacityMah') {
      capacities.push(`${numberPart}mAh`);
    } else {
      setCounts.push(`${numberPart}個セット`);
    }

    index = unitEnd;
    consumedEnd = unitEnd;
  }

  const found = sizes.length + capacities.length + setCounts.length;
  const presence: VariantPresence = malformed ? 'malformed' : found > 0 ? 'valid' : 'absent';
  return {
    sizes: uniq(sizes),
    capacities: uniq(capacities),
    setCounts: uniq(setCounts),
    presence,
  };
}

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * 色名の前後がカタカナなら、より長い語の一部なので色として拾わない。
 *
 * 辞書の色名はすべてカタカナなので、境界として見るべきはカタカナだけでよい。
 * 「ブラックフライデー」「ホワイトニング」「ミッドナイトネイビー」はここで落ちる。
 * 中黒（・, U+30FB）は語の区切りとして使われるため、境界として扱う。
 * 空白・記号・ひらがな・漢字・英数字・文字列の端はすべて境界。
 *
 * 判定できない書き方は一致させない（false-negative 側へ倒す）。
 */
function isColorBoundary(char: string | undefined): boolean {
  if (char === undefined) return true; // 文字列の端
  return !/[\u30A1-\u30FA\u30FC-\u30FF]/.test(char);
}

/**
 * 長い色名から順に、境界で区切られた出現だけを取り出して消し込む。
 * 「ブラックヘアライン」を先に取り除くので「ブラック」を二重に拾わないし、
 * 販売ページ側に同じ規則を使えば「ブラック」で「ブラックヘアライン」に一致しない。
 */
function colorsIn(text: string): string[] {
  const colors: string[] = [];
  let remaining = text;
  for (const color of COLOR_NAMES) {
    let index = remaining.indexOf(color);
    while (index !== -1) {
      const before = remaining[index - 1];
      const after = remaining[index + color.length];
      if (isColorBoundary(before) && isColorBoundary(after)) {
        colors.push(color);
        // 消し込んだ跡は境界文字にして、短い色名を二重に拾わせない
        remaining =
          remaining.slice(0, index) + ' '.repeat(color.length) + remaining.slice(index + color.length);
        break;
      }
      index = remaining.indexOf(color, index + 1);
    }
  }
  return uniq(colors);
}

/**
 * variant 文字列を 1 回だけ走査した結果。
 *
 * `presence` は構造化表記（サイズ・容量・セット数）の解析状態で、
 * target 側と listing 側の**どちらも** `malformed` でないことを一致の条件にする。
 */
export type VariantScan = VariantTokens & { presence: VariantPresence };

export function scanVariant(text: string): VariantScan {
  // 色は表記ゆれを潰すと辞書に当たらなくなるので生文字列から取り出す。
  // それ以外は意味を保つ正規化を通してから取り出す（全角で境界を迂回させない）。
  const structured = scanStructured(normalizeVariantText(text));
  return {
    colors: colorsIn(text),
    sizes: structured.sizes,
    capacities: structured.capacities,
    setCounts: structured.setCounts,
    presence: structured.presence,
  };
}

export function extractVariantTokens(variant: string): VariantTokens {
  const { colors, sizes, capacities, setCounts } = scanVariant(variant);
  return { colors, sizes, capacities, setCounts };
}

/** 表示用ラベルの並び。現行データの variant 表記に合わせる。 */
function labelOf(tokens: VariantTokens): string {
  return [...tokens.sizes, ...tokens.capacities, ...tokens.colors, ...tokens.setCounts].join(' / ');
}

export function verifyVariant(variant: string, listingText: string): VariantVerdict {
  // target・listing とも走査は 1 回だけ。結果を共有して評価する。
  const target = scanVariant(variant);
  const listing = scanVariant(listingText);
  const all = [...target.sizes, ...target.capacities, ...target.colors, ...target.setCounts];
  // 販売ページ側も対象と**同じトークン化経路**を通してから突き合わせる。
  // substring で照合すると「ブラック」が「ブラックヘアライン」に、
  // 「Lサイズ」が「LLサイズ」に一致してしまう。
  //
  // サイズ・容量・セット数のトークンは canonical 表現（30.5L / 2XLサイズ / 3個セット）に
  // 揃うので、そのまま文字列として比較する。ここで normalizeForMatch を通すと
  // 30.5L が 305L になり、意味の違う容量を同一視してしまう。
  const listingColors = new Set(listing.colors.map(normalizeForMatch));
  const listingSizes = new Set(listing.sizes);
  const listingCapacities = new Set(listing.capacities);
  const listingSetCounts = new Set(listing.setCounts);

  const notIn = (found: ReadonlySet<string>) => (token: string) => !found.has(token);

  const missing = [
    ...target.sizes.filter(notIn(listingSizes)),
    ...target.capacities.filter(notIn(listingCapacities)),
    // 色だけは表記ゆれを潰した形で突き合わせる（ダークネイビー → ダクネイビ）
    ...target.colors.filter((token) => !listingColors.has(normalizeForMatch(token))),
    ...target.setCounts.filter(notIn(listingSetCounts)),
  ];

  // 販売ページ側に現れる、対象と異なる色・容量・サイズ・セット数
  const ownColors = new Set(target.colors.map(normalizeForMatch));
  const ownCapacities = new Set(target.capacities);
  const ownSizes = new Set(target.sizes);
  const ownSetCounts = new Set(target.setCounts);
  const conflicting = [
    ...listing.colors.filter((v) => !ownColors.has(normalizeForMatch(v))),
    ...listing.capacities.filter((v) => !ownCapacities.has(v)),
    ...listing.sizes.filter((v) => !ownSizes.has(v)),
    ...listing.setCounts.filter((v) => !ownSetCounts.has(v)),
  ];

  // 一致にしてよいのは次をすべて満たすときだけ。
  //   - target に解析不能な構造化表記が無い
  //   - listing にも解析不能な構造化表記が無い
  //   - 必須トークンがすべて一致する
  //   - 販売ページ側に矛盾する表記が無い
  //   - 有効な variant トークンが少なくとも 1 つある（空 variant で通さない）
  const matched =
    all.length > 0 &&
    missing.length === 0 &&
    conflicting.length === 0 &&
    target.presence !== 'malformed' &&
    listing.presence !== 'malformed';

  return {
    matched,
    missing,
    conflicting,
    matchedVariantLabel: matched ? labelOf(target) : null,
  };
}

export function hasExcludedTerm(listingText: string): boolean {
  return EXCLUDED_LISTING_TERMS.some((term) => listingText.includes(term));
}

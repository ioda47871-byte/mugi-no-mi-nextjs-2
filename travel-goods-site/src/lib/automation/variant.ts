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

/** 「18/24L」のように / でつながった容量も 1 つずつに分ける。 */
const CAPACITY_L_RE = /(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)*)\s*L(?![a-zA-Z])/g;
/** モバイルバッテリーの容量。 */
const CAPACITY_MAH_RE = /(\d+(?:\.\d+)?)\s*mAh/gi;
/**
 * S/M/L/XL/2XL のサイズ表記。長いものを先に見る。
 *
 * 前が英数字なら独立したサイズ表記ではないので拾わない。
 * `(?<![0-9A-Za-z])` により `LLサイズ`・`XSサイズ`・`2Mサイズ`・`SLサイズ` を弾く
 * （`2XL` は選択肢の先頭に置いてあるので `2XLサイズ` としてまとまって一致する）。
 * 後ろは必ず「サイズ」なので、英数字が続く心配はない。
 */
const SIZE_RE = /(?<![0-9A-Za-z])(2XL|XL|S|M|L)サイズ/g;
const SET_COUNT_RE = /(\d+)個セット/g;

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}

/** 1 つ目のキャプチャだけを取り出す。取れなければその一致は捨てる（推測しない）。 */
function captures(text: string, pattern: RegExp): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(pattern)) {
    const captured = match[1];
    if (captured !== undefined) found.push(captured);
  }
  return found;
}

function capacitiesIn(text: string): string[] {
  const found: string[] = [];
  for (const group of captures(text, CAPACITY_L_RE)) {
    // 「18/24L」は 18L と 24L の 2 つに分ける
    for (const part of group.split('/')) {
      found.push(`${part.trim()}L`);
    }
  }
  for (const value of captures(text, CAPACITY_MAH_RE)) {
    found.push(`${value}mAh`);
  }
  return uniq(found);
}

function sizesIn(text: string): string[] {
  return uniq(captures(text, SIZE_RE).map((value) => `${value}サイズ`));
}

function setCountsIn(text: string): string[] {
  return uniq(captures(text, SET_COUNT_RE).map((value) => `${value}個セット`));
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

export function extractVariantTokens(variant: string): VariantTokens {
  // 色は表記ゆれを潰すと辞書に当たらなくなるので生文字列から取り出す。
  // それ以外は意味を保つ正規化を通してから取り出す（全角で境界を迂回させない）。
  const normalized = normalizeVariantText(variant);
  return {
    colors: colorsIn(variant),
    sizes: sizesIn(normalized),
    capacities: capacitiesIn(normalized),
    setCounts: setCountsIn(normalized),
  };
}

/** 表示用ラベルの並び。現行データの variant 表記に合わせる。 */
function labelOf(tokens: VariantTokens): string {
  return [...tokens.sizes, ...tokens.capacities, ...tokens.colors, ...tokens.setCounts].join(' / ');
}

export function verifyVariant(variant: string, listingText: string): VariantVerdict {
  const tokens = extractVariantTokens(variant);
  const all = [...tokens.sizes, ...tokens.capacities, ...tokens.colors, ...tokens.setCounts];
  // 販売ページ側も対象と**同じトークン化経路**を通してから突き合わせる。
  // substring で照合すると「ブラック」が「ブラックヘアライン」に、
  // 「Lサイズ」が「LLサイズ」に一致してしまう。
  //
  // サイズ・容量・セット数のトークンは canonical 表現（30.5L / 2XLサイズ / 3個セット）に
  // 揃うので、そのまま文字列として比較する。ここで normalizeForMatch を通すと
  // 30.5L が 305L になり、意味の違う容量を同一視してしまう。
  const normalizedListing = normalizeVariantText(listingText);
  const listingColors = new Set(colorsIn(listingText).map(normalizeForMatch));
  const listingSizes = new Set(sizesIn(normalizedListing));
  const listingCapacities = new Set(capacitiesIn(normalizedListing));
  const listingSetCounts = new Set(setCountsIn(normalizedListing));

  const notIn = (found: ReadonlySet<string>) => (token: string) => !found.has(token);

  const missing = [
    ...tokens.sizes.filter(notIn(listingSizes)),
    ...tokens.capacities.filter(notIn(listingCapacities)),
    // 色だけは表記ゆれを潰した形で突き合わせる（ダークネイビー → ダクネイビ）
    ...tokens.colors.filter((token) => !listingColors.has(normalizeForMatch(token))),
    ...tokens.setCounts.filter(notIn(listingSetCounts)),
  ];

  // 販売ページ側に現れる、対象と異なる色・容量・サイズ・セット数
  const ownColors = new Set(tokens.colors.map(normalizeForMatch));
  const ownCapacities = new Set(tokens.capacities);
  const ownSizes = new Set(tokens.sizes);
  const ownSetCounts = new Set(tokens.setCounts);
  const conflicting = [
    ...colorsIn(listingText).filter((v) => !ownColors.has(normalizeForMatch(v))),
    ...capacitiesIn(normalizedListing).filter((v) => !ownCapacities.has(v)),
    ...sizesIn(normalizedListing).filter((v) => !ownSizes.has(v)),
    ...setCountsIn(normalizedListing).filter((v) => !ownSetCounts.has(v)),
  ];

  // トークンが 1 つも取れなければ、何にでも一致してしまうので一致にしない
  const matched = all.length > 0 && missing.length === 0 && conflicting.length === 0;

  return {
    matched,
    missing,
    conflicting,
    matchedVariantLabel: matched ? labelOf(tokens) : null,
  };
}

export function hasExcludedTerm(listingText: string): boolean {
  return EXCLUDED_LISTING_TERMS.some((term) => listingText.includes(term));
}

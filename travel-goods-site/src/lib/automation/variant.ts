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

/** 「18/24L」のように / でつながった容量も 1 つずつに分ける。 */
const CAPACITY_L_RE = /(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)*)\s*L(?![a-zA-Z])/g;
/** モバイルバッテリーの容量。 */
const CAPACITY_MAH_RE = /(\d+(?:\.\d+)?)\s*mAh/gi;
/** S/M/L/XL/2XL のサイズ表記。長いものを先に見る。 */
const SIZE_RE = /(2XL|XL|S|M|L)サイズ/g;
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

export function extractVariantTokens(variant: string): VariantTokens {
  const colors: string[] = [];
  // 長い色名から順に消し込み、部分一致で短い色名を二重に拾わない
  let remaining = variant;
  for (const color of COLOR_NAMES) {
    if (remaining.includes(color)) {
      colors.push(color);
      remaining = remaining.split(color).join(' ');
    }
  }
  return {
    colors: uniq(colors),
    sizes: sizesIn(variant),
    capacities: capacitiesIn(variant),
    setCounts: setCountsIn(variant),
  };
}

/** 表示用ラベルの並び。現行データの variant 表記に合わせる。 */
function labelOf(tokens: VariantTokens): string {
  return [...tokens.sizes, ...tokens.capacities, ...tokens.colors, ...tokens.setCounts].join(' / ');
}

export function verifyVariant(variant: string, listingText: string): VariantVerdict {
  const tokens = extractVariantTokens(variant);
  const all = [...tokens.sizes, ...tokens.capacities, ...tokens.colors, ...tokens.setCounts];
  const haystack = normalizeForMatch(listingText);

  const missing = all.filter((token) => !haystack.includes(normalizeForMatch(token)));

  // 販売ページ側に現れる、対象と異なる容量・サイズ・セット数
  const ownCapacities = new Set(tokens.capacities.map(normalizeForMatch));
  const ownSizes = new Set(tokens.sizes.map(normalizeForMatch));
  const ownSetCounts = new Set(tokens.setCounts.map(normalizeForMatch));
  const conflicting = [
    ...capacitiesIn(listingText).filter((v) => !ownCapacities.has(normalizeForMatch(v))),
    ...sizesIn(listingText).filter((v) => !ownSizes.has(normalizeForMatch(v))),
    ...setCountsIn(listingText).filter((v) => !ownSetCounts.has(normalizeForMatch(v))),
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

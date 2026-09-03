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
 *   - `malformed`: 単位・容量・セット数・サイズらしい表記があるのに解析できない
 * 「抽出対象ではない」と「不正な構造化表記」を混同しないための区別で、
 * `malformed` は色が一致していても variant 全体を不一致にする。
 *
 * **単位から英単語や空白を無制限に逆走しない。** 単位に見える文字の直前に
 * 隣接した字句だけを見る。`MODEL` `TRAVEL` `SPECIAL` `BLACK` の `L` は
 * 英単語の一部であって単位ではないので、`2024 MODEL 30L` の `2024` まで
 * 探しに戻ってはいけない。
 */

/** 数値トークンそのものを構成する文字。区切りも演算子も含めない。 */
const NUMERIC = /[0-9.,]/;
const ASCII_ALNUM = /[0-9A-Za-z]/;
const ASCII_LETTER = /[A-Za-z]/;
const DIGIT = /[0-9]/;
const WHITESPACE = /\s/;

/**
 * 数値トークンをつなぐ記号は 3 種類に**明示的に分類する**。
 *
 *   - 拡張容量の区切り `/`  … `18/24L` `18 / 24L` は 2 つの容量
 *   - 式・範囲の記号        … `+` `＋` `〜` `～` `~` `から`
 *   - ダッシュ              … 曖昧。左隣のトークンで区別する
 *
 * 式・範囲の記号は**前後の空白の有無にかかわらず** malformed にする。
 * 空白で走査を止めると `30 ＋ 5L` の後半 `5L` だけを正常な容量として
 * 採用してしまうため。
 */
const RANGE_OPERATOR = /[+＋〜～~]/;
const RANGE_WORD = 'から';
/**
 * ダッシュは商品名との区切りにも範囲にも使われる。
 *   `商品名 - 30L` `商品123 - 30L` `2024 - 30L` … 区切り（30L として読む）
 *   `30 - 35L`                                  … 範囲（malformed）
 * 前後に空白を持つ場合だけ、左隣のトークンを見て区別する。
 * 空白の無いダッシュ（`30-35L`）は式の一部として読み、文法検査で落とす。
 */
const DASH = /[-–—−－ー]/;

/** 容量(L)。`18/24` のような拡張表記だけを許す。 */
const VALID_CAPACITY_L = /^\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)*$/;
/** mAh。区切りは許さない。 */
const VALID_CAPACITY_MAH = /^\d+(?:\.\d+)?$/;
/** セット数。小数も区切りも許さない。 */
const VALID_SET_COUNT = /^\d+$/;

/** サポートするサイズラベル。これ以外は `サイズ` が付いていても読まない。 */
const SIZE_LABELS: readonly string[] = ['S', 'M', 'L', 'XL', '2XL'];
const SIZE_SUFFIX = 'サイズ';
/**
 * サイズラベル式を構成しうる文字。
 * 空白形（`L サイズ`）と、複数・範囲の省略形（`S/M/Lサイズ` `S・M・Lサイズ`
 * `S M Lサイズ` `S〜Lサイズ`）をまとめて 1 つの式として捉えるために、
 * 区切り記号と空白も式の一部として読む。読んだ結果が単一のサポート対象
 * ラベルでなければ malformed に倒す。
 *
 * `ー`（長音符）は入れない。`フリーサイズ` を式として拾ってしまうため。
 */
const SIZE_EXPRESSION_CHAR = /[0-9A-Za-z\s/・〜～~+＋,\-–—]/;
/** 式の先頭に来た区切り。ラベルの一部ではない（`30L / Lサイズ` の `/ `）。 */
const SIZE_EXPRESSION_LEAD = /^[\s/・〜～~+＋,\-–—]+/;

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

/**
 * この位置から右がサイズラベル式（`… サイズ`）の途中か。
 *
 * `2XL サイズ` の `L` は単位でも `500ML` 型の接続でもなく、サイズラベルの一部。
 * 空白形を許すため、ここだけは区切り・空白も越えて `サイズ` を探す。
 */
function isInsideSizeExpression(text: string, from: number): boolean {
  let at = from;
  while (charIs(SIZE_EXPRESSION_CHAR, text[at])) at += 1;
  return text.startsWith(SIZE_SUFFIX, at);
}

/** ASCII 英字が直前に連なっている範囲の先頭。 */
function letterRunStart(text: string, end: number, floor: number): number {
  let start = end;
  while (start > floor && charIs(ASCII_LETTER, text[start - 1])) start -= 1;
  return start;
}

/** 空白を左へ読み飛ばした位置。 */
function skipWhitespaceLeft(text: string, from: number, floor: number): number {
  let at = from;
  while (at > floor && charIs(WHITESPACE, text[at - 1])) at -= 1;
  return at;
}

/** 数値トークンの先頭。直前が数値文字でなければ null。 */
function numericTokenStart(text: string, end: number, floor: number): number | null {
  let start = end;
  while (start > floor && charIs(NUMERIC, text[start - 1])) start -= 1;
  return start === end ? null : start;
}

/**
 * ダッシュの左隣にある「直近のトークン」（空白で区切られた語）。
 * `30 - 35L` の `30`、`商品123 - 30L` の `商品123`、`2024 - 30L` の `2024`。
 */
function wordLeftOf(text: string, at: number, floor: number): string {
  const end = skipWhitespaceLeft(text, at, floor);
  let start = end;
  while (start > floor && !charIs(WHITESPACE, text[start - 1])) start -= 1;
  return text.slice(start, end);
}

/**
 * ダッシュが範囲を表しているか。
 * 左隣が純粋な数値なら範囲（`30 - 35L`）。ただし 4 桁は年とみなし、
 * 商品名の一部（`2024 - 30L`）として扱う。数値以外なら商品名との区切り。
 */
function isRangeDash(word: string): boolean {
  return /^\d+(?:\.\d+)?$/.test(word) && !/^\d{4}$/.test(word);
}

type NumberExpression =
  | { kind: 'none' }
  | { kind: 'malformed' }
  | { kind: 'number'; start: number };

/**
 * 単位の直前にある数値式を、左へ「数値トークン」と「結合子」を交互に読んで取る。
 *
 * **英字・空白を越えて無制限に逆走しない。** 結合子として認めた記号だけを越える。
 * 結合子が式・範囲の記号なら、その場で malformed にして後半だけの採用を防ぐ。
 */
function scanNumberExpression(text: string, unitIndex: number, floor: number): NumberExpression {
  // 単位の直前の余白（`30 L`）
  const numberEnd = skipWhitespaceLeft(text, unitIndex, floor);
  let start = numericTokenStart(text, numberEnd, floor);
  if (start === null) return { kind: 'none' };

  for (;;) {
    const connectorEnd = skipWhitespaceLeft(text, start, floor);
    if (connectorEnd === floor) break;
    const connector = text[connectorEnd - 1];

    if (connector === '/') {
      // 拡張容量の区切り。左にもう 1 つ数値トークンが要る。
      const nextEnd = skipWhitespaceLeft(text, connectorEnd - 1, floor);
      if (nextEnd === floor) break; // 直前のトークンとの境界。式の先頭の区切り。
      const next = numericTokenStart(text, nextEnd, floor);
      if (next === null) return { kind: 'malformed' }; // `18 / / 24L`
      start = next;
      continue;
    }

    if (
      charIs(RANGE_OPERATOR, connector) ||
      text.slice(connectorEnd - RANGE_WORD.length, connectorEnd) === RANGE_WORD
    ) {
      return { kind: 'malformed' };
    }

    if (charIs(DASH, connector)) {
      const spacedRight = connectorEnd < start;
      const spacedLeft = charIs(WHITESPACE, text[connectorEnd - 2]);
      if (spacedRight && spacedLeft) {
        // 前後に空白があるダッシュ。左隣のトークンで区切りか範囲かを決める。
        if (isRangeDash(wordLeftOf(text, connectorEnd - 1, floor))) return { kind: 'malformed' };
        break;
      }
      // 空白の無いダッシュは式の一部。左の数値も取り込んで文法検査へ渡す。
      const nextEnd = skipWhitespaceLeft(text, connectorEnd - 1, floor);
      if (nextEnd === floor) break;
      const next = numericTokenStart(text, nextEnd, floor);
      if (next === null) break; // `- 30L` のような先頭の区切り
      start = next;
      continue;
    }

    break; // 英字・かな・漢字・別の数値など。式の終わり。
  }

  return { kind: 'number', start };
}

function scanStructured(text: string): StructuredScan {
  const sizes: string[] = [];
  const capacities: string[] = [];
  const setCounts: string[] = [];
  let malformed = false;
  // 直前に**読み終えた**位置。連なりの探索はここより前へ戻らない。
  // 候補にしなかった単位では進めない（`L サイズ` の `L` を式から外さないため）。
  let consumedEnd = 0;
  let index = 0;

  while (index < text.length) {
    // --- サイズ表記。接尾辞「サイズ」を起点に、直前のラベル式を 1 つとして読む ---
    if (text.startsWith(SIZE_SUFFIX, index)) {
      const suffixEnd = index + SIZE_SUFFIX.length;
      let expressionStart = index;
      while (
        expressionStart > consumedEnd &&
        charIs(SIZE_EXPRESSION_CHAR, text[expressionStart - 1])
      ) {
        expressionStart -= 1;
      }
      const label = text
        .slice(expressionStart, index)
        .replace(SIZE_EXPRESSION_LEAD, '')
        .trim();

      if (label === '') {
        // 「本体サイズ」「フリーサイズ」など、ラベルの無い日本語。候補ではない。
        index = suffixEnd;
        consumedEnd = suffixEnd;
        continue;
      }
      // 単一のサポート対象ラベルでない（`LL` `S/M/L` `S M L`）、
      // または直後に英数字が続く（`Lサイズ2`）
      if (!SIZE_LABELS.includes(label) || charIs(ASCII_ALNUM, text[suffixEnd])) {
        malformed = true;
      } else {
        sizes.push(`${label}${SIZE_SUFFIX}`);
      }
      index = suffixEnd;
      consumedEnd = suffixEnd;
      continue;
    }

    const unit = unitAt(text, index);
    if (unit === null) {
      index += 1;
      continue;
    }
    const unitEnd = index + unit.text.length;

    // `Lサイズ` `2XLサイズ` の `L` は単位ではない。サイズ表記の一部なので接尾辞側で読む。
    let afterUnit = unitEnd;
    while (charIs(ASCII_ALNUM, text[afterUnit])) afterUnit += 1;
    if (text.startsWith(SIZE_SUFFIX, afterUnit)) {
      index += 1;
      continue;
    }

    if (charIs(ASCII_LETTER, text[index - 1])) {
      // 単位に見える文字へ英字が直結している。
      // サイズラベル式の途中（`XL サイズ` `2XL サイズ`）なら接尾辞側で読む。
      // その英字の連なりの前が数字なら構造化表記（`500ML`）、
      // そうでなければ英単語の一部（`MODEL` `BLACK` `TRAVEL`）なので候補にしない。
      const wordStart = letterRunStart(text, index, consumedEnd);
      if (!isInsideSizeExpression(text, unitEnd) && charIs(DIGIT, text[wordStart - 1])) {
        malformed = true;
        consumedEnd = unitEnd;
      }
      index = unitEnd;
      continue;
    }

    const expression = scanNumberExpression(text, index, consumedEnd);
    if (expression.kind === 'none') {
      // 隣接した数値が無い。単位に見える文字は別の語の一部（`L サイズ` の `L`）。
      index = unitEnd;
      continue;
    }
    if (expression.kind === 'malformed') {
      malformed = true;
      index = unitEnd;
      consumedEnd = unitEnd;
      continue;
    }

    const numberPart = text.slice(expression.start, index).trim();
    const attachedBefore = charIs(ASCII_ALNUM, text[expression.start - 1]);
    const attachedAfter = charIs(ASCII_ALNUM, text[unitEnd]);

    if (attachedBefore || attachedAfter || !isValidNumber(unit.kind, numberPart)) {
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

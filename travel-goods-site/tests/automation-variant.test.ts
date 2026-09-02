// tests/automation-variant.test.ts
import { describe, expect, it } from 'vitest';
import {
  EXCLUDED_LISTING_TERMS,
  extractVariantTokens,
  hasExcludedTerm,
  verifyVariant,
} from '../src/lib/automation/variant';

describe('variant トークンの抽出', () => {
  it('variant から色と容量を取り出す', () => {
    expect(extractVariantTokens('30L / ブラック')).toEqual({
      colors: ['ブラック'], sizes: [], capacities: ['30L'], setCounts: [],
    });
  });

  it('拡張式の 18/24L は両方の容量を取り出す', () => {
    expect(extractVariantTokens('18/24L / 01 ブラック').capacities).toEqual(['18L', '24L']);
  });

  it('サイズ表記と容量を同時に取り出す', () => {
    const tokens = extractVariantTokens('Lサイズ 16L / 03 ダークネイビー');
    expect(tokens.sizes).toEqual(['Lサイズ']);
    expect(tokens.capacities).toEqual(['16L']);
    expect(tokens.colors).toEqual(['ダークネイビー']);
  });

  it('長い色名を優先する（ブラックヘアラインをブラックに縮めない）', () => {
    expect(extractVariantTokens('35L / 01 ブラックヘアライン').colors).toEqual(['ブラックヘアライン']);
    expect(extractVariantTokens('Mサイズ 10L / 03 ダークネイビー').colors).toEqual(['ダークネイビー']);
  });

  it('モバイルバッテリーの mAh も容量として扱う', () => {
    expect(extractVariantTokens('10000mAh / ブラック').capacities).toEqual(['10000mAh']);
  });

  it('取り出せないものは空配列にする（推測しない）', () => {
    expect(extractVariantTokens('')).toEqual({
      colors: [], sizes: [], capacities: [], setCounts: [],
    });
  });
});

describe('販売ページ文言との照合', () => {
  it('全トークンが出てくれば一致', () => {
    const v = verifyVariant('30L / ブラック', '旅行リュック 30L ブラック 大容量');
    expect(v.matched).toBe(true);
    expect(v.missing).toEqual([]);
    expect(v.conflicting).toEqual([]);
    expect(v.matchedVariantLabel).toBe('30L / ブラック');
  });

  it('別容量が併記されていたら矛盾として検出する', () => {
    const v = verifyVariant('30L / ブラック', '旅行リュック 30L/40L 選べる2サイズ ブラック');
    expect(v.matched).toBe(false);
    expect(v.conflicting).toContain('40L');
    expect(v.matchedVariantLabel).toBeNull();
  });

  it('色が出てこなければ missing に色が入る', () => {
    const v = verifyVariant('30L / ブラック', '旅行リュック 30L 大容量');
    expect(v.matched).toBe(false);
    expect(v.missing).toContain('ブラック');
    expect(v.matchedVariantLabel).toBeNull();
  });

  it('別サイズが併記された選択式ページを一致扱いしない', () => {
    const v = verifyVariant('Mサイズ / ブラック', 'トラベルポーチ Sサイズ Mサイズ Lサイズ ブラック');
    expect(v.matched).toBe(false);
    expect(v.conflicting).toEqual(expect.arrayContaining(['Sサイズ', 'Lサイズ']));
    expect(v.matchedVariantLabel).toBeNull();
  });

  it('別のセット数が併記されていたら矛盾として検出する', () => {
    const v = verifyVariant('3個セット / ブラック', '圧縮袋 3個セット 6個セット ブラック');
    expect(v.matched).toBe(false);
    expect(v.conflicting).toContain('6個セット');
  });

  it('matched が false のとき matchedVariantLabel は必ず null', () => {
    for (const listing of ['', '無関係な商品', '旅行リュック 40L ブラック']) {
      const v = verifyVariant('30L / ブラック', listing);
      expect(v.matched).toBe(false);
      expect(v.matchedVariantLabel).toBeNull();
    }
  });

  it('トークンが 1 つも取れなければ一致にしない（空 variant で通さない）', () => {
    const v = verifyVariant('', '何でも書いてある商品ページ');
    expect(v.matched).toBe(false);
    expect(v.matchedVariantLabel).toBeNull();
  });

  it('全角・記号の違いを吸収して照合する', () => {
    const v = verifyVariant('30L / ブラック', '旅行リュック ３０Ｌ ブラック');
    expect(v.matched).toBe(true);
  });

  it('色を部分一致で通さない（ブラック ≠ ブラックヘアライン）', () => {
    const v = verifyVariant('35L / ブラック', 'スーツケース 35L ブラックヘアライン');
    expect(v.matched).toBe(false);
    expect(v.matchedVariantLabel).toBeNull();
  });

  it('色を部分一致で通さない（ネイビー ≠ ダークネイビー）', () => {
    const v = verifyVariant('30L / ネイビー', 'リュック 30L ダークネイビー');
    expect(v.matched).toBe(false);
    expect(v.matchedVariantLabel).toBeNull();
  });

  it('同じ色名どうしは一致する（ブラックヘアライン同士）', () => {
    const v = verifyVariant('35L / 01 ブラックヘアライン', 'スーツケース 35L 01 ブラックヘアライン');
    expect(v.matched).toBe(true);
  });

  it('別の色が併記された選択式ページを一致扱いしない', () => {
    const v = verifyVariant('30L / ブラック', 'リュック 30L ブラック ホワイト 2色から選べる');
    expect(v.matched).toBe(false);
    expect(v.conflicting).toContain('ホワイト');
    expect(v.matchedVariantLabel).toBeNull();
  });

  it('拡張式は両方の容量が出てくれば一致し、片方だけを矛盾にしない', () => {
    const v = verifyVariant('18/24L / 01 ブラック', 'スーツケース 18L/24L 拡張 01 ブラック');
    expect(v.conflicting).toEqual([]);
    expect(v.matched).toBe(true);
  });
});

describe('容量の意味を壊してから照合しない', () => {
  it('30.5L と 305L を同一視しない', () => {
    const v = verifyVariant('30.5L / ブラック', '305L ブラック');
    expect(v.matched).toBe(false);
  });

  it('30.5L 同士は一致する', () => {
    expect(verifyVariant('30.5L / ブラック', 'リュック 30.5L ブラック').matched).toBe(true);
  });

  it('18/24L は 18/24L と一致する', () => {
    const v = verifyVariant('18/24L / 01 ブラック', 'スーツケース 18/24L 01 ブラック');
    expect(v.missing).toEqual([]);
    expect(v.conflicting).toEqual([]);
    expect(v.matched).toBe(true);
  });

  it('18/24L は 18L/24L とも一致する', () => {
    expect(verifyVariant('18/24L / 01 ブラック', 'スーツケース 18L/24L 01 ブラック').matched).toBe(true);
  });

  it('全角の３０．５Ｌ を 30.5L として扱う', () => {
    expect(extractVariantTokens('３０．５Ｌ / ブラック').capacities).toEqual(['30.5L']);
    expect(verifyVariant('30.5L / ブラック', 'リュック ３０．５Ｌ ブラック').matched).toBe(true);
  });

  it('30.5L のページに 305L が併記されていれば conflicting', () => {
    const v = verifyVariant('30.5L / ブラック', 'リュック 30.5L と 305L の 2 種 ブラック');
    expect(v.conflicting).toContain('305L');
    expect(v.matched).toBe(false);
  });

  it('mAh の既存挙動を壊さない', () => {
    expect(extractVariantTokens('10000mAh / ブラック').capacities).toEqual(['10000mAh']);
    expect(verifyVariant('10000mAh / ブラック', 'モバイルバッテリー 10000mAh ブラック').matched).toBe(true);
    expect(verifyVariant('10000mAh / ブラック', 'モバイルバッテリー 20000mAh ブラック').matched).toBe(false);
  });
});

describe('不正な数値トークンの途中から切り出さない', () => {
  it('30.5.6L は 5.6L に一致しない', () => {
    expect(verifyVariant('5.6L / ブラック', '30.5.6L ブラック').matched).toBe(false);
  });

  it('1.2.3mAh は 2.3mAh に一致しない', () => {
    expect(verifyVariant('2.3mAh / ブラック', '1.2.3mAh ブラック').matched).toBe(false);
  });

  it('1.3個セット は 3個セット に一致しない', () => {
    expect(verifyVariant('3個セット / ブラック', '1.3個セット ブラック').matched).toBe(false);
  });

  it('不正な数値列からはトークンを 1 つも取り出さない', () => {
    expect(extractVariantTokens('30.5.6L').capacities).toEqual([]);
    expect(extractVariantTokens('1.2.3mAh').capacities).toEqual([]);
    expect(extractVariantTokens('1.3個セット').setCounts).toEqual([]);
    expect(extractVariantTokens('30.5.6L 1.2.3mAh 1.3個セット')).toEqual({
      colors: [], sizes: [], capacities: [], setCounts: [],
    });
  });

  it('正常な 5.6L / 2.3mAh / 3個セット は従来どおり一致する', () => {
    expect(verifyVariant('5.6L / ブラック', 'ポーチ 5.6L ブラック').matched).toBe(true);
    expect(verifyVariant('2.3mAh / ブラック', 'バッテリー 2.3mAh ブラック').matched).toBe(true);
    expect(verifyVariant('3個セット / ブラック', '圧縮袋 3個セット ブラック').matched).toBe(true);
  });

  it('数字が直前に続く容量を切り出さない', () => {
    expect(extractVariantTokens('130L').capacities).toEqual(['130L']);
    expect(verifyVariant('30L / ブラック', 'リュック 130L ブラック').matched).toBe(false);
  });

  it('target と listing の両方で同じ規則を使う', () => {
    // どちら側でも 30.5.6L からは容量トークンを取り出さない
    expect(extractVariantTokens('30.5.6L / ブラック').capacities).toEqual([]);
    const v = verifyVariant('30.5.6L / ブラック', 'ポーチ 30.5.6L ブラック');
    expect(v.missing).toEqual([]);
    expect(v.conflicting).toEqual([]);
    // 解釈できない構造化表記が残っているので、色が一致しても一致にしない
    expect(v.matched).toBe(false);
    expect(v.matchedVariantLabel).toBeNull();
  });

  it('拡張容量の途中に不正な数値があれば取り出さない', () => {
    expect(extractVariantTokens('18/24.5.6L').capacities).toEqual([]);
  });
});

describe('全角文字でサイズ境界を迂回させない', () => {
  it('２XLサイズ を XLサイズ に縮めない', () => {
    expect(extractVariantTokens('２XLサイズ').sizes).toEqual(['2XLサイズ']);
    expect(verifyVariant('２XLサイズ / ブラック', 'XLサイズ ブラック').matched).toBe(false);
  });

  it('２XL target は 2XL listing と一致する', () => {
    expect(verifyVariant('２XLサイズ / ブラック', '2XLサイズ ブラック').matched).toBe(true);
  });

  it('ＸLサイズ を Lサイズ に縮めない', () => {
    expect(extractVariantTokens('ＸLサイズ').sizes).toEqual(['XLサイズ']);
    expect(verifyVariant('ＸLサイズ / ブラック', 'Lサイズ ブラック').matched).toBe(false);
  });

  it('ＸL target は XL listing と一致する', () => {
    expect(verifyVariant('ＸLサイズ / ブラック', 'XLサイズ ブラック').matched).toBe(true);
  });

  it('全角 Ｓ / Ｍ / Ｌ の正常ケース', () => {
    expect(extractVariantTokens('Ｓサイズ').sizes).toEqual(['Sサイズ']);
    expect(extractVariantTokens('Ｍサイズ').sizes).toEqual(['Mサイズ']);
    expect(extractVariantTokens('Ｌサイズ').sizes).toEqual(['Lサイズ']);
    expect(verifyVariant('Ｌサイズ / ブラック', 'ポーチ Lサイズ ブラック').matched).toBe(true);
  });

  it('全角でも XS / LL / 2M / SL は拒否する', () => {
    for (const text of ['ＸSサイズ', 'ＬLサイズ', '２Mサイズ', 'ＳLサイズ']) {
      expect(extractVariantTokens(text).sizes).toEqual([]);
    }
  });
});

describe('サイズトークンの境界', () => {
  it('Lサイズ は LLサイズ に一致しない', () => {
    const v = verifyVariant('Lサイズ 16L / 03 ダークネイビー', 'ポーチ LLサイズ 16L 03 ダークネイビー');
    expect(v.matched).toBe(false);
    expect(v.matchedVariantLabel).toBeNull();
  });

  it('Sサイズ は XSサイズ に一致しない', () => {
    const v = verifyVariant('Sサイズ 6L / 03 ダークネイビー', 'ポーチ XSサイズ 6L 03 ダークネイビー');
    expect(v.matched).toBe(false);
  });

  it('Mサイズ は 2Mサイズ に一致しない', () => {
    const v = verifyVariant('Mサイズ / ブラック', 'ポーチ 2Mサイズ ブラック');
    expect(v.matched).toBe(false);
  });

  it('XS / LL / 2M / SL をサイズとして抽出しない', () => {
    for (const text of ['XSサイズ', 'LLサイズ', '2Mサイズ', 'SLサイズ']) {
      expect(extractVariantTokens(text).sizes).toEqual([]);
    }
  });

  it('独立した S / M / L / XL / 2XL は従来どおり抽出する', () => {
    expect(extractVariantTokens('Sサイズ 6L').sizes).toEqual(['Sサイズ']);
    expect(extractVariantTokens('Mサイズ / ブラック').sizes).toEqual(['Mサイズ']);
    expect(extractVariantTokens('Lサイズ 16L').sizes).toEqual(['Lサイズ']);
    expect(extractVariantTokens('XLサイズ').sizes).toEqual(['XLサイズ']);
    expect(extractVariantTokens('2XLサイズ').sizes).toEqual(['2XLサイズ']);
  });

  it('Lサイズ 単独は従来どおり一致する', () => {
    expect(verifyVariant('Lサイズ 16L / 03 ダークネイビー', 'ポーチ Lサイズ 16L 03 ダークネイビー').matched)
      .toBe(true);
  });

  it('XL / 2XL の正常ケースを壊さない', () => {
    expect(verifyVariant('XLサイズ / ブラック', 'ポーチ XLサイズ ブラック').matched).toBe(true);
    expect(verifyVariant('2XLサイズ / ブラック', 'ポーチ 2XLサイズ ブラック').matched).toBe(true);
  });

  it('XLサイズ を Lサイズ として拾わない', () => {
    expect(verifyVariant('Lサイズ / ブラック', 'ポーチ XLサイズ ブラック').matched).toBe(false);
  });
});

describe('色名をマーケティング文言から拾わない', () => {
  it('ブラックフライデーを色として扱わない', () => {
    const v = verifyVariant('30L / ブラック', '旅行リュック 30L ブラックフライデー特価');
    expect(v.matched).toBe(false);
    expect(v.missing).toContain('ブラック');
    expect(v.matchedVariantLabel).toBeNull();
  });

  it('ホワイトニングを色として扱わない', () => {
    const v = verifyVariant('30L / ホワイト', 'ポーチ 30L ホワイトニング効果');
    expect(v.matched).toBe(false);
    expect(v.conflicting).not.toContain('ホワイト');
  });

  it('ブラックヘアラインをブラックとして扱わない', () => {
    const v = verifyVariant('35L / ブラック', 'スーツケース 35L ブラックヘアライン');
    expect(v.matched).toBe(false);
  });

  it('「カラー：ブラック」はブラックとして扱う', () => {
    const v = verifyVariant('30L / ブラック', '旅行リュック 30L カラー：ブラック');
    expect(v.matched).toBe(true);
  });

  it('区切り記号で並んだ 2 色を両方抽出し、対象外はconflictingにする', () => {
    const v = verifyVariant('30L / ブラック', '旅行リュック 30L ブラック / ホワイト');
    expect(v.conflicting).toContain('ホワイト');
    expect(v.matched).toBe(false);
  });

  it('読点で並んだ 2 色も両方抽出する', () => {
    const v = verifyVariant('30L / ブラック', '旅行リュック 30L ブラック、ホワイト');
    expect(v.conflicting).toContain('ホワイト');
  });

  it('既存の正常な商品名は引き続き一致する', () => {
    expect(verifyVariant('30L / ブラック', '旅行リュック 30L ブラック 大容量').matched).toBe(true);
    expect(verifyVariant('35L / 01 ブラックヘアライン', 'スーツケース 35L 01 ブラックヘアライン').matched).toBe(true);
    expect(verifyVariant('10000mAh / ブラック', 'モバイルバッテリー 10000mAh ブラック').matched).toBe(true);
  });

  it('カタカナが直前に続く場合も色として拾わない', () => {
    const v = verifyVariant('30L / ネイビー', 'リュック 30L ミッドナイトネイビー');
    expect(v.matched).toBe(false);
  });
});

describe('解釈できない target variant を色だけで一致させない', () => {
  it('30.5.6L / ブラック は色が一致しても matched: false', () => {
    const v = verifyVariant('30.5.6L / ブラック', 'ポーチ 30.5.6L ブラック');
    expect(v.matched).toBe(false);
    expect(v.matchedVariantLabel).toBeNull();
  });

  it('不正な mAh・セット数でも同じ', () => {
    for (const variant of ['1.2.3mAh / ブラック', '1.3個セット / ブラック', '18/24.5.6L / ブラック']) {
      const v = verifyVariant(variant, `ポーチ ${variant.replace(' / ', ' ')}`);
      expect(v.matched).toBe(false);
      expect(v.matchedVariantLabel).toBeNull();
    }
  });

  it('別の色トークンが一致していても false', () => {
    const v = verifyVariant('30.5.6L / ブラック', 'ポーチ ブラック 大容量');
    expect(v.matched).toBe(false);
  });

  it('正常な構造化表記は従来どおり一致する', () => {
    expect(verifyVariant('5.6L / ブラック', 'ポーチ 5.6L ブラック').matched).toBe(true);
    expect(verifyVariant('2.3mAh / ブラック', 'バッテリー 2.3mAh ブラック').matched).toBe(true);
    expect(verifyVariant('3個セット / ブラック', '圧縮袋 3個セット ブラック').matched).toBe(true);
    expect(verifyVariant('18/24L / 01 ブラック', 'スーツケース 18/24L 01 ブラック').matched).toBe(true);
  });

  it('現行データの 2 桁カラーコードを不正扱いしない', () => {
    for (const variant of [
      '35L / 01 ブラックヘアライン',
      '18/24L / 01 ブラック',
      '32L / 03 ブルーグリーン',
      'Lサイズ 16L / 03 ダークネイビー',
      '10000mAh / ブラック',
    ]) {
      const listing = `商品 ${variant.replace(/ \/ /g, ' ')}`;
      expect(verifyVariant(variant, listing).matched).toBe(true);
    }
  });

  it('構造化表記が元から無い variant は従来どおり扱う（欠落と混同しない）', () => {
    // 色だけの variant。取れたトークンが一致すれば matched
    expect(verifyVariant('ブラック', 'ポーチ ブラック').matched).toBe(true);
    // トークンが 1 つも取れない variant は従来どおり false
    expect(verifyVariant('', '何でも書いてある商品ページ').matched).toBe(false);
  });
});

describe('除外語の検出', () => {
  it('中古・訳ありを検出する', () => {
    expect(hasExcludedTerm('【中古】スーツケース')).toBe(true);
  });

  it('設計書の除外語をすべて検出する', () => {
    expect([...EXCLUDED_LISTING_TERMS]).toEqual([
      '中古', '訳あり', '並行輸入', 'まとめ買い', 'セット販売', 'アウトレット',
    ]);
    for (const term of EXCLUDED_LISTING_TERMS) {
      expect(hasExcludedTerm(`スーツケース ${term} 送料無料`)).toBe(true);
    }
  });

  it('除外語が無ければ false', () => {
    expect(hasExcludedTerm('新品 スーツケース 35L ブラック')).toBe(false);
  });
});

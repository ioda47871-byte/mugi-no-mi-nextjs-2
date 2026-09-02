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

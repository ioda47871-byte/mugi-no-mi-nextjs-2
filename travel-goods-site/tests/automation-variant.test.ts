// tests/automation-variant.test.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EXCLUDED_LISTING_TERMS,
  extractVariantTokens,
  hasExcludedTerm,
  scanVariant,
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

describe('英数字に接続した容量・セット数を独立トークンにしない', () => {
  it('型番に埋もれた容量を拾わない（前が英数字）', () => {
    expect(verifyVariant('30L / ブラック', '商品 A30L ブラック').matched).toBe(false);
    expect(verifyVariant('10000mAh / ブラック', '商品 A10000mAh ブラック').matched).toBe(false);
    expect(verifyVariant('3個セット / ブラック', '商品 A3個セット ブラック').matched).toBe(false);
  });

  it('単位の後ろが英数字なら拾わない', () => {
    expect(verifyVariant('30L / ブラック', '商品 30L2 ブラック').matched).toBe(false);
    expect(verifyVariant('10000mAh / ブラック', '商品 10000mAh2 ブラック').matched).toBe(false);
    expect(verifyVariant('3個セット / ブラック', '商品 3個セット2 ブラック').matched).toBe(false);
  });

  it('target 側でも同じ境界を適用する', () => {
    expect(extractVariantTokens('A30L').capacities).toEqual([]);
    expect(extractVariantTokens('30L2').capacities).toEqual([]);
    expect(extractVariantTokens('A10000mAh').capacities).toEqual([]);
    expect(extractVariantTokens('A3個セット').setCounts).toEqual([]);
  });

  it('正常なトークンは維持する', () => {
    expect(verifyVariant('30L / ブラック', '商品 30L ブラック').matched).toBe(true);
    expect(verifyVariant('10000mAh / ブラック', '商品 10000mAh ブラック').matched).toBe(true);
    expect(verifyVariant('3個セット / ブラック', '商品 3個セット ブラック').matched).toBe(true);
  });

  it('日本語の説明文に隣接する正常トークンは維持する', () => {
    expect(verifyVariant('30L / ブラック', '大容量30L大型リュック ブラック').matched).toBe(true);
    expect(verifyVariant('3個セット / ブラック', '圧縮袋3個セット入り ブラック').matched).toBe(true);
  });

  it('2XLサイズ を容量として拾わない', () => {
    expect(extractVariantTokens('2XLサイズ').capacities).toEqual([]);
  });
});

describe('壊れた拡張容量の一部分だけを採用しない', () => {
  it('余分なスラッシュがあれば variant 全体を不一致にする', () => {
    const v = verifyVariant('18 / / 24L / ブラック', '商品 24L ブラック');
    expect(v.matched).toBe(false);
    expect(v.matchedVariantLabel).toBeNull();
  });

  it('全角の区切りでも同じ', () => {
    const v = verifyVariant('１８ ／ ／ ２４L / ブラック', '商品 24L ブラック');
    expect(v.matched).toBe(false);
    expect(v.matchedVariantLabel).toBeNull();
  });

  it('連続区切りも不一致にする', () => {
    expect(verifyVariant('18//24L / ブラック', '商品 24L ブラック').matched).toBe(false);
  });

  it('後半だけを切り出して有効扱いしない', () => {
    expect(extractVariantTokens('18 / / 24L').capacities).toEqual([]);
    expect(extractVariantTokens('18//24L').capacities).toEqual([]);
  });

  it('正常な拡張容量は維持する', () => {
    expect(extractVariantTokens('18/24L').capacities).toEqual(['18L', '24L']);
    expect(extractVariantTokens('18 / 24L').capacities).toEqual(['18L', '24L']);
    expect(extractVariantTokens('１８／２４Ｌ').capacities).toEqual(['18L', '24L']);
    expect(verifyVariant('18/24L / 01 ブラック', '商品 18/24L 01 ブラック').matched).toBe(true);
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

describe('variant 解析結果は absent / valid / malformed を区別する', () => {
  it('その種類の表記が無ければ absent', () => {
    expect(scanVariant('ブラック').presence).toBe('absent');
    expect(scanVariant('01 ブラック').presence).toBe('absent');
    expect(scanVariant('').presence).toBe('absent');
  });

  it('厳密な文法で解析できれば valid', () => {
    expect(scanVariant('30L / ブラック').presence).toBe('valid');
    expect(scanVariant('35L / 01 ブラックヘアライン').presence).toBe('valid');
    expect(scanVariant('18/24L / 01 ブラック').presence).toBe('valid');
    expect(scanVariant('10000mAh / ブラック').presence).toBe('valid');
    expect(scanVariant('3個セット / ブラック').presence).toBe('valid');
    expect(scanVariant('Lサイズ 16L / 03 ダークネイビー').presence).toBe('valid');
  });

  it('構造化表記らしいのに解析できなければ malformed', () => {
    expect(scanVariant('30.5.6L / ブラック').presence).toBe('malformed');
    expect(scanVariant('1.2.3mAh / ブラック').presence).toBe('malformed');
    expect(scanVariant('1.3個セット / ブラック').presence).toBe('malformed');
    expect(scanVariant('18 / / 24L / ブラック').presence).toBe('malformed');
  });

  it('malformed ならトークンを 1 つも作らない', () => {
    const scan = scanVariant('18 / / 24L');
    expect(scan.presence).toBe('malformed');
    expect(scan.capacities).toEqual([]);
    expect(scan.setCounts).toEqual([]);
  });
});

describe('listing 側の解析結果も評価する', () => {
  it('listing に解析不能な容量があれば一致にしない', () => {
    const v = verifyVariant('30L / ブラック', '30L 40.5.6L ブラック');
    expect(v.matched).toBe(false);
    expect(v.matchedVariantLabel).toBeNull();
  });

  it('listing の壊れた拡張容量を無視しない', () => {
    const v = verifyVariant('18L / ブラック', '18L 24//30L ブラック');
    expect(v.matched).toBe(false);
    expect(v.matchedVariantLabel).toBeNull();
  });

  it('listing 側の malformed は presence に出る', () => {
    expect(scanVariant('30L 40.5.6L ブラック').presence).toBe('malformed');
    expect(scanVariant('18L 24//30L ブラック').presence).toBe('malformed');
  });

  it('target・listing とも valid なら従来どおり一致する', () => {
    expect(verifyVariant('30L / ブラック', '30L 40L ブラック').matched).toBe(false); // 40L は矛盾
    expect(verifyVariant('30L / ブラック', 'リュック 30L ブラック').matched).toBe(true);
  });
});

describe('境界から除外した構造化表記を「不存在」として扱わない', () => {
  it('単位の後ろが英数字の target は malformed', () => {
    for (const variant of ['30L2 / ブラック', '10000mAh2 / ブラック', '3個セット2 / ブラック']) {
      expect(scanVariant(variant).presence).toBe('malformed');
      const v = verifyVariant(variant, 'ブラック');
      expect(v.matched).toBe(false);
      expect(v.matchedVariantLabel).toBeNull();
    }
  });

  it('数値の前が英数字の target は malformed', () => {
    for (const variant of ['A30L / ブラック', 'A10000mAh / ブラック', 'A3個セット / ブラック']) {
      expect(scanVariant(variant).presence).toBe('malformed');
      const v = verifyVariant(variant, 'ブラック');
      expect(v.matched).toBe(false);
      expect(v.matchedVariantLabel).toBeNull();
    }
  });

  it('現行データの表記は absent または valid のまま', () => {
    expect(scanVariant('35L / 01 ブラックヘアライン').presence).toBe('valid');
    expect(scanVariant('18/24L / 01 ブラック').presence).toBe('valid');
    expect(scanVariant('ブラック').presence).toBe('absent');
    expect(scanVariant('01 ブラック').presence).toBe('absent');
    expect(verifyVariant('35L / 01 ブラックヘアライン', '商品 35L 01 ブラックヘアライン').matched)
      .toBe(true);
    expect(verifyVariant('18/24L / 01 ブラック', '商品 18/24L 01 ブラック').matched).toBe(true);
    expect(verifyVariant('ブラック', 'ポーチ ブラック').matched).toBe(true);
  });
});

describe('数値式・範囲らしい表記の一部分だけを採用しない', () => {
  it('30＋5L から 5L を切り出さない', () => {
    expect(verifyVariant('5L / ブラック', '30＋5L ブラック').matched).toBe(false);
  });

  it('演算・範囲記号が数字に連続すれば malformed', () => {
    for (const text of ['30＋5L', '30+5L', '30-5L', '30−5L', '30〜35L', '30～35L', '30から35L']) {
      const scan = scanVariant(text);
      expect(scan.presence).toBe('malformed');
      expect(scan.capacities).toEqual([]);
    }
  });

  it('セット数・mAh でも同じ', () => {
    expect(scanVariant('3＋2個セット').setCounts).toEqual([]);
    expect(scanVariant('3＋2個セット').presence).toBe('malformed');
    expect(scanVariant('10000〜20000mAh').capacities).toEqual([]);
    expect(scanVariant('10000〜20000mAh').presence).toBe('malformed');
  });

  it('単なる区切りとしての記号は従来どおり読む', () => {
    expect(scanVariant('商品名 - 30L').capacities).toEqual(['30L']);
    expect(scanVariant('商品名 - 30L').presence).toBe('valid');
    expect(scanVariant('18/24L').capacities).toEqual(['18L', '24L']);
    expect(verifyVariant('30L / ブラック', 'リュック - 30L ブラック').matched).toBe(true);
  });
});

describe('英単語中の L を離れた数字と結び付けない', () => {
  it('2024 MODEL 30L は 30L を valid として読む', () => {
    expect(scanVariant('2024 MODEL 30L ブラック')).toMatchObject({
      capacities: ['30L'],
      presence: 'valid',
    });
    expect(verifyVariant('30L / ブラック', '2024 MODEL 30L ブラック').matched).toBe(true);
  });

  it('型番・年・英単語・容量が同時にあるタイトルでも読める', () => {
    expect(verifyVariant('30L / ブラック', '型番2024 MODEL 30L ブラック').matched).toBe(true);
    expect(verifyVariant('30L / ブラック', 'TRAVEL BACKPACK 30L ブラック').matched).toBe(true);
    expect(verifyVariant('30L / ブラック', '【SPECIAL PRICE】 2025 30L ブラック').matched).toBe(true);
    expect(scanVariant('2024 MODEL 30L ブラック').presence).toBe('valid');
    expect(scanVariant('TRAVEL BACKPACK 30L ブラック').presence).toBe('valid');
  });

  it('BLACK の L を単位にしない（既存条件の維持）', () => {
    expect(scanVariant('BLACK ポーチ').presence).toBe('absent');
    expect(scanVariant('BLACK 30L').capacities).toEqual(['30L']);
    expect(scanVariant('BLACK 30L').presence).toBe('valid');
  });

  it('数字に直結した英字は引き続き malformed', () => {
    for (const text of ['A30L', '500ML', '30L2', 'A10000mAh', 'A3個セット']) {
      expect(scanVariant(text).presence).toBe('malformed');
    }
  });
});

describe('明確な区切りを越えて商品名側の数字を巻き込まない', () => {
  it('タイトル区切りの前の数字を numberPart に含めない', () => {
    expect(scanVariant('2024 - 30L ブラック')).toMatchObject({
      capacities: ['30L'],
      presence: 'valid',
    });
    expect(scanVariant('2024 – 30L ブラック').capacities).toEqual(['30L']);
    expect(scanVariant('2024 — 30L ブラック').capacities).toEqual(['30L']);
    expect(verifyVariant('30L / ブラック', '商品123 - 30L ブラック').matched).toBe(true);
    expect(verifyVariant('30L / ブラック', '商品名 - 30L ブラック').matched).toBe(true);
  });

  it('数値に直接接続した演算・範囲記号は引き続き malformed', () => {
    for (const text of ['30-35L', '30〜35L', '30＋5L', '30から35L']) {
      const scan = scanVariant(text);
      expect(scan.presence).toBe('malformed');
      expect(scan.capacities).toEqual([]);
    }
  });

  it('正常な拡張容量は維持する', () => {
    expect(scanVariant('18/24L').capacities).toEqual(['18L', '24L']);
    expect(scanVariant('18 / 24L').capacities).toEqual(['18L', '24L']);
    expect(scanVariant('18 / / 24L').presence).toBe('malformed');
  });
});

describe('サイズ表記も absent / valid / malformed 契約へ含める', () => {
  it('サポート対象外のラベル＋サイズは malformed', () => {
    for (const variant of [
      'LLサイズ / ブラック',
      'XSサイズ / ブラック',
      '2Mサイズ / ブラック',
      'SLサイズ / ブラック',
      'Lサイズ2 / ブラック',
    ]) {
      const result = verifyVariant(variant, 'ポーチ ブラック');
      expect(result.matched).toBe(false);
      expect(result.matchedVariantLabel).toBeNull();
      expect(scanVariant(variant).presence).toBe('malformed');
    }
  });

  it('サイズ表記の直後が ASCII 英数字なら malformed', () => {
    expect(scanVariant('Lサイズ2').presence).toBe('malformed');
    expect(scanVariant('XLサイズ2').presence).toBe('malformed');
    expect(scanVariant('Lサイズ2').sizes).toEqual([]);
  });

  it('listing 側の malformed なサイズも一致を止める', () => {
    const v = verifyVariant('Lサイズ / ブラック', 'ポーチ LLサイズ ブラック');
    expect(v.matched).toBe(false);
    expect(v.matchedVariantLabel).toBeNull();
    expect(scanVariant('ポーチ LLサイズ ブラック').presence).toBe('malformed');
  });

  it('サポート対象のサイズは valid のまま', () => {
    for (const text of ['Sサイズ', 'Mサイズ', 'Lサイズ', 'XLサイズ', '2XLサイズ']) {
      expect(scanVariant(text).presence).toBe('valid');
      expect(scanVariant(text).sizes).toEqual([text]);
    }
    expect(scanVariant('Ｌサイズ').sizes).toEqual(['Lサイズ']);
    expect(scanVariant('２XLサイズ').sizes).toEqual(['2XLサイズ']);
  });

  it('サイズ表記が元から無ければ absent（日本語の「サイズ」を巻き込まない）', () => {
    expect(scanVariant('ブラック').presence).toBe('absent');
    expect(scanVariant('本体サイズ ブラック').presence).toBe('absent');
    expect(scanVariant('フリーサイズ ブラック').presence).toBe('absent');
    expect(verifyVariant('ブラック', 'ポーチ ブラック').matched).toBe(true);
  });
});

describe('現行 23 商品の variant 回帰', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const files = ['backpacks', 'pouches', 'power-banks', 'suitcases'];
  const variants: string[] = files.flatMap(
    (f) =>
      (
        JSON.parse(
          fs.readFileSync(path.join(here, `../datasets/production/products/${f}.json`), 'utf8'),
        ) as { variant: string }[]
      ).map((p) => p.variant),
  );

  it('現行データを 23 件読み込む', () => {
    expect(variants).toHaveLength(23);
  });

  it('現行 variant に malformed は 1 件も無い', () => {
    const malformed = variants.filter((v) => scanVariant(v).presence === 'malformed');
    expect(malformed).toEqual([]);
  });

  it('現行 variant は同じ文言の listing と一致する', () => {
    for (const variant of variants) {
      const listing = `商品 ${variant.replace(/ \/ /g, ' ')} 送料無料`;
      expect(verifyVariant(variant, listing).matched).toBe(true);
    }
  });
});

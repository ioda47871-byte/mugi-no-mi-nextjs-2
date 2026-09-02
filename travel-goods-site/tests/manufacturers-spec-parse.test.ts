// tests/manufacturers-spec-parse.test.ts
import { describe, expect, it } from 'vitest';
import {
  parseCapacityL,
  parseCapacityMah,
  parseLabeledSizeMm,
  parseWatt,
  parseWeightG,
} from '../src/lib/manufacturers/spec-parse';

describe('数値パーサは不正値で必ず null を返す', () => {
  const badNumbers = ['.kg', '1.2.3kg', '0kg', '-1kg', 'Infinitykg', 'NaNkg', 'kg', '..kg', '1.kg'];

  it.each(badNumbers)('重量 %s を読まない', (raw) => {
    expect(parseWeightG(raw)).toBeNull();
  });

  it('正しい重量は読める', () => {
    expect(parseWeightG('2.9kg')).toBe(2900);
    expect(parseWeightG('約1,250g')).toBe(1250);
    expect(parseWeightG('360g')).toBe(360);
  });

  it.each(['.L', '1.2.3L', '0L', '-5L', 'L', 'InfinityL'])('容量 %s を読まない', (raw) => {
    expect(parseCapacityL(raw)).toBeNull();
  });

  it.each(['.mAh', '0mAh', '1.2.3mAh', '-1mAh'])('mAh %s を読まない', (raw) => {
    expect(parseCapacityMah(raw)).toBeNull();
  });

  it.each(['.W', '0W', '1.2.3W', '-65W'])('出力 %s を読まない', (raw) => {
    expect(parseWatt(raw)).toBeNull();
  });
});

describe('寸法パーサは 1 つでも不正なら全体を null にする', () => {
  it('正しい寸法は読める', () => {
    expect(parseLabeledSizeMm('W35×H55×D25cm')).toEqual([350, 550, 250]);
    expect(parseLabeledSizeMm('約W320×D200×H510mm')).toEqual([320, 510, 200]);
  });

  it.each([
    'W.×H55×D25cm',
    'W35×H.×D25cm',
    'W35×H55×D.cm',
    'W1.2.3×H55×D25cm',
    'W0×H55×D25cm',
    'W-35×H55×D25cm',
    'W35×H55cm',
    '55cm クラス',
  ])('%s を読まない', (raw) => {
    expect(parseLabeledSizeMm(raw)).toBeNull();
  });

  it('mm と cm が混在した寸法は推定せず null', () => {
    expect(parseLabeledSizeMm('W35cm×H550mm×D25cm')).toBeNull();
    expect(parseLabeledSizeMm('W320mm×H51cm×D200mm')).toBeNull();
  });

  it('単位が無ければ null', () => {
    expect(parseLabeledSizeMm('W35×H55×D25')).toBeNull();
  });
});

describe('換算・丸めの後も正で有限であることを検査する', () => {
  it('丸めて 0 になる重量を採らない', () => {
    expect(parseWeightG('0.0001kg')).toBeNull();
    expect(parseWeightG('0.1g')).toBeNull();
    expect(parseWeightG('0.4g')).toBeNull();
  });

  it('丸めて 1 以上になる重量は採る', () => {
    expect(parseWeightG('0.5g')).toBe(1);
    expect(parseWeightG('0.001kg')).toBe(1);
  });

  it('丸めて 0 になる寸法を採らない', () => {
    expect(parseLabeledSizeMm('W0.01×H55×D25cm')).toBeNull();
    expect(parseLabeledSizeMm('W0.1×H55×D25mm')).toBeNull();
    expect(parseLabeledSizeMm('W35×H0.04×D25mm')).toBeNull();
  });

  it('換算後に Infinity になる巨大値を採らない', () => {
    // 1e307 相当。入力自体は有限だが ×1000 で Infinity になる
    const huge = `1${'0'.repeat(307)}`;
    expect(Number.isFinite(Number(huge))).toBe(true);
    expect(parseWeightG(`${huge}kg`)).toBeNull();
  });

  it('換算後に Infinity になる巨大な寸法を採らない', () => {
    const huge = `1${'0'.repeat(308)}`;
    expect(parseLabeledSizeMm(`W${huge}×H55×D25cm`)).toBeNull();
  });

  it('通常の値は従来どおり成功する', () => {
    expect(parseWeightG('2.9kg')).toBe(2900);
    expect(parseWeightG('約1,250g')).toBe(1250);
    expect(parseWeightG('360g')).toBe(360);
    expect(parseLabeledSizeMm('W35×H55×D25cm')).toEqual([350, 550, 250]);
    expect(parseLabeledSizeMm('約W320×D200×H510mm')).toEqual([320, 510, 200]);
    expect(parseCapacityL('約30L')).toBe(30);
    expect(parseCapacityMah('12000mAh')).toBe(12000);
    expect(parseWatt('最大65W')).toBe(65);
  });
});

describe('寸法と無関係な単位を流用しない', () => {
  it('W/H/D に単位が付いていなければ、後半の単位を借りない', () => {
    expect(parseLabeledSizeMm('W35×H55×D25（梱包サイズは80cm）')).toBeNull();
    expect(parseLabeledSizeMm('W35×H55×D25（ストラップは800mm）')).toBeNull();
    expect(parseLabeledSizeMm('W35×H55×D25')).toBeNull();
  });

  it('W/H/D に単位が付いていれば、後半に別単位があっても読める', () => {
    expect(parseLabeledSizeMm('W35×H55×D25cm（梱包サイズは80cm）')).toEqual([350, 550, 250]);
    expect(parseLabeledSizeMm('W35×H55×D25cm（ストラップは800mm）')).toEqual([350, 550, 250]);
  });

  it('各ラベルに同じ単位が付いていれば読める', () => {
    expect(parseLabeledSizeMm('W35cm×H55cm×D25cm')).toEqual([350, 550, 250]);
    expect(parseLabeledSizeMm('W320mm×H510mm×D200mm')).toEqual([320, 510, 200]);
  });

  it('W/H/D に異なる単位が混在すれば null', () => {
    expect(parseLabeledSizeMm('W35cm×H550mm×D25cm')).toBeNull();
    expect(parseLabeledSizeMm('W320mm×H51cm×D200mm')).toBeNull();
  });

  it('同じラベルが複数あり曖昧なら null', () => {
    expect(parseLabeledSizeMm('W35×H55×D25cm / W40×H60×D30cm')).toBeNull();
    expect(parseLabeledSizeMm('W35×H55×D25cm 本体 W40cm')).toBeNull();
  });

  it('従来の正常な表記は成功する', () => {
    expect(parseLabeledSizeMm('W35×H55×D25cm')).toEqual([350, 550, 250]);
    expect(parseLabeledSizeMm('約W320×D200×H510mm')).toEqual([320, 510, 200]);
    expect(parseLabeledSizeMm('W35×H55×D25cm（ハンドル・キャスターを含む）')).toEqual([350, 550, 250]);
  });
});

describe('寸法の不明単位・部分単位を受理しない', () => {
  it('未対応の単位が付いていれば null', () => {
    expect(parseLabeledSizeMm('W35in×H55×D25cm')).toBeNull();
    expect(parseLabeledSizeMm('W35kg×H55×D25cm')).toBeNull();
    expect(parseLabeledSizeMm('W35m×H55×D25cm')).toBeNull();
  });

  it('一部だけに単位が付き、それがグループ末尾でなければ null', () => {
    expect(parseLabeledSizeMm('W35cm×H55×D25')).toBeNull();
    expect(parseLabeledSizeMm('W35×H55cm×D25')).toBeNull();
  });

  it('単位の直後に英数字が続けば null', () => {
    expect(parseLabeledSizeMm('W35×H55×D25cm2')).toBeNull();
    expect(parseLabeledSizeMm('W35×H55×D25mmX')).toBeNull();
  });

  it('グループ全体の単位が最後に 1 つ付く形は受理する', () => {
    expect(parseLabeledSizeMm('W35×H55×D25cm')).toEqual([350, 550, 250]);
    expect(parseLabeledSizeMm('W320×D200×H510mm')).toEqual([320, 510, 200]);
  });

  it('3 要素すべてに同じ単位が直接付く形は受理する', () => {
    expect(parseLabeledSizeMm('W35cm×H55cm×D25cm')).toEqual([350, 550, 250]);
    expect(parseLabeledSizeMm('W350mm×H550mm×D250mm')).toEqual([350, 550, 250]);
  });

  it('梱包サイズの単位を借りない（既存の回帰）', () => {
    expect(parseLabeledSizeMm('W35×H55×D25（梱包サイズは80cm）')).toBeNull();
    expect(parseLabeledSizeMm('W35×H55×D25cm（梱包サイズは80cm）')).toEqual([350, 550, 250]);
  });
});

describe('日本語・Unicode の寸法単位を単位なしとして受理しない', () => {
  it('日本語の単位を無視してグループ末尾の単位を適用しない', () => {
    expect(parseLabeledSizeMm('W35インチ×H55×D25cm')).toBeNull();
    expect(parseLabeledSizeMm('W35センチ×H55×D25cm')).toBeNull();
    expect(parseLabeledSizeMm('W35ミリ×H55×D25cm')).toBeNull();
  });

  it('Unicode の単位記号も拒否する', () => {
    expect(parseLabeledSizeMm('W35㎝×H55×D25cm')).toBeNull();
    expect(parseLabeledSizeMm('W35㎜×H55×D25cm')).toBeNull();
    expect(parseLabeledSizeMm('W35㌢×H55×D25cm')).toBeNull();
  });

  it('数値の直後に許可されない文字があれば拒否する', () => {
    expect(parseLabeledSizeMm('W35"×H55×D25cm')).toBeNull();
    expect(parseLabeledSizeMm('W35\u2033×H55×D25cm')).toBeNull();
    expect(parseLabeledSizeMm('W35%×H55×D25cm')).toBeNull();
  });

  it('日本語単位が末尾ラベルに付いていても拒否する', () => {
    expect(parseLabeledSizeMm('W35×H55×D25センチ')).toBeNull();
    expect(parseLabeledSizeMm('W35×H55×D25㎝')).toBeNull();
  });

  it('受理する 2 形式は維持する', () => {
    expect(parseLabeledSizeMm('W35×H55×D25cm')).toEqual([350, 550, 250]);
    expect(parseLabeledSizeMm('W35cm×H55cm×D25cm')).toEqual([350, 550, 250]);
    expect(parseLabeledSizeMm('W320×D200×H510mm')).toEqual([320, 510, 200]);
    expect(parseLabeledSizeMm('W350mm×H550mm×D250mm')).toEqual([350, 550, 250]);
    expect(parseLabeledSizeMm('約W320×D200×H510mm')).toEqual([320, 510, 200]);
    expect(parseLabeledSizeMm('W35×H55×D25cm（ハンドル・キャスターを含む）')).toEqual([350, 550, 250]);
  });

  it('既存の拒否条件を維持する', () => {
    expect(parseLabeledSizeMm('W35in×H55×D25cm')).toBeNull();       // 不明単位
    expect(parseLabeledSizeMm('W35cm×H550mm×D25cm')).toBeNull();    // 混在
    expect(parseLabeledSizeMm('W35cm×H55×D25')).toBeNull();         // 部分単位
    expect(parseLabeledSizeMm('W35×H55×D25cm2')).toBeNull();        // cm2
    expect(parseLabeledSizeMm('W35×H55×D25')).toBeNull();           // 単位なし
    expect(parseLabeledSizeMm('W35×H55×D25（梱包サイズは80cm）')).toBeNull(); // 単位を借りない
    expect(parseLabeledSizeMm('W35×H55×D25cm / W40×H60×D30cm')).toBeNull();  // 複数セット
  });
});

describe('clean() で不正な数値を正常値へ変換しない', () => {
  it('「約」は入力全体の先頭にある場合だけ許可する', () => {
    expect(parseWeightG('約2.9kg')).toBe(2900);
    expect(parseCapacityL('約30L')).toBe(30);
    expect(parseLabeledSizeMm('約W320×D200×H510mm')).toEqual([320, 510, 200]);
  });

  it('数字の途中にある「約」は必ず null', () => {
    expect(parseCapacityL('3約0L')).toBeNull();
    expect(parseWeightG('2約9kg')).toBeNull();
    expect(parseCapacityMah('120約00mAh')).toBeNull();
    expect(parseWatt('6約5W')).toBeNull();
    expect(parseLabeledSizeMm('W3約5×H55×D25cm')).toBeNull();
  });

  it('先頭以外に「約」があれば null', () => {
    expect(parseLabeledSizeMm('W35×H55×約D25cm')).toBeNull();
    expect(parseWeightG('2.9kg約')).toBeNull();
  });

  it('カンマは正しい 3 桁区切りだけ許可する', () => {
    expect(parseWeightG('1,250g')).toBe(1250);
    expect(parseWeightG('約1,250g')).toBe(1250);
    expect(parseCapacityMah('12,000mAh')).toBe(12000);
  });

  it('不正なカンマ区切りは null', () => {
    expect(parseWeightG('1,2,5,0g')).toBeNull();
    expect(parseWeightG('12,50g')).toBeNull();
    expect(parseWeightG('1,,250g')).toBeNull();
    expect(parseWeightG(',250g')).toBeNull();
    expect(parseWeightG('1,250,g')).toBeNull();
    expect(parseCapacityL('1,2,3L')).toBeNull();
    expect(parseLabeledSizeMm('W1,2,5,0×H55×D25mm')).toBeNull();
  });

  it('4 桁以上の正しい区切りも読める', () => {
    expect(parseWeightG('1,000,000g')).toBe(1000000);
  });
});

describe('寸法単位の後ろに未対応文字が続く場合を拒否する', () => {
  it('cm/mm 直後に Unicode 文字・単位記号が直結していたら null', () => {
    expect(parseLabeledSizeMm('W35×H55×D25cm²')).toBeNull();
    expect(parseLabeledSizeMm('W35×H55×D25cmセンチ')).toBeNull();
    expect(parseLabeledSizeMm('W35×H55×D25cm㎝')).toBeNull();
    expect(parseLabeledSizeMm('W35×H55×D25mm㎜')).toBeNull();
  });

  it('受理する寸法部分の直後は終端・空白・注記開始記号だけ', () => {
    expect(parseLabeledSizeMm('W35×H55×D25cm')).toEqual([350, 550, 250]);
    expect(parseLabeledSizeMm('W35×H55×D25cm（キャスター含む）')).toEqual([350, 550, 250]);
    expect(parseLabeledSizeMm('W35×H55×D25cm ※実測値')).toEqual([350, 550, 250]);
    expect(parseLabeledSizeMm('W35cm×H55cm×D25cm')).toEqual([350, 550, 250]);
  });

  it('既存の拒否条件を維持する', () => {
    expect(parseLabeledSizeMm('W35in×H55×D25cm')).toBeNull();
    expect(parseLabeledSizeMm('W35kg×H55×D25cm')).toBeNull();
    expect(parseLabeledSizeMm('W35インチ×H55×D25cm')).toBeNull();
    expect(parseLabeledSizeMm('W35センチ×H55×D25cm')).toBeNull();
    expect(parseLabeledSizeMm('W35㎝×H55×D25cm')).toBeNull();
    expect(parseLabeledSizeMm('W35cm×H550mm×D25cm')).toBeNull();
    expect(parseLabeledSizeMm('W35cm×H55×D25')).toBeNull();
    expect(parseLabeledSizeMm('W35×H55×D25cm2')).toBeNull();
    expect(parseLabeledSizeMm('W35×H55×D25')).toBeNull();
    expect(parseLabeledSizeMm('W35×H55×D25（梱包サイズは80cm）')).toBeNull();
  });
});

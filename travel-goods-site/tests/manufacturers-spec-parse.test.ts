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

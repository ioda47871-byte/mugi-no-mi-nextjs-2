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

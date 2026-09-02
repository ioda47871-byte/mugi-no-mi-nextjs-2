// tests/manufacturers-others.test.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { elecomAdapter } from '../src/lib/manufacturers/elecom';
import { ankerAdapter } from '../src/lib/manufacturers/anker';
import { adapterFor } from '../src/lib/manufacturers/registry';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFileSync(path.join(here, p), 'utf8');

type ProductRecord = {
  model: string;
  weightG: { value: number | null };
  outerSizeMm: { value: [number, number, number] | null };
  capacityL: { value: number | null };
  specs: Record<string, { value: string | number | boolean | null }>;
};
const allProducts: ProductRecord[] = ['backpacks', 'pouches', 'power-banks', 'suitcases']
  .flatMap((f) => JSON.parse(read(`../datasets/production/products/${f}.json`)) as ProductRecord[]);

const byModel = (model: string): ProductRecord => {
  const found = allProducts.find((p) => p.model === model);
  if (!found) throw new Error(`商品が見つかりません: ${model}`);
  return found;
};

const elecomHtml = read('fixtures/manufacturers/elecom-spec-list.html');
const ankerHtml = read('fixtures/manufacturers/anker-spec-list.html');

describe('ELECOM の仕様抽出', () => {
  it('登録済みの Fact と一致する', () => {
    const registered = byModel('BM-BPTRCSEPBK');
    const result = elecomAdapter.extract(elecomHtml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.weightG).toBe(registered.weightG.value);
    expect(result.spec.outerSizeMm).toEqual(registered.outerSizeMm.value);
    expect(result.spec.capacityL).toBe(registered.capacityL.value);
  });

  it('カンマ入りの質量を読める', () => {
    const result = elecomAdapter.extract(elecomHtml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.weightG).toBe(1250);
  });

  it('定義リストが無ければ no-spec-table', () => {
    expect(elecomAdapter.extract('<html><body><p>準備中</p></body></html>'))
      .toEqual({ ok: false, reason: 'no-spec-table' });
  });

  it('必須項目が欠けたら推定せず失敗を返す', () => {
    const withoutCapacity = elecomHtml.replace('<dt>容量</dt>\n      <dd>約30L</dd>', '');
    expect(elecomAdapter.extract(withoutCapacity))
      .toEqual({ ok: false, reason: 'required-field-missing' });
  });

  it('単位が読めなければ推定せず失敗を返す', () => {
    const broken = elecomHtml.replace('<dd>約1,250g</dd>', '<dd>約1.2キロ</dd>');
    expect(elecomAdapter.extract(broken)).toEqual({ ok: false, reason: 'unit-unparseable' });
  });

  it('capacityL を必須にする', () => {
    expect(elecomAdapter.requiredFields).toContain('capacityL');
  });

  it('換算後に 0 へ丸まる質量で ok: true にしない', () => {
    const broken = elecomHtml.replace('<dd>約1,250g</dd>', '<dd>0.1g</dd>');
    expect(elecomAdapter.extract(broken)).toEqual({ ok: false, reason: 'unit-unparseable' });
  });
});

describe('Anker の仕様抽出', () => {
  it('モバイルバッテリーは capacityL が null でも成功する', () => {
    const registered = byModel('A1335011');
    const result = ankerAdapter.extract(ankerHtml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.capacityL).toBeNull();
    expect(result.spec.weightG).toBe(registered.weightG.value);
    expect(result.spec.outerSizeMm).toEqual(registered.outerSizeMm.value);
  });

  it('capacityMah と maxOutputW が登録済みの specs と一致する', () => {
    const registered = byModel('A1335011');
    const result = ankerAdapter.extract(ankerHtml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.specs.capacityMah).toBe(registered.specs.capacityMah?.value);
    expect(result.spec.specs.maxOutputW).toBe(registered.specs.maxOutputW?.value);
  });

  it('公表されていない ratedWh を作らない', () => {
    const registered = byModel('A1335011');
    expect(registered.specs.ratedWh?.value).toBeNull();
    const result = ankerAdapter.extract(ankerHtml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.specs.ratedWh).toBeUndefined();
  });

  it('capacityL を必須にしない', () => {
    expect(ankerAdapter.requiredFields).not.toContain('capacityL');
    expect(ankerAdapter.requiredFields).toContain('weightG');
  });

  it('容量行があるのに単位を読めなければ黙って捨てず失敗を返す', () => {
    const broken = ankerHtml.replace('<td>12000mAh</td>', '<td>十二アンペア</td>');
    expect(ankerAdapter.extract(broken)).toEqual({ ok: false, reason: 'unit-unparseable' });
  });

  it('最大出力行があるのに単位を読めなければ黙って捨てず失敗を返す', () => {
    const broken = ankerHtml.replace('<td>最大65W</td>', '<td>高出力</td>');
    expect(ankerAdapter.extract(broken)).toEqual({ ok: false, reason: 'unit-unparseable' });
  });

  it('行そのものが無ければ公表なしとして省略する（失敗にしない）', () => {
    const withoutCapacity = ankerHtml.replace(/<tr>\s*<th>容量[\s\S]*?<\/tr>/, '');
    const result = ankerAdapter.extract(withoutCapacity);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.specs.capacityMah).toBeUndefined();
    expect(result.spec.specs.maxOutputW).toBe(65);
  });

  it('最大出力の行そのものが無くても成功する', () => {
    const withoutOutput = ankerHtml.replace(/<tr>\s*<th>最大出力[\s\S]*?<\/tr>/, '');
    const result = ankerAdapter.extract(withoutOutput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.specs.maxOutputW).toBeUndefined();
    expect(result.spec.specs.capacityMah).toBe(12000);
  });

  it('重量が欠けたら推定せず失敗を返す', () => {
    const withoutWeight = ankerHtml.replace(/<tr>\s*<th>重量[\s\S]*?<\/tr>/, '');
    expect(ankerAdapter.extract(withoutWeight))
      .toEqual({ ok: false, reason: 'required-field-missing' });
  });

  it('表が無ければ no-spec-table', () => {
    expect(ankerAdapter.extract('<html><body><p>準備中</p></body></html>'))
      .toEqual({ ok: false, reason: 'no-spec-table' });
  });

  it('換算後に 0 へ丸まる重量で ok: true にしない', () => {
    const broken = ankerHtml.replace('<td>約360g</td>', '<td>0.2g</td>');
    expect(ankerAdapter.extract(broken)).toEqual({ ok: false, reason: 'unit-unparseable' });
  });
});

describe('registry への組み込み', () => {
  it('adapterFor がスタブでなく実装を返す', () => {
    expect(adapterFor('elecom').extract(elecomHtml).ok).toBe(true);
    expect(adapterFor('anker').extract(ankerHtml).ok).toBe(true);
  });

  it('fixture に実サイトの本文を含めない（合成 HTML であることの確認）', () => {
    for (const html of [elecomHtml, ankerHtml]) {
      expect(html).toContain('テスト用の合成 HTML');
      expect(html.length).toBeLessThan(2500);
    }
  });
});

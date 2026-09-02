// tests/manufacturers-registry.test.ts
import { describe, expect, it } from 'vitest';
import { MANUFACTURER_IDS, adapterFor, normalizeBrand } from '../src/lib/manufacturers/registry';
import { makeSource } from './factories';

describe('brand の正規化', () => {
  it('現行 7 種類の brand をすべて正規化できる', () => {
    expect(normalizeBrand('エース（ACE）')).toBe('ace');
    expect(normalizeBrand('エース（ace. GENE LABEL）')).toBe('ace');
    expect(normalizeBrand('エース（ace. TOKYO LABEL）')).toBe('ace');
    expect(normalizeBrand('プロテカ（PROTECA）')).toBe('proteca');
    expect(normalizeBrand('ワールドトラベラー（World Traveler）')).toBe('world-traveler');
    expect(normalizeBrand('エレコム（ELECOM）')).toBe('elecom');
    expect(normalizeBrand('アンカー・ジャパン（Anker）')).toBe('anker');
  });

  it('未知のブランドは null。部分一致で解決しない', () => {
    expect(normalizeBrand('サンプルブランド')).toBeNull();
    expect(normalizeBrand('ACE Hardware')).toBeNull();
    expect(normalizeBrand('ace')).toBeNull();
    expect(normalizeBrand('')).toBeNull();
    expect(normalizeBrand('エース')).toBeNull();
  });

  it('メーカーIDはちょうど 5 つ', () => {
    expect([...MANUFACTURER_IDS]).toEqual(['ace', 'proteca', 'world-traveler', 'elecom', 'anker']);
  });
});

describe('アダプターの契約', () => {
  it('同じホストを共有しても manufacturerId は分離する', () => {
    expect(adapterFor('ace').allowedHosts).toEqual(['store.ace.jp']);
    expect(adapterFor('proteca').allowedHosts).toEqual(['store.ace.jp']);
    expect(adapterFor('ace').manufacturerId).toBe('ace');
    expect(adapterFor('proteca').manufacturerId).toBe('proteca');
    expect(adapterFor('world-traveler').manufacturerId).toBe('world-traveler');
  });

  it('すべてのメーカーにアダプターがあり、id が一致する', () => {
    for (const id of MANUFACTURER_IDS) {
      expect(adapterFor(id).manufacturerId).toBe(id);
      expect(adapterFor(id).allowedHosts.length).toBeGreaterThan(0);
      expect(adapterFor(id).requiredFields.length).toBeGreaterThan(0);
    }
  });

  it('既存 Source があればそれを第一候補にする', () => {
    const source = makeSource({ url: 'https://store.ace.jp/shop/g/g06936-01/' });
    const r = adapterFor('ace').findProductUrl('クレスタ2 06936', '35L / 01 ブラックヘアライン', [source]);
    expect(r).toEqual({ ok: true, url: 'https://store.ace.jp/shop/g/g06936-01/', basis: 'existing-source' });
  });

  it('許可ホスト外の既存 Source は第一候補にしない', () => {
    const other = makeSource({ url: 'https://example.invalid/g06936-01/' });
    const r = adapterFor('ace').findProductUrl('クレスタ2 06936', '35L / 01 ブラックヘアライン', [other]);
    // 既存 Source は使えないので決定的規則へ落ちる
    expect(r).toEqual({ ok: true, url: 'https://store.ace.jp/shop/g/g06936-01/', basis: 'deterministic-rule' });
  });

  it('既存 Source が無くても、品番とカラーコードが揃えば決定的に導ける', () => {
    const r = adapterFor('ace').findProductUrl('クレスタ2 06936', '35L / 01 ブラックヘアライン', []);
    expect(r).toEqual({ ok: true, url: 'https://store.ace.jp/shop/g/g06936-01/', basis: 'deterministic-rule' });
  });

  it('カラーコードが無ければ URL を推測しない', () => {
    const r = adapterFor('ace').findProductUrl('クレスタ2 06936', '35L / ブラック', []);
    expect(r).toEqual({ ok: false, reason: 'variant-code-missing' });
  });

  it('5 桁品番が無ければ URL を推測しない', () => {
    const r = adapterFor('ace').findProductUrl('クレスタ2', '35L / 01 ブラックヘアライン', []);
    expect(r).toEqual({ ok: false, reason: 'model-shape-unsupported' });
  });

  it('6 桁以上の数字列から 5 桁を切り出さない', () => {
    for (const model of ['123456', '1069360', '候補 123456', '069360', '0693600']) {
      expect(adapterFor('ace').findProductUrl(model, '35L / 01 ブラックヘアライン', []))
        .toEqual({ ok: false, reason: 'model-shape-unsupported' });
    }
  });

  it('独立した 5 桁品番なら導ける', () => {
    for (const model of ['06936', 'ACE 06936', 'クレスタ2 06936', '06936 スーツケース']) {
      expect(adapterFor('ace').findProductUrl(model, '35L / 01 ブラックヘアライン', [])).toEqual({
        ok: true, url: 'https://store.ace.jp/shop/g/g06936-01/', basis: 'deterministic-rule',
      });
    }
  });

  it('5 桁品番が 2 つ以上あれば曖昧なので導かない', () => {
    expect(adapterFor('ace').findProductUrl('06936 06937', '35L / 01 ブラックヘアライン', []))
      .toEqual({ ok: false, reason: 'model-shape-unsupported' });
  });

  it('6 桁以上でも既存 Source があれば第一候補にする（契約を変えない）', () => {
    const source = makeSource({ url: 'https://store.ace.jp/shop/g/g06936-01/' });
    expect(adapterFor('ace').findProductUrl('1069360', '35L / 01 ブラックヘアライン', [source])).toEqual({
      ok: true, url: 'https://store.ace.jp/shop/g/g06936-01/', basis: 'existing-source',
    });
  });

  it('ELECOM は model そのままで導ける', () => {
    expect(adapterFor('elecom').findProductUrl('BM-BPTRCSEPBK', '30L / ブラック', [])).toEqual({
      ok: true, url: 'https://www.elecom.co.jp/products/BM-BPTRCSEPBK.html', basis: 'deterministic-rule',
    });
  });

  it('ELECOM も model の形が合わなければ推測しない', () => {
    expect(adapterFor('elecom').findProductUrl('BM', '30L / ブラック', []))
      .toEqual({ ok: false, reason: 'model-shape-unsupported' });
  });

  it('Anker は model から URL を導出できない', () => {
    expect(adapterFor('anker').findProductUrl('A110DN11', '10000mAh / ブラック', []))
      .toEqual({ ok: false, reason: 'model-shape-unsupported' });
    expect(adapterFor('anker').findProductUrl('A1335011', '12000mAh / ブラック', []))
      .toEqual({ ok: false, reason: 'model-shape-unsupported' });
  });

  it('Anker でも既存 Source があれば使える', () => {
    const source = makeSource({ url: 'https://www.ankerjapan.com/products/a110d' });
    expect(adapterFor('anker').findProductUrl('A110DN11', '10000mAh / ブラック', [source])).toEqual({
      ok: true, url: 'https://www.ankerjapan.com/products/a110d', basis: 'existing-source',
    });
  });

  it('段階0 では公式検索を使わない', () => {
    for (const id of MANUFACTURER_IDS) {
      const r = adapterFor(id).findProductUrl('BM-BPTRCSEPBK', '30L / ブラック', []);
      if (r.ok) expect(r.basis).not.toBe('official-search');
    }
  });

  it('スタブの extract は取得できたことにしない', () => {
    for (const id of MANUFACTURER_IDS) {
      const result = adapterFor(id).extract('<html><body>仕様表なし</body></html>');
      expect(result.ok).toBe(false);
      expect(adapterFor(id).extractedRangeHash('<html></html>')).toBeNull();
    }
  });
});

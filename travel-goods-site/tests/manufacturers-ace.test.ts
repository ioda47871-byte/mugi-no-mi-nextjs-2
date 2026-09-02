// tests/manufacturers-ace.test.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { aceAdapter, protecaAdapter, worldTravelerAdapter } from '../src/lib/manufacturers/ace';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, 'fixtures/manufacturers/ace-spec-table.html'), 'utf8');

type ProductRecord = {
  id: string;
  weightG: { value: number | null };
  outerSizeMm: { value: [number, number, number] | null };
  capacityL: { value: number | null };
};
const suitcases = JSON.parse(
  fs.readFileSync(path.join(here, '../datasets/production/products/suitcases.json'), 'utf8'),
) as ProductRecord[];

describe('ACE 系の仕様抽出', () => {
  it('スペック表から重量・外寸・容量を取り出す', () => {
    const result = aceAdapter.extract(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.weightG).toBe(2900);
    expect(result.spec.outerSizeMm).toEqual([350, 550, 250]);
    expect(result.spec.capacityL).toBe(35);
    expect(result.spec.sizeBasis).toBe('with-handle-and-wheels');
  });

  it('抽出結果が登録済みの Fact と一致する（fixture に推測値を使っていない）', () => {
    const registered = suitcases.find((p) => p.id === 'ace-cresta2-06936-35l-black-hairline');
    expect(registered).toBeDefined();
    const result = aceAdapter.extract(html);
    expect(result.ok).toBe(true);
    if (!result.ok || !registered) return;
    expect(result.spec.weightG).toBe(registered.weightG.value);
    expect(result.spec.outerSizeMm).toEqual(registered.outerSizeMm.value);
    expect(result.spec.capacityL).toBe(registered.capacityL.value);
  });

  it('必須項目が欠けたら推定せず失敗を返す', () => {
    const withoutCapacity = html.replace(/<tr>\s*<th>容量[\s\S]*?<\/tr>/, '');
    expect(aceAdapter.extract(withoutCapacity)).toEqual({ ok: false, reason: 'required-field-missing' });
  });

  it('重量が欠けても失敗を返す', () => {
    const withoutWeight = html.replace(/<tr>\s*<th>本体重量[\s\S]*?<\/tr>/, '');
    expect(aceAdapter.extract(withoutWeight)).toEqual({ ok: false, reason: 'required-field-missing' });
  });

  it('スペック表そのものが無ければ no-spec-table', () => {
    expect(aceAdapter.extract('<html><body><p>準備中</p></body></html>'))
      .toEqual({ ok: false, reason: 'no-spec-table' });
  });

  it('単位が読めなければ推定せず失敗を返す', () => {
    // fixture 冒頭のコメントにも 2.9kg があるため、表のセルを指して置き換える
    const broken = html.replace('<td>2.9kg</td>', '<td>約3キロ前後</td>');
    expect(aceAdapter.extract(broken)).toEqual({ ok: false, reason: 'unit-unparseable' });
  });

  it('外寸の表記が変わったら推定せず失敗を返す', () => {
    const broken = html.replace('W35×H55×D25cm（ハンドル・キャスターを含む）', '55cm クラス');
    expect(aceAdapter.extract(broken)).toEqual({ ok: false, reason: 'unit-unparseable' });
  });

  it('スペック表の外側が変わってもハッシュは変わらない', () => {
    const changed = html.replace('</body>', '<p>キャンペーン中</p></body>');
    expect(aceAdapter.extractedRangeHash(changed)).toBe(aceAdapter.extractedRangeHash(html));
  });

  it('スペック表の中身が変わればハッシュも変わる', () => {
    const changed = html.replace('<td>35L</td>', '<td>36L</td>');
    expect(aceAdapter.extractedRangeHash(changed)).not.toBe(aceAdapter.extractedRangeHash(html));
  });

  it('スペック表が無ければハッシュは null', () => {
    expect(aceAdapter.extractedRangeHash('<html></html>')).toBeNull();
  });

  it('PROTECA と World Traveler は同じ抽出規則を共有する', () => {
    expect(protecaAdapter.extract(html)).toEqual(aceAdapter.extract(html));
    expect(worldTravelerAdapter.extract(html)).toEqual(aceAdapter.extract(html));
    expect(protecaAdapter.manufacturerId).toBe('proteca');
    expect(worldTravelerAdapter.manufacturerId).toBe('world-traveler');
    expect(aceAdapter.manufacturerId).toBe('ace');
  });

  it('fixture に実サイトの本文を含めない（合成 HTML であることの確認）', () => {
    expect(html).toContain('テスト用の合成 HTML');
    expect(html.length).toBeLessThan(2000);
  });
});

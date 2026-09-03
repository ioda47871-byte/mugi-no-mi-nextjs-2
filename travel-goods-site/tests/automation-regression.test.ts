// tests/automation-regression.test.ts
//
// 既存 15 リンクでの回帰確認。
//
// 目視確認済み（`verified` + `visual`）の 14 件が、状態が `replace` に達しても
// どの候補 Tier でも自動交換されず PR 止まりになることを、**本番データそのもの**で固定する。
// 設計書 8.4「異常確定まで保護する」を、実際に公開しているリンクに対して保証するテスト。
//
// これは Task 10 の実装に対する characterization / regression test なので、
// 追加時点から成功する（実装を人工的に壊して RED を作ることはしない）。
//
// **本番データは読み取りだけ。** 読み込み前後で内容が変わっていないことも検査する。
//
// 実装計画: docs/superpowers/plans/2026-09-02-travel-goods-automation-foundation.md Task 11
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { decideReplacement } from '../src/lib/automation/link-state';
import type { LinkState } from '../src/lib/automation/link-state';
import type { Tier } from '../src/lib/automation/tier';
import { merchantLinkSchema } from '../src/lib/catalog/schema';
import { isHumanVerifiedLink } from '../src/lib/rakuten/match';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(here, '../datasets/production/merchants/rakuten.json');

/** 読み取り専用。型アサーションを使わず、公開スキーマでそのまま検証して読む。 */
const raw = fs.readFileSync(DATA_PATH, 'utf8');
const links = z.array(merchantLinkSchema).parse(JSON.parse(raw));

const digestBefore = crypto.createHash('sha256').update(raw).digest('hex');
const statBefore = fs.statSync(DATA_PATH);

/** 目視確認が済んでいない 1 件。自動交換の保護対象ではない。 */
const UNVERIFIED_PRODUCT_ID = 'ace-crestas-09162-60l-gunmetallic';

const TIERS: readonly Tier[] = ['S', 'A', 'B'];
const STATES: readonly LinkState[] = ['healthy', 'uncertain', 'hidden', 'replace', 'manual-hold'];

describe('既存 15 リンクの構成', () => {
  it('本番の楽天リンクは 15 件', () => {
    expect(links).toHaveLength(15);
  });

  it('目視確認済み（verified + visual）は 14 件', () => {
    expect(links.filter(isHumanVerifiedLink)).toHaveLength(14);
  });

  it('未確認は 1 件だけ', () => {
    const unverified = links.filter((link) => link.status === 'unverified');
    expect(unverified).toHaveLength(1);
    expect(unverified.map((link) => link.productId)).toEqual([UNVERIFIED_PRODUCT_ID]);
  });

  it('14 件 + 1 件で全件を説明できる（他の状態は無い）', () => {
    const verified = links.filter(isHumanVerifiedLink).length;
    const unverified = links.filter((link) => link.status === 'unverified').length;
    expect(verified + unverified).toBe(links.length);
  });
});

describe('目視確認済み 14 件は自動交換されない', () => {
  it('replace に達しても、どの候補 Tier でも pr-only', () => {
    const verified = links.filter(isHumanVerifiedLink);
    expect(verified).toHaveLength(14);

    for (const link of verified) {
      for (const tier of TIERS) {
        const decision = decideReplacement(link, 'replace', tier);
        expect(decision.action, `${link.productId} / tier=${tier}`).toBe('pr-only');
        expect(decision).toEqual({ action: 'pr-only', reason: 'human-verified' });
      }
    }
  });

  it('replace 以外の状態では、そもそも交換候補にならない（hold）', () => {
    for (const link of links.filter(isHumanVerifiedLink)) {
      for (const state of STATES.filter((s) => s !== 'replace')) {
        for (const tier of TIERS) {
          expect(decideReplacement(link, state, tier).action, `${link.productId} / ${state}`)
            .toBe('hold');
        }
      }
    }
  });

  it('14 件すべてが同じ理由（human-verified）で守られている', () => {
    const reasons = links
      .filter(isHumanVerifiedLink)
      .map((link) => decideReplacement(link, 'replace', 'S'));
    expect(reasons).toHaveLength(14);
    expect(new Set(reasons.map((d) => ('reason' in d ? d.reason : null)))).toEqual(
      new Set(['human-verified']),
    );
  });
});

describe('未確認の 1 件は保護対象ではない', () => {
  const target = links.find((link) => link.productId === UNVERIFIED_PRODUCT_ID);

  it('データに存在する', () => {
    expect(target).toBeDefined();
  });

  it('isHumanVerifiedLink が false', () => {
    expect(isHumanVerifiedLink(target)).toBe(false);
  });

  it('status は unverified、verificationMethod は visual ではない', () => {
    expect(target?.status).toBe('unverified');
    expect(target?.verificationMethod ?? null).not.toBe('visual');
  });

  it('replace に達したら Tier ごとの通常判定に従う（pr-only にはならない）', () => {
    if (target === undefined) throw new Error(`${UNVERIFIED_PRODUCT_ID} が見つかりません`);
    expect(decideReplacement(target, 'replace', 'S')).toEqual({ action: 'replace-now' });
    expect(decideReplacement(target, 'replace', 'A')).toEqual({ action: 'replace-after-recheck' });
    expect(decideReplacement(target, 'replace', 'B')).toEqual({
      action: 'hold',
      reason: 'candidate-tier-b',
    });
  });
});

describe('本番データを書き換えない', () => {
  afterAll(() => {
    const after = fs.readFileSync(DATA_PATH, 'utf8');
    expect(crypto.createHash('sha256').update(after).digest('hex')).toBe(digestBefore);
    expect(fs.statSync(DATA_PATH).mtimeMs).toBe(statBefore.mtimeMs);
  });

  it('読み込んだ内容のハッシュを記録している', () => {
    expect(digestBefore).toMatch(/^[0-9a-f]{64}$/);
  });

  it('テスト終了時点でもファイルは同一（afterAll で再検査）', () => {
    const now = fs.readFileSync(DATA_PATH, 'utf8');
    expect(crypto.createHash('sha256').update(now).digest('hex')).toBe(digestBefore);
  });
});

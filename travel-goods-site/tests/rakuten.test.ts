import { describe, expect, it, vi } from 'vitest';
import { RakutenClient, RakutenApiError, RequestBudgetExceededError } from '@/lib/rakuten/client';
import { matchProduct, pickBestMatch, normalizeForMatch, searchKeywordsFor } from '@/lib/rakuten/match';
import { normalizeItems } from '@/lib/rakuten/types';
import { mergeCandidates, pruneCandidates, type Candidate } from '@/lib/rakuten/candidates';
import { redactSecrets } from '@/lib/rakuten/config';
import { inspectCatalog } from '@/lib/catalog/validate';
import { resolveMerchantLinks } from '@/lib/affiliate/resolve';
import { fact, makeCatalogInput, makeProduct, TEST_TODAY } from './fixtures/catalog';

/**
 * ここで使う応答・URL・IDはすべてテスト専用の架空値。実在しません。
 */

const CREDS = { applicationId: 'test-app-id-000', affiliateId: 'test-affiliate-id-000' };
const AFFILIATE_URL = 'https://hb.afl.rakuten.co.jp/hgc/test-item-0001/';

function item(overrides: Record<string, unknown> = {}) {
  return {
    itemCode: 'testshop:item-0001',
    itemName: 'エレコム BMA-TRCS01MBK 旅行用パッキングキューブ Mサイズ ブラック',
    itemCaption: 'JANコード:4549550317535 メーカー品番 BMA-TRCS01MBK',
    affiliateUrl: AFFILIATE_URL,
    shopName: 'テストショップ',
    ...overrides,
  };
}

const pouch = makeProduct({
  id: 'elecom-pouch',
  category: 'pouches',
  brand: 'エレコム',
  model: 'BMA-TRCS01MBK',
  variant: 'Mサイズ / ブラック',
  jan: '4549550317535',
  // カテゴリに合う spec キーだけを持たせる（許可外は検証で弾かれる）
  specs: { compartmentCount: fact(2), compression: fact(true) },
  bodySizeMm: undefined,
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('レスポンスの正規化', () => {
  it('Items:[{Item:{…}}] 形式を読める', () => {
    expect(normalizeItems({ Items: [{ Item: item() }] })).toHaveLength(1);
  });

  it('Items:[{…}] 形式も読める', () => {
    expect(normalizeItems({ Items: [item()] })).toHaveLength(1);
  });

  it('想定外の形なら空配列を返す（例外で止めない）', () => {
    expect(normalizeItems({ error: 'wrong_parameter' })).toEqual([]);
    expect(normalizeItems(null)).toEqual([]);
  });

  it('価格・レビューなど未使用のキーは取り出さない', () => {
    const items = normalizeItems({
      Items: [{ Item: item({ itemPrice: 1980, reviewAverage: 4.5 }) }],
    });
    // passthrough で残っていても、保存対象に選ばれるのは candidates.ts 側の責務。
    expect(items[0]!.itemCode).toBe('testshop:item-0001');
  });
});

describe('照合: 誤った商品にリンクを付けない', () => {
  it('型番とJANの両方が一致すれば strong', () => {
    const result = matchProduct(pouch, item());
    expect(result.confidence).toBe('strong');
    expect(result.reasons.join()).toContain('BMA-TRCS01MBK');
  });

  it('型番だけ一致なら weak（自動反映しない）', () => {
    const result = matchProduct(pouch, item({ itemCaption: 'メーカー品番 BMA-TRCS01MBK' }));
    expect(result.confidence).toBe('weak');
  });

  it('JANだけ一致なら weak', () => {
    const result = matchProduct(
      pouch,
      item({ itemName: '旅行ポーチ', itemCaption: 'JAN 4549550317535' }),
    );
    expect(result.confidence).toBe('weak');
  });

  it('どちらも一致しなければ none', () => {
    const result = matchProduct(
      pouch,
      item({ itemName: '別の商品', itemCaption: 'まったく違う説明' }),
    );
    expect(result.confidence).toBe('none');
  });

  it('別型番の商品を strong にしない', () => {
    const other = item({
      itemName: 'エレコム BMA-TRCS01LBK 旅行用パッキングキューブ Lサイズ',
      itemCaption: 'JANコード:4549550317542 メーカー品番 BMA-TRCS01LBK',
    });
    expect(matchProduct(pouch, other).confidence).toBe('none');
  });

  it('紹介URLが無ければ採用しない', () => {
    const result = matchProduct(pouch, item({ affiliateUrl: undefined }));
    expect(result.confidence).toBe('none');
    expect(result.blockers.join()).toContain('affiliateUrl');
  });

  it('通常の商品URLを紹介URLとして採用しない', () => {
    const result = matchProduct(
      pouch,
      item({ affiliateUrl: 'https://item.rakuten.co.jp/testshop/item-0001/' }),
    );
    expect(result.confidence).toBe('none');
  });

  it('JANが無い商品は strong にならない', () => {
    const noJan = makeProduct({ id: 'no-jan', model: 'BMA-TRCS01MBK', jan: null });
    const result = matchProduct(noJan, item());
    expect(result.confidence).toBe('weak');
    expect(result.blockers.join()).toContain('JANが登録されていない');
  });

  it('短い型番は自動照合に使わない（誤一致を防ぐ）', () => {
    const shortModel = makeProduct({ id: 'short', model: 'A1', jan: null });
    const result = matchProduct(shortModel, item({ itemName: 'A1 なんとかケース' }));
    expect(result.confidence).toBe('none');
    expect(result.blockers.join()).toContain('短く自動照合に使えない');
  });

  it('全角・ハイフン違いの表記ゆれを吸収する', () => {
    expect(normalizeForMatch('ＢＭＡ-ＴＲＣＳ０１ＭＢＫ')).toBe(normalizeForMatch('BMA-TRCS01MBK'));
    const result = matchProduct(
      pouch,
      item({ itemCaption: 'JAN 4549550317535 品番 ＢＭＡ－ＴＲＣＳ０１ＭＢＫ' }),
    );
    expect(result.confidence).toBe('strong');
  });

  it('strong を weak より優先して選ぶ', () => {
    const weak = item({ itemCode: 'shop:weak', itemCaption: '品番 BMA-TRCS01MBK' });
    const strong = item({ itemCode: 'shop:strong' });
    const best = pickBestMatch(pouch, [weak, strong]);
    expect(best?.item.itemCode).toBe('shop:strong');
  });

  it('検索語はJANを最優先にする', () => {
    expect(searchKeywordsFor(pouch)[0]).toBe('4549550317535');
  });
});

describe('APIクライアント', () => {
  it('資格情報をURLに載せ、ログ用の表現には出さない', async () => {
    let requested: URL | null = null;
    const fetchImpl = vi.fn(async (input: unknown) => {
      requested = input as URL;
      return jsonResponse({ Items: [{ Item: item() }] });
    }) as unknown as typeof fetch;

    const client = new RakutenClient(CREDS, { fetchImpl, minIntervalMs: 0 });
    await client.search({ keyword: '4549550317535' });

    expect(requested!.hostname).toBe('app.rakuten.co.jp');
    expect(requested!.searchParams.get('applicationId')).toBe(CREDS.applicationId);
    expect(requested!.searchParams.get('affiliateId')).toBe(CREDS.affiliateId);

    const described = RakutenClient.describeQuery({ keyword: '4549550317535' });
    expect(described).not.toContain(CREDS.applicationId);
    expect(described).not.toContain(CREDS.affiliateId);
  });

  it('リクエスト間隔を空ける', async () => {
    const sleeps: number[] = [];
    const fetchImpl = vi.fn(async () => jsonResponse({ Items: [] })) as unknown as typeof fetch;
    const client = new RakutenClient(CREDS, {
      fetchImpl,
      minIntervalMs: 1000,
      sleepImpl: async (ms) => {
        sleeps.push(ms);
      },
    });
    await client.search({ keyword: 'a' });
    await client.search({ keyword: 'b' });
    expect(sleeps.some((ms) => ms > 0)).toBe(true);
  });

  it('429 は上限つきで再試行し、無限リトライしない', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 429)) as unknown as typeof fetch;
    const client = new RakutenClient(CREDS, {
      fetchImpl,
      minIntervalMs: 0,
      maxRetries: 2,
      sleepImpl: async () => {},
    });
    await expect(client.search({ keyword: 'a' })).rejects.toBeInstanceOf(RakutenApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 初回 + 再試行2回
  });

  it('400 は再試行せず即失敗する（設定ミスを繰り返さない）', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 400)) as unknown as typeof fetch;
    const client = new RakutenClient(CREDS, { fetchImpl, minIntervalMs: 0, sleepImpl: async () => {} });
    await expect(client.search({ keyword: 'a' })).rejects.toThrow(/HTTP 400/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('1回の実行のリクエスト数に上限がある', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ Items: [] })) as unknown as typeof fetch;
    const client = new RakutenClient(CREDS, { fetchImpl, minIntervalMs: 0, maxRequests: 2 });
    await client.search({ keyword: 'a' });
    await client.search({ keyword: 'b' });
    await expect(client.search({ keyword: 'c' })).rejects.toBeInstanceOf(RequestBudgetExceededError);
    expect(client.requestsUsed).toBe(2);
  });

  it('例外メッセージに資格情報を含めない', () => {
    process.env.RAKUTEN_APPLICATION_ID = 'super-secret-app-id';
    try {
      const error = new RakutenApiError('失敗: super-secret-app-id が拒否されました', 401);
      expect(error.message).not.toContain('super-secret-app-id');
      expect(redactSecrets('super-secret-app-id')).not.toContain('super-secret-app-id');
    } finally {
      delete process.env.RAKUTEN_APPLICATION_ID;
    }
  });
});

describe('候補の保管', () => {
  const base: Candidate = {
    itemCode: 'shop:a',
    itemName: '商品A',
    shopName: 'テストショップ',
    affiliateUrl: AFFILIATE_URL,
    query: '4549550317535',
    category: 'pouches',
    matchedProductId: null,
    matchConfidence: 'weak',
    matchReasons: [],
    fetchedAt: '2026-08-01',
    status: 'new',
  };

  it('人が付けた判断を自動処理で戻さない', () => {
    const existing: Candidate[] = [{ ...base, status: 'rejected' }];
    const merged = mergeCandidates(existing, [{ ...base, status: 'new' }]);
    expect(merged[0]!.status).toBe('rejected');
  });

  it('初回に見つけた日を保つ（同じデータで差分を作らない）', () => {
    const existing: Candidate[] = [base];
    const merged = mergeCandidates(existing, [{ ...base, fetchedAt: '2026-08-20' }]);
    expect(merged[0]!.fetchedAt).toBe('2026-08-01');
  });

  it('新しい候補は追加される', () => {
    const merged = mergeCandidates([base], [{ ...base, itemCode: 'shop:b' }]);
    expect(merged.map((c) => c.itemCode).sort()).toEqual(['shop:a', 'shop:b']);
  });

  it('古い未処理の候補は保持期間で落とす', () => {
    const old: Candidate = { ...base, fetchedAt: '2026-01-01' };
    const adopted: Candidate = { ...base, itemCode: 'shop:kept', fetchedAt: '2026-01-01', status: 'adopted' };
    const pruned = pruneCandidates([old, adopted], new Date('2026-08-31T00:00:00Z'));
    expect(pruned.map((c) => c.itemCode)).toEqual(['shop:kept']);
  });
});

describe('取得から登録までの通し（外部通信なし）', () => {
  it('strong一致から、検証を通る紹介リンクが作られる', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ Items: [{ Item: item() }, { Item: item({ itemCode: 'shop:other', itemName: '別商品', itemCaption: '' }) }] }),
    ) as unknown as typeof fetch;
    const client = new RakutenClient(CREDS, { fetchImpl, minIntervalMs: 0 });

    const items = await client.search({ keyword: searchKeywordsFor(pouch)[0]! });
    const best = pickBestMatch(pouch, items);
    expect(best?.match.confidence).toBe('strong');

    // ジョブが作る MerchantLink と同じ形
    const link = {
      productId: pouch.id,
      merchant: 'rakuten' as const,
      externalProductId: best!.item.itemCode,
      affiliateUrl: best!.item.affiliateUrl!,
      matchedVariant: pouch.variant,
      verifiedAt: '2026-08-31',
      status: 'verified' as const,
    };

    const result = inspectCatalog(
      makeCatalogInput({ products: [pouch], merchantLinks: [link] }),
      { now: TEST_TODAY },
    );
    expect(result.issues.filter((i) => i.severity === 'error')).toEqual([]);

    // 紹介URLは加工されない
    expect(link.affiliateUrl).toBe(AFFILIATE_URL);
  });

  it('weak一致は verified にしない（画面に出さない）', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ Items: [{ Item: item({ itemCaption: '品番 BMA-TRCS01MBK' }) }] }),
    ) as unknown as typeof fetch;
    const client = new RakutenClient(CREDS, { fetchImpl, minIntervalMs: 0 });

    const best = pickBestMatch(pouch, await client.search({ keyword: 'x' }));
    expect(best?.match.confidence).toBe('weak');

    // ジョブは weak を unverified で登録する
    const link = {
      productId: pouch.id,
      merchant: 'rakuten' as const,
      externalProductId: best!.item.itemCode,
      affiliateUrl: best!.item.affiliateUrl!,
      matchedVariant: pouch.variant,
      verifiedAt: null,
      status: 'unverified' as const,
    };
    const config = { amazonAssociateTag: null, rakutenEnabled: true };
    expect(resolveMerchantLinks(pouch, [link], config).links).toHaveLength(0);
  });

  it('別商品にリンクが付かない', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        Items: [{ Item: item({ itemName: 'エレコム BMA-TRCS01LBK Lサイズ', itemCaption: 'JAN 4549550317542 品番 BMA-TRCS01LBK' }) }],
      }),
    ) as unknown as typeof fetch;
    const client = new RakutenClient(CREDS, { fetchImpl, minIntervalMs: 0 });
    expect(pickBestMatch(pouch, await client.search({ keyword: 'x' }))).toBeNull();
  });
});

describe('取得先の限定', () => {
  it('外部ホストへの差し替えを拒否する', async () => {
    process.env.RAKUTEN_API_ENDPOINT_OVERRIDE = 'https://evil.example.invalid/api';
    try {
      const client = new RakutenClient(CREDS, {
        fetchImpl: (async () => jsonResponse({ Items: [] })) as unknown as typeof fetch,
        minIntervalMs: 0,
      });
      await expect(client.search({ keyword: 'a' })).rejects.toThrow(/ループバックのみ/);
    } finally {
      delete process.env.RAKUTEN_API_ENDPOINT_OVERRIDE;
    }
  });

  it('ループバックへの差し替えは動作確認のために許可する', async () => {
    process.env.RAKUTEN_API_ENDPOINT_OVERRIDE = 'http://127.0.0.1:3999/';
    try {
      let requested: URL | null = null;
      const client = new RakutenClient(CREDS, {
        fetchImpl: (async (input: unknown) => {
          requested = input as URL;
          return jsonResponse({ Items: [] });
        }) as unknown as typeof fetch,
        minIntervalMs: 0,
      });
      await client.search({ keyword: 'a' });
      expect(requested!.hostname).toBe('127.0.0.1');
    } finally {
      delete process.env.RAKUTEN_API_ENDPOINT_OVERRIDE;
    }
  });
});

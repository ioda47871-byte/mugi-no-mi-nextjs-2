import { describe, expect, it } from 'vitest';
import { buildAmazonUrl } from '@/lib/affiliate/amazon';
import { isRakutenAffiliateUrl } from '@/lib/affiliate/rakuten';
import { resolveMerchantLinks } from '@/lib/affiliate/resolve';
import type { MerchantConfig } from '@/config/merchants';
import { makeMerchantLink, makeProduct } from './fixtures/catalog';

/**
 * 以下の ASIN・tag・URL はテスト専用の架空値であり、本番データには使用しない。
 */

const bothEnabled: MerchantConfig = { amazonAssociateTag: 'example-22', rakutenEnabled: true };
const amazonUnset: MerchantConfig = { amazonAssociateTag: null, rakutenEnabled: true };

describe('buildAmazonUrl: 形式検証', () => {
  it('紹介IDが未設定ならリンクを生成しない', () => {
    expect(buildAmazonUrl('B0TEST0001')).toBeNull();
    expect(buildAmazonUrl('B0TEST0001', '')).toBeNull();
    expect(buildAmazonUrl('B0TEST0001', null)).toBeNull();
  });

  it('商品番号をURLとして注入できない', () => {
    expect(buildAmazonUrl('https://example.invalid', 'example-22')).toBeNull();
    expect(buildAmazonUrl('javascript:alert(1)', 'example-22')).toBeNull();
    expect(buildAmazonUrl('B0TEST0001/../evil', 'example-22')).toBeNull();
  });

  it('紹介IDに不正な文字が入ればリンクを生成しない', () => {
    expect(buildAmazonUrl('B0TEST0001', 'example 22')).toBeNull();
    expect(buildAmazonUrl('B0TEST0001', 'example&tag=other-22')).toBeNull();
  });

  it('指定された公式商品URLとtagを生成する', () => {
    const href = buildAmazonUrl('B0TEST0001', 'example-22');
    expect(href).not.toBeNull();
    const url = new URL(href!);
    expect(url.origin).toBe('https://www.amazon.co.jp');
    expect(url.pathname).toBe('/dp/B0TEST0001/ref=nosim');
    expect(url.searchParams.get('tag')).toBe('example-22');
  });
});

describe('楽天の紹介URL判定', () => {
  it('通常の商品URLは紹介URLとして扱わない', () => {
    expect(isRakutenAffiliateUrl('https://item.rakuten.co.jp/shop/item/')).toBe(false);
  });

  it('HTTPや不正スキームを拒否する', () => {
    expect(isRakutenAffiliateUrl('http://hb.afl.rakuten.co.jp/x')).toBe(false);
    expect(isRakutenAffiliateUrl('javascript:alert(1)')).toBe(false);
    expect(isRakutenAffiliateUrl(null)).toBe(false);
  });

  it('公式のアフィリエイトホストだけを許可する', () => {
    expect(isRakutenAffiliateUrl('https://hb.afl.rakuten.co.jp/hgc/xxxx/')).toBe(true);
    expect(isRakutenAffiliateUrl('https://a.r10.to/xxxx')).toBe(true);
    expect(isRakutenAffiliateUrl('https://hb.afl.rakuten.co.jp.example.invalid/x')).toBe(false);
  });
});

describe('resolveMerchantLinks: 表示してよいリンクだけ返す', () => {
  const product = makeProduct();

  it('紹介IDが未設定ならAmazonボタンを出さない', () => {
    const result = resolveMerchantLinks(product, [makeMerchantLink()], amazonUnset);
    expect(result.links).toHaveLength(0);
    expect(result.suppressed).toContainEqual({ merchant: 'amazon', reason: 'merchant-not-configured' });
  });

  it('照合前(unverified)の販売先は表示しない', () => {
    const link = makeMerchantLink({ status: 'unverified', verifiedAt: null });
    const result = resolveMerchantLinks(product, [link], bothEnabled);
    expect(result.links).toHaveLength(0);
    expect(result.suppressed).toContainEqual({ merchant: 'amazon', reason: 'not-verified' });
  });

  it('販売終了(unavailable)の販売先は表示しない', () => {
    const link = makeMerchantLink({ status: 'unavailable' });
    expect(resolveMerchantLinks(product, [link], bothEnabled).links).toHaveLength(0);
  });

  it('容量違い（バリエーション不一致）の販売先は表示しない', () => {
    const link = makeMerchantLink({ matchedVariant: '48L / 別サイズ' });
    const result = resolveMerchantLinks(product, [link], bothEnabled);
    expect(result.links).toHaveLength(0);
    expect(result.suppressed).toContainEqual({ merchant: 'amazon', reason: 'variant-mismatch' });
  });

  it('別商品のリンクを混入させない', () => {
    const link = makeMerchantLink({ productId: 'p-other-product' });
    expect(resolveMerchantLinks(product, [link], bothEnabled).links).toHaveLength(0);
  });

  it('不正ASINならリンクを出さない', () => {
    const link = makeMerchantLink({ externalProductId: 'javascript:alert(1)' });
    const result = resolveMerchantLinks(product, [link], bothEnabled);
    expect(result.links).toHaveLength(0);
    expect(result.suppressed).toContainEqual({ merchant: 'amazon', reason: 'invalid-url' });
  });

  it('任意の外部URLをCTAにできない', () => {
    const link = makeMerchantLink({
      merchant: 'rakuten',
      externalProductId: 'shop:item',
      affiliateUrl: 'https://evil.example.invalid/redirect?to=rakuten',
    });
    const result = resolveMerchantLinks(product, [link], bothEnabled);
    expect(result.links).toHaveLength(0);
    expect(result.suppressed).toContainEqual({ merchant: 'rakuten', reason: 'invalid-url' });
  });

  it('条件を満たすリンクだけを返す', () => {
    const links = [
      makeMerchantLink(),
      makeMerchantLink({
        merchant: 'rakuten',
        externalProductId: 'testshop:item-0001',
        affiliateUrl: 'https://hb.afl.rakuten.co.jp/hgc/test/',
      }),
    ];
    const result = resolveMerchantLinks(product, links, bothEnabled);
    expect(result.links.map((l) => l.merchant).sort()).toEqual(['amazon', 'rakuten']);
    const amazon = result.links.find((l) => l.merchant === 'amazon')!;
    expect(new URL(amazon.href).searchParams.get('tag')).toBe('example-22');
    expect(result.suppressed).toHaveLength(0);
  });

  it('片方だけ確認できた場合は1つだけ返す', () => {
    const links = [
      makeMerchantLink(),
      makeMerchantLink({ merchant: 'rakuten', status: 'unverified', affiliateUrl: null }),
    ];
    const result = resolveMerchantLinks(product, links, bothEnabled);
    expect(result.links.map((l) => l.merchant)).toEqual(['amazon']);
  });

  it('リンクが1件も無くても例外にならない', () => {
    const result = resolveMerchantLinks(product, [], bothEnabled);
    expect(result.links).toHaveLength(0);
    expect(result.suppressed.map((s) => s.merchant).sort()).toEqual(['amazon', 'rakuten']);
  });
});

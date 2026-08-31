import { isRakutenAffiliateUrl } from '@/lib/affiliate/rakuten';
import type { Product } from '@/lib/catalog/types';
import type { RakutenItem } from './types';

/**
 * 楽天の検索結果と、登録済み商品の照合。
 *
 * 一番大事な判断はここ。誤った商品にリンクを付けないための基準です。
 *
 *   strong … 型番とJANの両方が販売ページの文言に含まれる
 *             → 「確認済み商品の低リスクな更新」として自動反映してよい（計画書 12-3節）
 *   weak   … 型番かJANの片方だけ一致
 *             → 候補として保存するが、人が確認するまで表示しない
 *   none   … どちらも一致しない → 採用しない
 *
 * 型番・JANのどちらも持たない商品は、自動照合の対象外にします。
 * キーワードが似ているだけで結びつけません。
 */

export type MatchConfidence = 'strong' | 'weak' | 'none';

export type MatchResult = {
  confidence: MatchConfidence;
  /** 一致した根拠（画面ではなく運用ログ・候補ファイルに残す）。 */
  reasons: string[];
  /** 一致しなかった理由。 */
  blockers: string[];
};

/** 全角→半角、記号・空白の除去、大文字化。型番表記のゆれを吸収する。 */
export function normalizeForMatch(value: string): string {
  return value
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .toUpperCase()
    .replace(/[\s\-_/‐-‒–—―ー・．.]/g, '');
}

/** 販売ページ側の照合対象テキスト。商品名と説明文のみ。 */
function haystack(item: RakutenItem): string {
  return normalizeForMatch(`${item.itemName} ${item.itemCaption ?? ''}`);
}

export function matchProduct(product: Product, item: RakutenItem): MatchResult {
  const reasons: string[] = [];
  const blockers: string[] = [];
  const text = haystack(item);

  const model = normalizeForMatch(product.model);
  // 型番が短すぎると誤一致するため、自動照合の対象にしない。
  const modelUsable = model.length >= 6;
  const modelHit = modelUsable && text.includes(model);
  if (modelHit) reasons.push(`型番 ${product.model} が販売ページの文言に含まれる`);
  else if (!modelUsable) blockers.push(`型番 ${product.model} が短く自動照合に使えない`);
  else blockers.push(`型番 ${product.model} が販売ページの文言に見つからない`);

  const jan = product.jan ? normalizeForMatch(product.jan) : null;
  const janHit = Boolean(jan && text.includes(jan));
  if (janHit) reasons.push(`JAN ${product.jan} が販売ページの文言に含まれる`);
  else if (!jan) blockers.push('商品にJANが登録されていない');
  else blockers.push(`JAN ${product.jan} が販売ページの文言に見つからない`);

  // 紹介URLが無い、または許可ホスト外なら採用しない。
  if (!isRakutenAffiliateUrl(item.affiliateUrl)) {
    blockers.push('affiliateUrl が無いか、許可されたホストではない（affiliateId の設定を確認）');
    return { confidence: 'none', reasons, blockers };
  }

  if (modelHit && janHit) return { confidence: 'strong', reasons, blockers: [] };
  if (modelHit || janHit) return { confidence: 'weak', reasons, blockers };
  return { confidence: 'none', reasons, blockers };
}

/**
 * 候補の中から最良の1件を選ぶ。
 * strong が複数ある場合は最初の1件（楽天の返却順）を採る。
 * 順位付けの根拠を持たないため、独自の優劣は付けません。
 */
export function pickBestMatch(
  product: Product,
  items: RakutenItem[],
): { item: RakutenItem; match: MatchResult } | null {
  const scored = items
    .map((item) => ({ item, match: matchProduct(product, item) }))
    .filter((entry) => entry.match.confidence !== 'none');

  return (
    scored.find((entry) => entry.match.confidence === 'strong') ??
    scored.find((entry) => entry.match.confidence === 'weak') ??
    null
  );
}

/** 商品から自動照合に使える検索語を作る。JANを最優先にする。 */
export function searchKeywordsFor(product: Product): string[] {
    const keywords: string[] = [];
  if (product.jan) keywords.push(product.jan);
  if (normalizeForMatch(product.model).length >= 6) keywords.push(product.model);
  return keywords;
}

/**
 * ACE・PROTECA・World Traveler の共通処理。
 *
 * 3 ブランドは store.ace.jp を共有するが manufacturerId は分離する
 * （取得成功率の集計とリコール告知の参照先がブランドごとに異なるため）。
 * URL の解決規則だけをここで共有する。
 */
import type { Source } from '@/lib/catalog/types';
import type { UrlResolution } from './types';

export const ACE_HOST = 'store.ace.jp';

/** model 内の 5 桁品番。例: 「クレスタ2 06936」→ 06936 */
const MODEL_NUMBER_RE = /(\d{5})/;
/** variant 先頭側の 2 桁カラーコード。例: 「35L / 01 ブラックヘアライン」→ 01 */
const COLOR_CODE_RE = /(?:^|\/\s*)(\d{2})\s/;

/**
 * 5 桁品番と 2 桁カラーコードが**両方**取れたときだけ URL を導く。
 * どちらか欠ければ推測せずに失敗を返す。
 */
export function resolveAceUrl(model: string, variant: string): UrlResolution {
  const modelNumber = MODEL_NUMBER_RE.exec(model)?.[1];
  if (modelNumber === undefined) return { ok: false, reason: 'model-shape-unsupported' };
  const colorCode = COLOR_CODE_RE.exec(variant)?.[1];
  if (colorCode === undefined) return { ok: false, reason: 'variant-code-missing' };
  return {
    ok: true,
    url: `https://${ACE_HOST}/shop/g/g${modelNumber}-${colorCode}/`,
    basis: 'deterministic-rule',
  };
}

/** 既存 Source のうち、許可ホストのものを登録順に第一候補として返す。 */
export function firstKnownSourceUrl(
  knownSources: readonly Source[],
  allowedHosts: readonly string[],
): string | null {
  for (const source of knownSources) {
    let host: string;
    try {
      host = new URL(source.url).host;
    } catch {
      continue;
    }
    if (allowedHosts.includes(host)) return source.url;
  }
  return null;
}

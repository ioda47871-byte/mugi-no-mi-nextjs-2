/**
 * 本番成果物に出てはいけない文字列（`npm run check:release -- --out out` の走査対象）。
 *
 * ここに載るのは「配信物に混ざっていたら公開を止めるべきもの」だけ。
 * テスト値・デモ文言・旧称・旧予定ドメインなど、外から見て誤りになるものを列挙する。
 * 秘密情報は値が環境変数にしか無いので、この一覧ではなく走査側で個別に扱う。
 */
export type ForbiddenOutputPattern = { pattern: RegExp; label: string };

/**
 * 当初予定していたドメイン。正式ドメインは `tabimono-hikaku.com` に変更したため、
 * こちらが配信物へ出てはいけない。
 * この検査ファイル自身が「旧ドメインを含むファイル」にならないよう、文字列は分割して持つ。
 */
export const RETIRED_DOMAIN = ['tabimono-hikaku', 'jp'].join('.');

export const FORBIDDEN_OUTPUT_PATTERNS: ForbiddenOutputPattern[] = [
  { pattern: /example\.invalid/i, label: 'テスト用ドメイン example.invalid' },
  { pattern: /デモデータ|デモ用の架空|架空メーカー/, label: 'デモデータの文言' },
  { pattern: /B0TEST\d{4}/, label: 'テスト用ASIN' },
  { pattern: /example-22/, label: 'テスト用アソシエイトタグ' },
  { pattern: /【未記入】|TODO:/, label: '下書きの未記入マーカー' },
  { pattern: /旅じたくガイド/, label: '旧サイト名 旅じたくガイド' },
  { pattern: /https:\/\/[^\s"'<>]*vercel\.app/i, label: 'Vercel URL' },
  {
    pattern: new RegExp(RETIRED_DOMAIN.replace('.', '\\.'), 'i'),
    label: `旧予定ドメイン ${RETIRED_DOMAIN}（正式ドメインは .com）`,
  },
];

/** 走査対象1ファイル分の本文から、該当した禁止パターンのラベルを返す。 */
export function findForbiddenOutput(content: string): string[] {
  return FORBIDDEN_OUTPUT_PATTERNS.filter(({ pattern }) => pattern.test(content)).map(({ label }) => label);
}

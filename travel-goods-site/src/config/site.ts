/**
 * サイト設定。名称・URL・公開モードを 1 か所に集約する（計画書 1節・8節）。
 *
 * 重要:
 * - 「仮称」と「正式名称」を混同しない。正式名称・商標・ドメインは未確認。
 * - 公開用の運営者情報は、ユーザーから公開用として提供された値だけを使う。
 *   未提供なら null のままにし、画面には「未設定」と表示する（架空の値を入れない）。
 */

export type SiteMode = 'preview' | 'production';

function env(name: string): string | null {
  const raw = process.env[name];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeBaseUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      return null;
    }
    return url.origin + url.pathname.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export const SITE_MODE: SiteMode = env('SITE_MODE') === 'production' ? 'production' : 'preview';

/** 仮称。正式名称が決まったら SITE_NAME で上書きする。 */
export const PROVISIONAL_SITE_NAME = '旅じたくガイド';

export const siteConfig = {
  /** 表示名。SITE_NAME 未設定なら仮称。 */
  name: env('SITE_NAME') ?? PROVISIONAL_SITE_NAME,
  /** 名称が仮称のままかどうか。画面上の注記に使う。 */
  nameIsProvisional: env('SITE_NAME') === null,
  tagline: '旅の荷物を、軽く、迷わず。',
  description:
    '重さ・サイズ・容量から、2〜3泊の旅行に合う持ちものを比較して選べるサイトです。メーカー公表仕様を横並びにして、確認できた範囲と不明な項目を分けて掲載します。',
  /** 正規URL。未設定ならプレビュー扱いで相対リンク運用にする。 */
  baseUrl: normalizeBaseUrl(env('SITE_URL')),
  mode: SITE_MODE,
  isProduction: SITE_MODE === 'production',
  /** 公開運営者情報（未提供なら null） */
  operatorName: env('PUBLIC_OPERATOR_NAME'),
  contactEmail: env('PUBLIC_CONTACT_EMAIL'),
  /** GA4 測定ID（未設定なら計測タグを出力しない） */
  gaMeasurementId: env('NEXT_PUBLIC_GA_ID'),
  locale: 'ja_JP',
  language: 'ja',
} as const;

/**
 * 検索エンジンへの露出方針。
 * プレビューは常に noindex。本番でも SITE_URL がなければ noindex のままにする。
 */
export const shouldAllowIndexing = siteConfig.isProduction && siteConfig.baseUrl !== null;

/** canonical / sitemap 用の絶対URL。baseUrl 未設定時は null（canonical を出さない）。 */
export function absoluteUrl(path: string): string | null {
  if (!siteConfig.baseUrl) return null;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${siteConfig.baseUrl}${suffix}`;
}

/** 公開前に埋めるべき設定の一覧。about ページと check:release が同じ情報源を使う。 */
export function missingLaunchSettings(): string[] {
  const missing: string[] = [];
  if (siteConfig.nameIsProvisional) missing.push('SITE_NAME（正式名称。現在は仮称を表示中）');
  if (!siteConfig.baseUrl) missing.push('SITE_URL（正規URL。canonical・サイトマップに必要）');
  if (!siteConfig.operatorName) missing.push('PUBLIC_OPERATOR_NAME（公開用の運営者名）');
  if (!siteConfig.contactEmail) missing.push('PUBLIC_CONTACT_EMAIL（公開用の問い合わせ先）');
  return missing;
}

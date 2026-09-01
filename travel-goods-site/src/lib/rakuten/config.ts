/**
 * 楽天ウェブサービスの資格情報（Phase 2 の取得ジョブ用）。
 *
 * 約束:
 * - `NEXT_PUBLIC_` を付けない。ビルド成果物にもクライアントJSにも入れない。
 * - 値をログ・エラーメッセージ・Git に出さない。有無だけを報告する。
 * - サイト本体（src/app 配下）からは読み込まない。CLI とジョブからのみ使う。
 */

export type RakutenCredentials = {
  /** 楽天ウェブサービスのアプリID。 */
  applicationId: string;
  /** アプリIDと共に必要。URLではなく accessKey ヘッダーで送信する。 */
  accessKey: string;
  /** アフィリエイトID。これが無いと affiliateUrl は返らない。 */
  affiliateId: string;
};

export type CredentialStatus =
  | { ok: true; credentials: RakutenCredentials }
  | { ok: false; missing: string[] };

function read(name: string): string | null {
  const raw = process.env[name];
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return value.length > 0 ? value : null;
}

export function readRakutenCredentials(): CredentialStatus {
  const applicationId = read('RAKUTEN_APPLICATION_ID');
  const accessKey = read('RAKUTEN_ACCESS_KEY');
  const affiliateId = read('RAKUTEN_AFFILIATE_ID');

  const missing: string[] = [];
  if (!applicationId) missing.push('RAKUTEN_APPLICATION_ID');
  if (!accessKey) missing.push('RAKUTEN_ACCESS_KEY');
  if (!affiliateId) missing.push('RAKUTEN_AFFILIATE_ID');
  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    credentials: { applicationId: applicationId as string, accessKey: accessKey as string, affiliateId: affiliateId as string },
  };
}

/**
 * APIリクエストの送信元として名乗るサイト（Referer）。
 *
 * 楽天ウェブサービスのアプリ登録には「許可されたWebサイト」欄があり、
 * 「APIリクエストは、登録されているWebサイトからのみ受け付けます」と案内されています。
 * 取得ジョブは GitHub Actions などサイト外から動くため、
 * 登録済みのドメインを Referer として明示できるようにします。
 *
 * **必ず、自分が登録し所有しているドメインを設定してください。**
 * 他人のサイトを名乗ることはできません。未設定なら Referer を送りません。
 */
export function readApiReferer(): string | null {
  const raw = read('RAKUTEN_API_REFERER');
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  } catch {
    return null;
  }
  // URL として妥当かだけを見て、**設定された文字列をそのまま送る**。
  // new URL().toString() は末尾スラッシュを補ってしまい、登録したURLと
  // 1文字違いになる。楽天側が完全一致で照合している場合に効く。
  return raw;
}

/**
 * 送信元のオリジン（scheme://host[:port]）。
 *
 * 現行の楽天APIは、サーバーからの呼び出しに対して **Origin ヘッダー** で
 * 送信元を判定する。Referer だけでは
 * `REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING` で拒否される。
 * Origin は仕様上パス・末尾スラッシュを含まないため、設定値から組み立てる。
 */
export function readApiOrigin(): string | null {
  const raw = read('RAKUTEN_API_REFERER');
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** 自動実行の有効化フラグ。既定は false（計画書 12-3節）。 */
export function isAutomationEnabled(): boolean {
  return read('AUTOMATION_ENABLED') === 'true';
}

/**
 * ログや例外に資格情報が混ざっていないかを確かめる。
 * 出力前に必ず通す。
 */
export function redactSecrets(text: string): string {
  let output = text;
  for (const name of ['RAKUTEN_APPLICATION_ID', 'RAKUTEN_AFFILIATE_ID', 'RAKUTEN_ACCESS_KEY']) {
    const value = read(name);
    if (value && value.length >= 4) {
      output = output.split(value).join(`«${name}»`);
    }
  }
  return output;
}

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
  const affiliateId = read('RAKUTEN_AFFILIATE_ID');

  const missing: string[] = [];
  if (!applicationId) missing.push('RAKUTEN_APPLICATION_ID');
  if (!affiliateId) missing.push('RAKUTEN_AFFILIATE_ID');
  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    credentials: { applicationId: applicationId as string, affiliateId: affiliateId as string },
  };
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

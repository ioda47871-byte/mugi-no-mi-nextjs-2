import { headers } from 'next/headers';
import { createHmac } from 'node:crypto';
import { ContactConfigError } from './errors';

const MIN_SECRET_LENGTH = 32;
const MAX_IP_LENGTH = 45; // IPv6の最大表記長を考慮

let cachedSecret: string | undefined;

/**
 * CONTACT_RATE_LIMIT_SECRETの検証は、モジュール読み込み時ではなく
 * 実際にhashIp()が呼ばれた時点(=お問い合わせフォームが実際に送信された時点)まで
 * 遅延させている。/contact ページ自体は静的プリレンダリング対象のため、
 * モジュールの読み込みだけでこの検証を即時実行してしまうと、
 * ビルド時(実際のフォーム送信が発生しない場面)に環境変数が無いだけで
 * ビルド自体が失敗してしまう。実行時の一時的な障害ではなく構成ミスとして
 * 扱う点(fail openの対象にしない)は変わらない。
 */
function getRateLimitSecret(): string {
  if (cachedSecret) return cachedSecret;

  const secret = process.env.CONTACT_RATE_LIMIT_SECRET;
  if (!secret || secret.trim().length < MIN_SECRET_LENGTH) {
    throw new ContactConfigError(
      `CONTACT_RATE_LIMIT_SECRETが未設定、または短すぎます(${MIN_SECRET_LENGTH}文字以上のランダムな値を設定してください)。`,
    );
  }
  cachedSecret = secret;
  return cachedSecret;
}

/**
 * Vercel環境でのIP取得優先順位:
 *   1. x-real-ip
 *   2. x-forwarded-for の先頭の値
 *   3. どちらも取得できなければ 'unknown'
 *
 * Vercelのエッジがリクエストを直接終端し、クライアントが送ってきた値を
 * 実際の接続元IPで上書きするため、これらのヘッダーはクライアント側から
 * 偽装できない前提に立っている。将来Vercelの前段に別のCDN/プロキシを
 * 追加した場合はこの前提が崩れるため、その際は見直しが必要。
 */
export function getClientIp(): string {
  const headerList = headers();

  const realIp = headerList.get('x-real-ip');
  const normalizedRealIp = normalizeIp(realIp);
  if (normalizedRealIp) return normalizedRealIp;

  const forwardedFor = headerList.get('x-forwarded-for');
  const first = forwardedFor?.split(',')[0];
  const normalizedForwarded = normalizeIp(first ?? null);
  if (normalizedForwarded) return normalizedForwarded;

  return 'unknown';
}

function normalizeIp(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_IP_LENGTH) return null;
  return trimmed;
}

/**
 * HMAC-SHA256でIP(または'unknown'固定文字列)をハッシュ化する。
 * 生IPはSupabase/Upstashを含め、どこにも保存・送信しない。
 * 単純なSHA-256ではなくHMACにしているのは、IPv4アドレス空間の
 * 総当たりによる逆引き(照合表攻撃)を防ぐため。
 */
export function hashIp(ip: string): string {
  return createHmac('sha256', getRateLimitSecret()).update(ip).digest('hex');
}

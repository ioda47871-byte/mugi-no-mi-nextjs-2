import 'server-only';

export interface InstagramRefreshResult {
  accessToken: string;
  expiresAt: Date;
}

/**
 * Instagram長期アクセストークンをリフレッシュする。
 *
 * 公式エンドポイント:
 *   GET https://graph.instagram.com/refresh_access_token
 *     ?grant_type=ig_refresh_token
 *     &access_token={現在の長期アクセストークン}
 *
 * トークンは発行(または前回のリフレッシュ)から24時間以上経過していないと
 * リフレッシュできない(Instagram側の仕様)。このリフレッシュ自体は
 * Vercel Cron(30日ごと)からのみ呼び出す想定のため、通常この制約に
 * 抵触することはない。
 *
 * 更新前・更新後のトークンの値は、この関数の戻り値以外
 * (ログ・例外メッセージ等)には一切含めない。失敗時もレスポンス本文は
 * 読み取らず、ステータスコードのみを例外メッセージに含める。
 */
export async function refreshInstagramToken(currentAccessToken: string): Promise<InstagramRefreshResult> {
  const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(currentAccessToken)}`;

  const response = await fetch(url, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Instagramトークンのリフレッシュに失敗しました: HTTP ${response.status}`);
  }

  const json = (await response.json()) as { access_token?: string; expires_in?: number };

  if (!json.access_token || typeof json.expires_in !== 'number') {
    throw new Error('Instagramトークンのリフレッシュ応答の形式が不正です。');
  }

  const expiresAt = new Date(Date.now() + json.expires_in * 1000);

  return { accessToken: json.access_token, expiresAt };
}

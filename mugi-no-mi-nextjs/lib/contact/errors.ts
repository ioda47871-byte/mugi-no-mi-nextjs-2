/**
 * 環境変数の未設定・不正な形式など「構成そのものの問題」を表すエラー。
 * Upstashへの一時的な通信障害・タイムアウトとは意図的に区別しており、
 * 呼び出し側(app/contact/actions.ts)はこのエラーだけを別扱いする
 * (構成ミスは静かにfail openさせず、送信を停止してログに残す)。
 */
export class ContactConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContactConfigError';
  }
}

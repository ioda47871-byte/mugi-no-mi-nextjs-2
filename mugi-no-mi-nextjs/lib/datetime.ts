/**
 * 日本時間(JST)⇔ISO(UTC)の変換ユーティリティ。
 * ----------------------------------------------------------------
 * お知らせの公開日時・公開終了日時は、管理画面では常に「日本時間」として
 * 直感的に入力・表示できるようにし、DBには常にUTCのtimestamptz(ISO文字列)
 * として保存する。
 *
 * サーバーの実行環境(ローカル/Vercel Preview/Vercel Production)は
 * タイムゾーン設定がそれぞれ異なりうる(Node.jsのデフォルトTZに依存する
 * `new Date('2026-08-10T09:00')` のような「タイムゾーン情報なしの文字列」の
 * 解釈はサーバーのローカルタイムゾーンに依存してしまい、環境によって
 * 公開開始・終了時刻が変わってしまうバグの温床になる)。
 *
 * そのため、このファイルの関数は必ず明示的にオフセット(+09:00)または
 * timeZone: 'Asia/Tokyo' を指定し、サーバーの実行タイムゾーンに一切依存しない
 * 形で変換する。これにより、ローカル開発・Vercel Preview・Vercel Production・
 * Supabase(常にUTCで保存)のどこで実行しても同じ結果になる。
 * ----------------------------------------------------------------
 */

const JST_TIME_ZONE = 'Asia/Tokyo';

/**
 * <input type="datetime-local">の値("YYYY-MM-DDTHH:mm"、タイムゾーン情報なし)を、
 * 「日本時間の壁時計時刻」として解釈し、UTCのISO文字列に変換する。
 * 空文字列(未入力)の場合はnullを返す(expires_atの「空欄=無期限」に対応)。
 */
export function parseJstDatetimeLocalToIso(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;

  const hasSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(trimmed);
  const hasMinutes = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed);
  if (!hasSeconds && !hasMinutes) return null;

  const withSeconds = hasSeconds ? trimmed : `${trimmed}:00`;
  // 明示的に+09:00を付与することで、サーバーのローカルタイムゾーンに
  // 一切依存せずJSTとして解釈させる。
  const date = new Date(`${withSeconds}+09:00`);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

/** UTCのISO文字列を、<input type="datetime-local">用の"YYYY-MM-DDTHH:mm"(JST表記)に変換する */
export function formatIsoToJstDatetimeLocal(iso: string): string {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: JST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** 現在時刻を、<input type="datetime-local">用の"YYYY-MM-DDTHH:mm"(JST表記)で返す(新規作成フォームの初期値用) */
export function nowAsJstDatetimeLocal(): string {
  return formatIsoToJstDatetimeLocal(new Date().toISOString());
}

/** UTCのISO文字列を、日本時間の表示用文字列("2026年8月10日"、withTime指定で時刻も)に整形する */
export function formatIsoToJstDisplay(iso: string, options: { withTime?: boolean } = {}): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: JST_TIME_ZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...(options.withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(new Date(iso));
}

import { readApiReferer, redactSecrets, type RakutenCredentials } from './config';
import { normalizeItems, type RakutenItem } from './types';

/**
 * 楽天商品検索APIのクライアント（取得ジョブ専用）。
 *
 * 守っていること（計画書 12-3節）:
 * - 取得先は許可ホストのみ。任意のURLを叩けない。
 * - レート制限を守る（既定 1リクエスト/秒）。
 * - 429・一時エラーは回数制限つきで再試行し、無限リトライしない。
 * - 1回の実行で投げるリクエスト数に上限を設ける。
 * - 資格情報をログ・例外メッセージに出さない。
 */

export const RAKUTEN_API_HOST = 'app.rakuten.co.jp';
export const RAKUTEN_SEARCH_ENDPOINT =
  'https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601';

export type SearchParams = {
  /** 検索語。JAN・型番・キーワードなど。 */
  keyword: string;
  /** 1ページあたりの件数（楽天APIの上限は30）。 */
  hits?: number;
  page?: number;
  /** ジャンルID（指定するとそのジャンル内を検索）。 */
  genreId?: string;
};

export type ClientOptions = {
  /** リクエスト間隔(ms)。既定 1000。 */
  minIntervalMs?: number;
  /** 1回の実行で許す最大リクエスト数。既定 30。 */
  maxRequests?: number;
  /** 再試行の最大回数。既定 2（合計3回まで）。 */
  maxRetries?: number;
  /** 1リクエストのタイムアウト(ms)。既定 15000。 */
  timeoutMs?: number;
  /** テスト用の差し替え。 */
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
};

export class RakutenApiError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    // 万一の混入に備え、メッセージから資格情報を除去する。
    super(redactSecrets(message));
    this.name = 'RakutenApiError';
    this.status = status;
  }
}

export class RequestBudgetExceededError extends Error {
  constructor(limit: number) {
    super(`1回の実行のリクエスト上限(${limit})に達しました。範囲を狭めて再実行してください。`);
    this.name = 'RequestBudgetExceededError';
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class RakutenClient {
  private readonly credentials: RakutenCredentials;
  private readonly minIntervalMs: number;
  private readonly maxRequests: number;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleepImpl: (ms: number) => Promise<void>;

  private requestCount = 0;
  private lastRequestAt = 0;

  constructor(credentials: RakutenCredentials, options: ClientOptions = {}) {
    this.credentials = credentials;
    this.minIntervalMs = options.minIntervalMs ?? 1000;
    this.maxRequests = options.maxRequests ?? 30;
    this.maxRetries = options.maxRetries ?? 2;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleepImpl = options.sleepImpl ?? defaultSleep;
  }

  get requestsUsed(): number {
    return this.requestCount;
  }

  /** 資格情報を含まない、ログに出してよいURL表現。 */
  static describeQuery(params: SearchParams): string {
    const parts = [`keyword=${params.keyword}`];
    if (params.genreId) parts.push(`genreId=${params.genreId}`);
    if (params.page) parts.push(`page=${params.page}`);
    return `${RAKUTEN_SEARCH_ENDPOINT}?${parts.join('&')}（資格情報は省略）`;
  }

  /**
   * 取得先を決める。
   *
   * 本番は app.rakuten.co.jp のみ。
   * 例外として RAKUTEN_API_ENDPOINT_OVERRIDE を認めるが、
   * **ループバック（127.0.0.1 / localhost）に限る**。
   * 資格情報なしでジョブの動作を確認するための口で、
   * 任意の外部ホストへ取得しに行けるようにはしない。
   */
  private static resolveEndpoint(): URL {
    const override = process.env.RAKUTEN_API_ENDPOINT_OVERRIDE?.trim();
    if (!override) return new URL(RAKUTEN_SEARCH_ENDPOINT);

    let url: URL;
    try {
      url = new URL(override);
    } catch {
      throw new RakutenApiError('RAKUTEN_API_ENDPOINT_OVERRIDE がURLとして不正です', null);
    }
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      throw new RakutenApiError(
        `RAKUTEN_API_ENDPOINT_OVERRIDE はループバックのみ許可します（指定: ${url.hostname}）`,
        null,
      );
    }
    return url;
  }

  private buildUrl(params: SearchParams): URL {
    const url = RakutenClient.resolveEndpoint();
    const allowed =
      url.hostname === RAKUTEN_API_HOST ||
      url.hostname === '127.0.0.1' ||
      url.hostname === 'localhost';
    if (!allowed) {
      throw new RakutenApiError(`許可されていない取得先です: ${url.hostname}`, null);
    }
    url.searchParams.set('applicationId', this.credentials.applicationId);
    // affiliateId を渡したときだけ affiliateUrl が返る。
    url.searchParams.set('affiliateId', this.credentials.affiliateId);
    url.searchParams.set('format', 'json');
    url.searchParams.set('keyword', params.keyword);
    url.searchParams.set('hits', String(Math.min(params.hits ?? 20, 30)));
    if (params.page) url.searchParams.set('page', String(params.page));
    if (params.genreId) url.searchParams.set('genreId', params.genreId);
    return url;
  }

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (this.lastRequestAt > 0 && elapsed < this.minIntervalMs) {
      await this.sleepImpl(this.minIntervalMs - elapsed);
    }
    this.lastRequestAt = Date.now();
  }

  async search(params: SearchParams): Promise<RakutenItem[]> {
    if (this.requestCount >= this.maxRequests) {
      throw new RequestBudgetExceededError(this.maxRequests);
    }

    const url = this.buildUrl(params);
    let attempt = 0;

    for (;;) {
      await this.throttle();
      this.requestCount += 1;

      let response: Response;
      try {
        const referer = readApiReferer();
        response = await this.fetchImpl(url, {
          signal: AbortSignal.timeout(this.timeoutMs),
          headers: {
            accept: 'application/json',
            // 楽天のアプリ登録「許可されたWebサイト」に合わせて送信元を名乗る。
            // 自分が登録・所有しているドメインだけを設定すること。
            ...(referer ? { referer } : {}),
          },
        });
      } catch (error) {
        // ネットワーク障害・タイムアウト
        if (attempt >= this.maxRetries) {
          throw new RakutenApiError(`取得に失敗しました: ${(error as Error).message}`, null);
        }
        attempt += 1;
        await this.sleepImpl(this.backoffMs(attempt));
        continue;
      }

      if (response.ok) {
        const body: unknown = await response.json();
        return normalizeItems(body);
      }

      // 429（レート超過）と 5xx のみ再試行する。400番台の他は設定ミスなので即失敗。
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= this.maxRetries) {
        throw new RakutenApiError(
          `楽天APIがエラーを返しました (HTTP ${response.status})。` +
            (response.status === 400
              ? ' パラメータかアプリIDを確認してください。'
              : response.status === 429
                ? ' レート制限に達しました。時間をおいて再実行してください。'
                : ''),
          response.status,
        );
      }

      attempt += 1;
      await this.sleepImpl(this.backoffMs(attempt));
    }
  }

  private backoffMs(attempt: number): number {
    // 2s, 4s（上限つき。無限に伸ばさない）
    return Math.min(2000 * 2 ** (attempt - 1), 8000);
  }
}

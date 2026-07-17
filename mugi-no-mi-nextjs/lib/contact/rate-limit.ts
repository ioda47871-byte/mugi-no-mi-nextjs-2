import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { ContactConfigError } from './errors';

/**
 * @upstash/ratelimit標準のtimeoutオプション。
 * Upstashへの通信がこの時間内に完了しない場合、ライブラリ自身が
 * success: true, reason: 'timeout' を返し、自動的にfail openする
 * (公式ドキュメントで案内されている標準機構)。自前でPromise.race等の
 * タイムアウト処理を実装する必要はない。
 */
const REDIS_TIMEOUT_MS = 2000;

type RateLimitWindow = `${number} ${'s' | 'm' | 'h' | 'd'}`;

interface WindowLimit {
  limit: number;
  window: RateLimitWindow;
}

export interface ContactRateLimitConfig {
  /** Redisキーの接頭辞。例: "contact:v1"。将来方式を変えるときはバージョンだけ上げる */
  prefixBase: string;
  normal: { minute: WindowLimit; hour: WindowLimit; day: WindowLimit };
  unknown: { minute: WindowLimit; day: WindowLimit };
}

/**
 * 本番運用の制限値。
 * normal: 通常のIPハッシュに対する制限(1分1回・1時間3回・24時間5回)。
 * unknown: IPを取得できなかった場合の共有バケット。より厳しい制限
 *          (1分1回・24時間3回)を適用し、1時間の中間tierは設けない。
 */
export const PRODUCTION_RATE_LIMIT_CONFIG: ContactRateLimitConfig = {
  prefixBase: 'contact:v1',
  normal: {
    minute: { limit: 1, window: '1 m' },
    hour: { limit: 3, window: '1 h' },
    day: { limit: 5, window: '24 h' },
  },
  unknown: {
    minute: { limit: 1, window: '1 m' },
    day: { limit: 3, window: '24 h' },
  },
};

function getRedisClient(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !/^https:\/\/.+/.test(url)) {
    throw new ContactConfigError(
      'UPSTASH_REDIS_REST_URLが未設定、またはhttps://から始まる形式ではありません。',
    );
  }
  if (!token || token.trim().length === 0) {
    throw new ContactConfigError('UPSTASH_REDIS_REST_TOKENが未設定です。');
  }

  return new Redis({ url, token });
}

/**
 * レート制限インスタンス群を生成する。
 *
 * 本番の呼び出し(getLimiters内)はデフォルト引数(PRODUCTION_RATE_LIMIT_CONFIG)を
 * 使うが、この関数自体は redis と config を受け取る純粋な形にしているため、
 * scripts/test-rate-limit.ts から短いウィンドウ・専用prefixを渡して
 * 動作確認できる。本番の定数を書き換えて戻し忘れる、という運用リスクを避けるための設計。
 */
export function createContactRateLimiters(
  redis: Redis,
  config: ContactRateLimitConfig = PRODUCTION_RATE_LIMIT_CONFIG,
) {
  const make = (suffix: string, def: WindowLimit) =>
    new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(def.limit, def.window),
      prefix: `${config.prefixBase}:${suffix}`,
      timeout: REDIS_TIMEOUT_MS,
    });

  return {
    normal: {
      minute: make('1m', config.normal.minute),
      hour: make('1h', config.normal.hour),
      day: make('24h', config.normal.day),
    },
    unknown: {
      minute: make('unknown:1m', config.unknown.minute),
      day: make('unknown:24h', config.unknown.day),
    },
  };
}

let cachedLimiters: ReturnType<typeof createContactRateLimiters> | undefined;

function getLimiters() {
  if (!cachedLimiters) {
    // getRedisClient()が投げるContactConfigErrorは、ここでは捕まえず
    // そのまま呼び出し元(checkContactRateLimitのtryブロックの外)へ伝播させる。
    const redis = getRedisClient();
    cachedLimiters = createContactRateLimiters(redis);
  }
  return cachedLimiters;
}

export interface RateLimitResult {
  allowed: boolean;
  reason?: 'too_soon' | 'hourly_limit' | 'daily_limit' | 'rate_limit_unavailable';
}

async function limitAndLog(limiter: Ratelimit, ipHash: string): Promise<boolean> {
  const result = await limiter.limit(ipHash);
  if (result.success && result.reason === 'timeout') {
    console.warn('[contact] Upstashへの接続がタイムアウトしたため、この回はfail openで許可しました。');
  }
  return result.success;
}

/**
 * IPハッシュに対するレート制限を判定する。
 *
 * isUnknown=true の場合は unknown 用の共有バケット(1分1回・24時間3回)を使う。
 *
 * Upstashへの通信が失敗・タイムアウトした場合は、警告ログのみを出して
 * 「許可」として扱う(fail open)。これは UPSTASH_REDIS_REST_URL 等の
 * 未設定・不正な形式(構成ミス)とは明確に区別している。構成ミスは
 * getLimiters() -> getRedisClient() の中で ContactConfigError として
 * 即座に投げられ、このtry/catchの外側(呼び出し元のapp/contact/actions.ts)
 * まで伝播する。つまり「一時的な通信障害」だけがここでfail openの対象になる。
 */
export async function checkContactRateLimit(ipHash: string, isUnknown: boolean): Promise<RateLimitResult> {
  const { normal, unknown } = getLimiters();

  try {
    if (isUnknown) {
      if (!(await limitAndLog(unknown.minute, ipHash))) {
        return { allowed: false, reason: 'too_soon' };
      }
      if (!(await limitAndLog(unknown.day, ipHash))) {
        return { allowed: false, reason: 'daily_limit' };
      }
      return { allowed: true };
    }

    if (!(await limitAndLog(normal.minute, ipHash))) {
      return { allowed: false, reason: 'too_soon' };
    }
    if (!(await limitAndLog(normal.hour, ipHash))) {
      return { allowed: false, reason: 'hourly_limit' };
    }
    if (!(await limitAndLog(normal.day, ipHash))) {
      return { allowed: false, reason: 'daily_limit' };
    }
    return { allowed: true };
  } catch (err) {
    console.warn(
      '[contact] レート制限チェックに失敗したため、fail openで送信を継続します:',
      err instanceof Error ? err.message : 'unknown error',
    );
    return { allowed: true, reason: 'rate_limit_unavailable' };
  }
}

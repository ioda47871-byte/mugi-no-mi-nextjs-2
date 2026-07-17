#!/usr/bin/env -S npx tsx
/**
 * scripts/test-rate-limit.ts
 * ----------------------------------------------------------------
 * お問い合わせフォームのレート制限(lib/contact/rate-limit.ts)を、
 * 本番の時間枠(1分/1時間/24時間)を実際に待たずに手動で検証するための
 * スクリプトです。
 *
 * lib/contact/rate-limit.ts の PRODUCTION_RATE_LIMIT_CONFIG(本番定数)は
 * 一切書き換えません。createContactRateLimiters() に、短い秒単位の
 * ウィンドウと "contact:v1:test:<ランダムID>" という専用prefixを渡すことで、
 * 本番のキーとは完全に分離されたテスト用キーだけを使って動作確認します。
 * 実行のたびに新しいprefixを使うため、複数回実行しても干渉しません。
 *
 * 使い方:
 *   1. .env.local に UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN を設定
 *   2. npm run check:rate-limit
 * ----------------------------------------------------------------
 */
import { randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { createContactRateLimiters, type ContactRateLimitConfig } from '../lib/contact/rate-limit';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  console.error('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN を設定してから実行してください。');
  process.exit(1);
}

const redis = new Redis({ url, token });

const TEST_CONFIG: ContactRateLimitConfig = {
  prefixBase: `contact:v1:test:${randomUUID().slice(0, 8)}`,
  normal: {
    minute: { limit: 1, window: '3 s' },
    hour: { limit: 3, window: '6 s' },
    day: { limit: 5, window: '10 s' },
  },
  unknown: {
    minute: { limit: 1, window: '3 s' },
    day: { limit: 3, window: '10 s' },
  },
};

const limiters = createContactRateLimiters(redis, TEST_CONFIG);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log(`テスト用prefix: ${TEST_CONFIG.prefixBase}\n`);

  console.log('=== 通常IP想定: 1分tier相当(上限1回・3秒ウィンドウ) ===');
  for (let i = 1; i <= 3; i++) {
    const result = await limiters.normal.minute.limit('test-ip-hash');
    console.log(`  ${i}回目: ${result.success ? '許可' : '拒否'}`);
  }

  console.log('\n4秒待機してウィンドウをリセット...');
  await sleep(4000);

  console.log('\n=== 通常IP想定: 1時間tier相当(上限3回・6秒ウィンドウ) ===');
  for (let i = 1; i <= 4; i++) {
    const result = await limiters.normal.hour.limit('test-ip-hash-2');
    console.log(`  ${i}回目: ${result.success ? '許可' : '拒否'}`);
  }

  console.log('\n=== unknownバケット想定: 24時間tier相当(上限3回・10秒ウィンドウ) ===');
  for (let i = 1; i <= 4; i++) {
    const result = await limiters.unknown.day.limit('unknown-test');
    console.log(`  ${i}回目: ${result.success ? '許可' : '拒否'}`);
  }

  console.log('\n完了しました。期待される結果:');
  console.log('  - 1分tier: 1回目のみ許可、2・3回目は拒否');
  console.log('  - 1時間tier: 1〜3回目は許可、4回目は拒否');
  console.log('  - unknown 24時間tier: 1〜3回目は許可、4回目は拒否');
  console.log(`\nテスト用キー(prefix: ${TEST_CONFIG.prefixBase})は短いウィンドウのため`);
  console.log('数秒〜数十秒で自動的に期限切れになり、手動での削除は不要です。');
}

run();

import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const TEST_KEY = 'cli-test-access-key';

describe('楽天CLI認証（ループバックへの実HTTP通信）', () => {
  it.each(['missing', 'valid', 'rejected'] as const)('%s の資格情報を安全に扱う', async (state) => {
    const temp = await mkdtemp(path.join(tmpdir(), 'rakuten-auth-'));
    const merchantPath = path.resolve('datasets/production/merchants/rakuten.json');
    const before = await readFile(merchantPath, 'utf8');
    let requests = 0;
    let receivedKey: string | undefined;
    const server = createServer((req, res) => {
      requests++;
      receivedKey = req.headers.accesskey as string | undefined;
      const url = new URL(req.url!, 'http://localhost');
      const authenticated = receivedKey === TEST_KEY &&
        url.searchParams.get('applicationId') === 'cli-test-app' &&
        url.searchParams.get('affiliateId') === 'cli-test-affiliate' &&
        !url.searchParams.has('accessKey');
      res.writeHead(authenticated ? 200 : 401, { 'content-type': 'application/json' });
      res.end(JSON.stringify(authenticated ? { items: [{ item: {
        itemCode: 'testshop:pouch', itemName: '認証テスト専用商品',
        affiliateUrl: 'https://hb.afl.rakuten.co.jp/hgc/test-item-0001/',
      } }], count: 1 } : { error: 'unauthorized' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const result = await execute(process.execPath, [
        '--import', createRequire(import.meta.url).resolve('tsx'), path.resolve('scripts/rakuten-sync.ts'),
        '--mode', 'discover', '--keyword', '認証テスト',
      ], {
        cwd: temp,
        env: {
          ...process.env,
          TSX_TSCONFIG_PATH: path.resolve('tsconfig.json'),
          RAKUTEN_APPLICATION_ID: 'cli-test-app',
          RAKUTEN_AFFILIATE_ID: 'cli-test-affiliate',
          RAKUTEN_ACCESS_KEY: state === 'missing' ? '' : state === 'valid' ? TEST_KEY : 'cli-test-rejected-key',
          RAKUTEN_API_ENDPOINT_OVERRIDE: `http://127.0.0.1:${port}/`,
          RAKUTEN_API_REFERER: '',
          CATALOG_DATASET: 'production',
          CATALOG_DATASET_DIR: path.resolve('datasets/production'),
          AUTOMATION_ENABLED: 'false',
        },
      }).then((r) => ({ ...r, code: 0 })).catch((e) => ({
        stdout: String(e.stdout), stderr: String(e.stderr), code: e.code,
      }));
      const output = result.stdout + result.stderr;
      expect(result.code, output).toBe(state === 'missing' ? 3 : state === 'valid' ? 0 : 1);
      expect(requests).toBe(state === 'missing' ? 0 : 1);
      if (state === 'missing') expect(output).toContain('RAKUTEN_ACCESS_KEY');
      if (state === 'valid') {
        expect(receivedKey).toBe(TEST_KEY);
        expect(output).toContain('結果: 1 件');
        expect(output).toContain('dry-run');
      }
      if (state === 'rejected') expect(output).toContain('HTTP 401');
      for (const value of [TEST_KEY, 'cli-test-app', 'cli-test-affiliate', 'cli-test-rejected-key']) {
        expect(output).not.toContain(value);
      }
      expect(await readFile(merchantPath, 'utf8')).toBe(before);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(temp, { recursive: true, force: true });
    }
  });
});

describe('--exclude の打ち間違いを通さない', () => {
  it('存在しない商品IDを指定したら、通信もデータ変更もせずに終了コード2で止まる', async () => {
    const merchantPath = path.resolve('datasets/production/merchants/rakuten.json');
    const before = await readFile(merchantPath, 'utf8');
    let requests = 0;
    const server = createServer((_req, res) => {
      requests++;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ items: [] }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const result = await execute(
        process.execPath,
        [
          '--import',
          createRequire(import.meta.url).resolve('tsx'),
          path.resolve('scripts/rakuten-sync.ts'),
          '--mode',
          'links',
          '--exclude',
          'no-such-product-id',
        ],
        {
          cwd: path.resolve('.'),
          env: {
            ...process.env,
            RAKUTEN_APPLICATION_ID: 'cli-test-app',
            RAKUTEN_AFFILIATE_ID: 'cli-test-affiliate',
            RAKUTEN_ACCESS_KEY: TEST_KEY,
            RAKUTEN_API_ENDPOINT_OVERRIDE: `http://127.0.0.1:${port}/`,
            RAKUTEN_API_REFERER: '',
            CATALOG_DATASET: 'production',
            AUTOMATION_ENABLED: 'false',
          },
        },
      )
        .then((r) => ({ ...r, code: 0 }))
        .catch((e) => ({ stdout: String(e.stdout), stderr: String(e.stderr), code: e.code }));

      expect(result.code).toBe(2);
      expect(result.stdout + result.stderr).toContain('no-such-product-id');
      expect(requests).toBe(0);
      expect(await readFile(merchantPath, 'utf8')).toBe(before);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { SITE_MODE } from '@/config/site';
import { validateCatalog, type CatalogInput } from './validate';
import type { Catalog, DatasetKind } from './types';

/**
 * データセットの読み込み（ビルド時のみ / Node 環境専用）。
 *
 * データセットを 2 系統に分ける理由（計画書 2節・11節）:
 *   production … 出典を確認できた実データだけを置く。本番はこちらしか使えない。
 *   demo       … 画面と機能を確認するための、実在しないデモデータ。
 *                本番モードでは使用を禁止し、画面上にも必ず注意書きを出す。
 * さらに単体テスト用のデータは tests/fixtures に置き、どちらにも混ぜない。
 */

export const DATASET_ROOT = path.resolve(process.cwd(), 'datasets');

/**
 * 検証用にデータセットの読み込み元を差し替える（CATALOG_DATASET_DIR）。
 *
 * 用途: 未発行の紹介URLを待たずに、購入導線の表示・遷移先・計測を確認するための
 *       一時的なデータ一式を、リポジトリのデータセットを汚さずに読ませる。
 *
 * 安全のための制約: SITE_MODE=production では使用できない。
 * 本番の配信物を、その場限りのディレクトリから作れないようにするため。
 */
export function resolveDatasetDir(kind: DatasetKind): string {
  const override = process.env.CATALOG_DATASET_DIR?.trim();
  if (!override) return path.join(DATASET_ROOT, kind);
  if (SITE_MODE === 'production') {
    throw new Error(
      'SITE_MODE=production では CATALOG_DATASET_DIR を使用できません。本番は datasets/production のみを読み込みます。',
    );
  }
  return path.resolve(process.cwd(), override);
}

export function resolveDatasetKind(): DatasetKind {
  const requested = process.env.CATALOG_DATASET?.trim();
  if (requested === 'production' || requested === 'demo') {
    if (requested === 'demo' && SITE_MODE === 'production') {
      throw new Error(
        'SITE_MODE=production でデモデータセットは使用できません。CATALOG_DATASET=production を設定してください。',
      );
    }
    return requested;
  }
  return SITE_MODE === 'production' ? 'production' : 'demo';
}

function readJson(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`JSON の解析に失敗しました: ${filePath}\n${(error as Error).message}`);
  }
}

function readJsonArrayDir(dir: string): unknown[] {
  if (!fs.existsSync(dir)) return [];
  const entries: unknown[] = [];
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith('.json')) continue;
    const parsed = readJson(path.join(dir, file));
    if (!Array.isArray(parsed)) {
      throw new Error(`${path.join(dir, file)} は配列である必要があります`);
    }
    entries.push(...parsed);
  }
  return entries;
}

function readArticles(dir: string): unknown[] {
  if (!fs.existsSync(dir)) return [];
  const articles: unknown[] = [];
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith('.md')) continue;
    const filePath = path.join(dir, file);
    const raw = fs.readFileSync(filePath, 'utf8');
    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(raw);
    } catch (error) {
      throw new Error(`frontmatter の解析に失敗しました: ${filePath}\n${(error as Error).message}`);
    }
    const { data, content } = parsed;
    const slugFromFile = file.replace(/\.md$/, '');
    articles.push({
      ...data,
      slug: typeof data.slug === 'string' ? data.slug : slugFromFile,
      body: content.trim(),
    });
  }
  return articles;
}

export function readDatasetInput(kind: DatasetKind): CatalogInput {
  const root = resolveDatasetDir(kind);
  if (!fs.existsSync(root)) {
    throw new Error(`データセットが見つかりません: ${root}`);
  }
  return {
    dataset: readJson(path.join(root, 'dataset.json')),
    products: readJsonArrayDir(path.join(root, 'products')),
    sources: readJson(path.join(root, 'sources.json')),
    merchantLinks: readJsonArrayDir(path.join(root, 'merchants')),
    articles: readArticles(path.join(root, 'articles')),
  };
}

const cache = new Map<DatasetKind, Catalog>();

export function loadCatalog(kind: DatasetKind = resolveDatasetKind()): Catalog {
  const cached = cache.get(kind);
  if (cached) return cached;

  const catalog = validateCatalog(readDatasetInput(kind), { now: new Date() });
  if (catalog.dataset.kind !== kind) {
    throw new Error(
      `dataset.json の kind (${catalog.dataset.kind}) がディレクトリ (${kind}) と一致しません`,
    );
  }
  if (catalog.dataset.kind === 'demo' && SITE_MODE === 'production') {
    throw new Error('本番モードでデモデータセットを読み込もうとしました。');
  }
  cache.set(kind, catalog);
  return catalog;
}

import { z } from 'zod';
import {
  articleMetaSchema,
  datasetInfoSchema,
  merchantLinkSchema,
  productSchema,
  sourceSchema,
} from './schema';
import type {
  Article,
  Catalog,
  DatasetInfo,
  Fact,
  MerchantLink,
  Product,
  Source,
} from './types';

export type IssueSeverity = 'error' | 'warning';

export type ValidationIssue = {
  severity: IssueSeverity;
  /** 何の不整合か（機械可読なコード）。 */
  code: string;
  /** 対象を特定するID（商品ID・出典ID・記事slugなど）。 */
  subject: string;
  /** 対象内の位置（フィールドパス）。 */
  path?: string;
  message: string;
};

export class CatalogValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    const errors = issues.filter((issue) => issue.severity === 'error');
    super(
      `カタログ検証に失敗しました（エラー ${errors.length} 件）:\n` +
        errors.map((issue) => `  - ${formatIssue(issue)}`).join('\n'),
    );
    this.name = 'CatalogValidationError';
    this.issues = issues;
  }
}

export function formatIssue(issue: ValidationIssue): string {
  const where = issue.path ? `${issue.subject}#${issue.path}` : issue.subject;
  return `[${issue.code}] ${where}: ${issue.message}`;
}

export type CatalogInput = {
  dataset: unknown;
  products: unknown;
  sources: unknown;
  merchantLinks: unknown;
  articles: unknown;
};

export type ValidateOptions = {
  /** 「未来の確認日」判定の基準時刻。テストのために注入できる。 */
  now?: Date;
};

export type InspectResult =
  | { ok: true; catalog: Catalog; issues: ValidationIssue[] }
  | { ok: false; catalog: null; issues: ValidationIssue[] };

const FACT_FIELDS = ['weightG', 'outerSizeMm', 'bodySizeMm', 'capacityL'] as const;

function toDay(value: string): number {
  return Date.parse(`${value}T00:00:00Z`);
}

function zodIssues(
  error: z.ZodError,
  code: string,
  subject: string,
): ValidationIssue[] {
  return error.issues.map((issue) => ({
    severity: 'error' as const,
    code,
    subject,
    path: issue.path.join('.') || undefined,
    message: issue.message,
  }));
}

function parseList<T>(
  raw: unknown,
  schema: z.ZodType<T>,
  code: string,
  label: string,
  identify: (value: unknown) => string,
  issues: ValidationIssue[],
): T[] {
  if (!Array.isArray(raw)) {
    issues.push({
      severity: 'error',
      code: `${code}.shape`,
      subject: label,
      message: `${label} は配列である必要があります`,
    });
    return [];
  }
  const parsed: T[] = [];
  raw.forEach((entry, index) => {
    const result = schema.safeParse(entry);
    if (result.success) {
      parsed.push(result.data);
    } else {
      issues.push(...zodIssues(result.error, code, identify(entry) || `${label}[${index}]`));
    }
  });
  return parsed;
}

function checkFact(
  fact: Fact<unknown> | undefined,
  subject: string,
  path: string,
  sources: Map<string, Source>,
  todayMs: number,
  requireVerifiedSource: boolean,
  issues: ValidationIssue[],
): void {
  if (!fact) return;

  if (fact.value === null) {
    if (fact.sourceId !== null || fact.checkedAt !== null) {
      issues.push({
        severity: 'warning',
        code: 'fact.unknown-with-source',
        subject,
        path,
        message: '値が不明(null)なのに出典・確認日が入っています。不明の理由は note に書いてください',
      });
    }
    return;
  }

  if (fact.sourceId === null || fact.checkedAt === null) {
    issues.push({
      severity: 'error',
      code: 'fact.missing-evidence',
      subject,
      path,
      message: '値がある項目には sourceId と checkedAt が必要です（推定値で埋めない）',
    });
    return;
  }

  const source = sources.get(fact.sourceId);
  if (!source) {
    issues.push({
      severity: 'error',
      code: 'fact.unknown-source',
      subject,
      path,
      message: `存在しない出典ID: ${fact.sourceId}`,
    });
    return;
  }

  if (toDay(fact.checkedAt) > todayMs) {
    issues.push({
      severity: 'error',
      code: 'fact.future-checked-at',
      subject,
      path,
      message: `確認日が未来です: ${fact.checkedAt}`,
    });
  }

  if (requireVerifiedSource && source.editorialUse !== 'verified') {
    issues.push({
      severity: 'error',
      code: 'fact.unverified-source',
      subject,
      path,
      message: `公開商品の仕様は editorialUse: 'verified' の出典が必要です（${source.id} は ${source.editorialUse}）`,
    });
  }
}

/** 記事本文に生HTML・スクリプトが混ざっていないか（計画書 8節）。 */
export function findUnsafeMarkdown(body: string): string[] {
  const problems: string[] = [];
  if (/<\s*script/i.test(body)) problems.push('<script> タグ');
  if (/<\s*iframe/i.test(body)) problems.push('<iframe> タグ');
  if (/<\s*style/i.test(body)) problems.push('<style> タグ');
  if (/\son[a-z]+\s*=/i.test(body)) problems.push('on... イベント属性');
  if (/javascript:/i.test(body)) problems.push('javascript: URL');
  if (/data:text\/html/i.test(body)) problems.push('data:text/html URL');
  // Markdown の記法として使わない一般的な生HTMLタグ
  if (/<\/?(div|span|table|tr|td|img|a|form|input|object|embed|svg)\b/i.test(body)) {
    problems.push('生HTMLタグ');
  }
  return problems;
}

/**
 * カタログ全体を検証する。
 * 返すのは「形式が正しく、根拠と参照が整合したデータ」だけ。
 */
export function inspectCatalog(input: CatalogInput, options: ValidateOptions = {}): InspectResult {
  const issues: ValidationIssue[] = [];
  const now = options.now ?? new Date();
  const todayMs = toDay(now.toISOString().slice(0, 10));

  const datasetResult = datasetInfoSchema.safeParse(input.dataset);
  if (!datasetResult.success) {
    issues.push(...zodIssues(datasetResult.error, 'dataset.schema', 'dataset'));
  }
  const dataset: DatasetInfo | null = datasetResult.success ? datasetResult.data : null;

  const sources = parseList<Source>(
    input.sources,
    sourceSchema,
    'source.schema',
    'sources',
    (v) => (typeof v === 'object' && v !== null && 'id' in v ? String((v as { id: unknown }).id) : ''),
    issues,
  );
  const products = parseList<Product>(
    input.products,
    productSchema as unknown as z.ZodType<Product>,
    'product.schema',
    'products',
    (v) => (typeof v === 'object' && v !== null && 'id' in v ? String((v as { id: unknown }).id) : ''),
    issues,
  );
  const merchantLinks = parseList<MerchantLink>(
    input.merchantLinks,
    merchantLinkSchema,
    'merchant.schema',
    'merchantLinks',
    (v) =>
      typeof v === 'object' && v !== null && 'productId' in v
        ? `${String((v as { productId: unknown }).productId)}`
        : '',
    issues,
  );

  const articleSchema = articleMetaSchema.extend({ body: z.string().min(1) });
  const articles = parseList<Article>(
    input.articles,
    articleSchema as unknown as z.ZodType<Article>,
    'article.schema',
    'articles',
    (v) =>
      typeof v === 'object' && v !== null && 'slug' in v ? String((v as { slug: unknown }).slug) : '',
    issues,
  );

  // --- 一意性 -------------------------------------------------------
  const sourceMap = new Map<string, Source>();
  for (const source of sources) {
    if (sourceMap.has(source.id)) {
      issues.push({
        severity: 'error',
        code: 'source.duplicate-id',
        subject: source.id,
        message: '出典IDが重複しています',
      });
      continue;
    }
    sourceMap.set(source.id, source);

    // 入手経路と取込記録の整合（提供資料からの取り込みを自力確認と記録させない）
    if (source.provenance !== 'direct-fetch' && source.importedFrom === null) {
      issues.push({
        severity: 'error',
        code: 'source.missing-import-record',
        subject: source.id,
        path: 'importedFrom',
        message: `provenance: '${source.provenance}' には元資料(document)と取込日(importedAt)が必要です`,
      });
    }
    if (source.provenance === 'direct-fetch' && source.importedFrom !== null) {
      issues.push({
        severity: 'error',
        code: 'source.unexpected-import-record',
        subject: source.id,
        path: 'importedFrom',
        message: "provenance: 'direct-fetch' に importedFrom は付けられません",
      });
    }
    if (source.importedFrom && toDay(source.importedFrom.importedAt) > todayMs) {
      issues.push({
        severity: 'error',
        code: 'source.future-imported-at',
        subject: source.id,
        path: 'importedFrom.importedAt',
        message: `取込日が未来です: ${source.importedFrom.importedAt}`,
      });
    }

    if (toDay(source.checkedAt) > todayMs) {
      issues.push({
        severity: 'error',
        code: 'source.future-checked-at',
        subject: source.id,
        path: 'checkedAt',
        message: `確認日が未来です: ${source.checkedAt}`,
      });
    }
  }

  const productMap = new Map<string, Product>();
  const identityKeys = new Map<string, string>();
  for (const product of products) {
    if (productMap.has(product.id)) {
      issues.push({
        severity: 'error',
        code: 'product.duplicate-id',
        subject: product.id,
        message: '商品IDが重複しています',
      });
      continue;
    }
    productMap.set(product.id, product);

    // 同一性は ブランド+型番+バリエーション で照合する（計画書 5-2節）。
    const identity = `${product.brand}|${product.model}|${product.variant}`.toLowerCase();
    const existing = identityKeys.get(identity);
    if (existing) {
      issues.push({
        severity: 'error',
        code: 'product.duplicate-identity',
        subject: product.id,
        message: `ブランド・型番・バリエーションが ${existing} と同一です。別バリエーションなら variant を分けてください`,
      });
    } else {
      identityKeys.set(identity, product.id);
    }
  }

  // --- 商品の根拠 ---------------------------------------------------
  for (const product of products) {
    const requireVerified = product.status === 'published';
    for (const field of FACT_FIELDS) {
      checkFact(product[field], product.id, field, sourceMap, todayMs, requireVerified, issues);
    }
    for (const [key, fact] of Object.entries(product.specs)) {
      checkFact(fact, product.id, `specs.${key}`, sourceMap, todayMs, requireVerified, issues);
    }

    // 別条件の寸法・容量（拡張時など）
    const seenLabels = new Set<string>();
    product.alternateMeasurements.forEach((measurement, index) => {
      const base = `alternateMeasurements[${index}]`;
      checkFact(measurement.sizeMm, product.id, `${base}.sizeMm`, sourceMap, todayMs, requireVerified, issues);
      checkFact(measurement.capacityL, product.id, `${base}.capacityL`, sourceMap, todayMs, requireVerified, issues);
      if (seenLabels.has(measurement.label)) {
        issues.push({
          severity: 'error',
          code: 'product.duplicate-measurement-label',
          subject: product.id,
          path: `${base}.label`,
          message: `条件名が重複しています: ${measurement.label}`,
        });
      }
      seenLabels.add(measurement.label);
      if (measurement.state === product.measurementState) {
        issues.push({
          severity: 'error',
          code: 'product.redundant-measurement',
          subject: product.id,
          path: `${base}.state`,
          message: `主要値と同じ状態(${measurement.state})です。別条件のときだけ登録してください`,
        });
      }
      if (measurement.sizeMm.value === null && measurement.capacityL.value === null) {
        issues.push({
          severity: 'warning',
          code: 'product.empty-measurement',
          subject: product.id,
          path: base,
          message: '寸法も容量も不明な条件が登録されています',
        });
      }
    });

    // 本体寸法は「本体のみ」の値。外寸の条件が body-only なら重複登録になる。
    if (product.bodySizeMm?.value != null && product.sizeBasis === 'body-only') {
      issues.push({
        severity: 'error',
        code: 'product.duplicate-body-size',
        subject: product.id,
        path: 'bodySizeMm',
        message: "outerSizeMm が既に 'body-only' 条件です。本体寸法を二重に登録しないでください",
      });
    }

    if (product.image && !sourceMap.has(product.image.sourceId)) {
      issues.push({
        severity: 'error',
        code: 'product.image-unknown-source',
        subject: product.id,
        path: 'image.sourceId',
        message: `画像の権利確認元が存在しません: ${product.image.sourceId}`,
      });
    }

    if (product.status === 'published') {
      const hasComparable =
        product.weightG.value !== null ||
        product.capacityL.value !== null ||
        product.outerSizeMm.value !== null;
      if (!hasComparable) {
        issues.push({
          severity: 'error',
          code: 'product.no-comparable-fact',
          subject: product.id,
          message: '公開商品は重量・容量・外寸のいずれか1つ以上に確認済みの値が必要です',
        });
      }
    }
  }

  // --- 販売先 -------------------------------------------------------
  for (const link of merchantLinks) {
    const subject = `${link.productId}/${link.merchant}`;
    const product = productMap.get(link.productId);
    if (!product) {
      issues.push({
        severity: 'error',
        code: 'merchant.unknown-product',
        subject,
        message: `存在しない商品IDを参照しています: ${link.productId}`,
      });
      continue;
    }
    if (link.status === 'verified') {
      if (link.verifiedAt === null) {
        issues.push({
          severity: 'error',
          code: 'merchant.missing-verified-at',
          subject,
          message: "status: 'verified' には照合日(verifiedAt)が必要です",
        });
      } else if (toDay(link.verifiedAt) > todayMs) {
        issues.push({
          severity: 'error',
          code: 'merchant.future-verified-at',
          subject,
          message: `照合日が未来です: ${link.verifiedAt}`,
        });
      }
      if (!link.verificationMethod) {
        issues.push({
          severity: 'error',
          code: 'merchant.missing-verification-method',
          subject,
          path: 'verificationMethod',
          message:
            "status: 'verified' には判断根拠(verificationMethod)が必要です" +
            "（visual: リンク先を目視確認 / identifier-match: 型番・JANの一致で判断）",
        });
      }
      if (link.matchedVariant !== product.variant) {
        issues.push({
          severity: 'error',
          code: 'merchant.variant-mismatch',
          subject,
          message: `バリエーション不一致（商品: ${product.variant} / 販売先: ${link.matchedVariant}）。一致しない販売先は掲載しません`,
        });
      }
      if (link.merchant === 'rakuten' && link.affiliateUrl === null) {
        issues.push({
          severity: 'error',
          code: 'merchant.rakuten-missing-url',
          subject,
          message: '楽天は管理画面で発行した紹介URLが必要です（商品URLを紹介URLとして扱わない）',
        });
      }
      if (link.merchant === 'amazon' && !/^[A-Z0-9]{10}$/.test(link.externalProductId)) {
        issues.push({
          severity: 'error',
          code: 'merchant.invalid-asin',
          subject,
          message: `ASIN の形式が不正です: ${link.externalProductId}`,
        });
      }
    }
  }

  // --- 記事 ---------------------------------------------------------
  const slugs = new Set<string>();
  const intentKeys = new Map<string, string>();
  for (const article of articles) {
    if (slugs.has(article.slug)) {
      issues.push({
        severity: 'error',
        code: 'article.duplicate-slug',
        subject: article.slug,
        message: 'slug が重複しています',
      });
      continue;
    }
    slugs.add(article.slug);

    if (article.status !== 'retired') {
      const existing = intentKeys.get(article.intentKey);
      if (existing) {
        issues.push({
          severity: 'error',
          code: 'article.duplicate-intent',
          subject: article.slug,
          message: `検索意図キー ${article.intentKey} が ${existing} と重複しています。役割の異なる記事に統合・置き換えてください`,
        });
      } else {
        intentKeys.set(article.intentKey, article.slug);
      }
    }

    const unsafe = findUnsafeMarkdown(article.body);
    if (unsafe.length > 0) {
      issues.push({
        severity: 'error',
        code: 'article.unsafe-body',
        subject: article.slug,
        message: `本文に許可されない記法が含まれます: ${unsafe.join(' / ')}`,
      });
    }

    for (const productId of article.productIds) {
      if (!productMap.has(productId)) {
        issues.push({
          severity: 'error',
          code: 'article.unknown-product',
          subject: article.slug,
          message: `存在しない商品IDを参照しています: ${productId}`,
        });
      }
    }
    for (const sourceId of article.sourceIds) {
      if (!sourceMap.has(sourceId)) {
        issues.push({
          severity: 'error',
          code: 'article.unknown-source',
          subject: article.slug,
          message: `存在しない出典IDを参照しています: ${sourceId}`,
        });
      }
    }
    for (const dateField of ['publishedAt', 'updatedAt', 'reviewedAt'] as const) {
      const value = article[dateField];
      if (value !== null && toDay(value) > todayMs) {
        issues.push({
          severity: 'error',
          code: 'article.future-date',
          subject: article.slug,
          path: dateField,
          message: `${dateField} が未来の日付です: ${value}`,
        });
      }
    }
  }

  const errors = issues.filter((issue) => issue.severity === 'error');
  if (errors.length > 0 || !dataset) {
    return { ok: false, catalog: null, issues };
  }

  return {
    ok: true,
    catalog: { dataset, products, sources, merchantLinks, articles },
    issues,
  };
}

/** 不整合があれば CatalogValidationError を投げ、成功時は検証済みカタログを返す。 */
export function validateCatalog(input: unknown, options: ValidateOptions = {}): Catalog {
  if (typeof input !== 'object' || input === null) {
    throw new CatalogValidationError([
      {
        severity: 'error',
        code: 'catalog.shape',
        subject: 'catalog',
        message: 'カタログはオブジェクトである必要があります',
      },
    ]);
  }
  const result = inspectCatalog(input as CatalogInput, options);
  if (!result.ok) throw new CatalogValidationError(result.issues);
  return result.catalog;
}

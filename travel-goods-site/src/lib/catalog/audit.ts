import type { Article, Catalog, MerchantLink, Product, Source } from './types';
import { resolveMerchantLinks } from '@/lib/affiliate/resolve';
import type { MerchantConfig } from '@/config/merchants';

/**
 * 放っておくと壊れるものを機械が見張る（計画書 12-1節）。
 *
 * 検証(validate)との違い:
 *   validate … データの整合性。壊れていたらビルドを止める。
 *   audit    … 時間の経過で古くなるもの。止めないが、人に知らせる。
 *
 * ここは外部アクセスを一切しない。日付とデータだけで判断する。
 * 「何も見つからなければ何も報告しない」ことを目的にする。
 */

export type AuditSeverity = 'action-required' | 'attention';

export type AuditFinding = {
  severity: AuditSeverity;
  code: string;
  /** 対象（商品ID・出典ID・記事slugなど） */
  subject: string;
  message: string;
  /** 人がやること。読んですぐ動けるように書く。 */
  suggestedAction: string;
};

export type AuditThresholds = {
  /** 商品仕様の確認日がこれより古ければ知らせる。 */
  productFactDays: number;
  /** モバイルバッテリーなど安全情報が関わるものの再確認期限。 */
  safetyRecheckDays: number;
  /** 出典の確認日。 */
  sourceDays: number;
  /** 照合済みリンクの再確認。 */
  merchantLinkDays: number;
  /** 公開記事の実質更新日。 */
  articleDays: number;
  /** 未処理のまま放置された候補。 */
  candidateDays: number;
};

export const DEFAULT_THRESHOLDS: AuditThresholds = {
  productFactDays: 180,
  safetyRecheckDays: 90,
  sourceDays: 180,
  merchantLinkDays: 180,
  articleDays: 365,
  candidateDays: 30,
};

/** 安全情報の再確認が要るカテゴリ。 */
const SAFETY_SENSITIVE_CATEGORIES = new Set(['power-banks']);

export type AuditCandidate = {
  itemCode: string;
  itemName: string;
  status: string;
  fetchedAt: string;
};

export type AuditInput = {
  catalog: Catalog;
  merchantConfig: MerchantConfig;
  candidates?: AuditCandidate[];
  now: Date;
  thresholds?: Partial<AuditThresholds>;
};

export type AuditResult = {
  findings: AuditFinding[];
  /** 対応が必要なものがあるか（CIの終了コードに使う）。 */
  hasActionRequired: boolean;
  checkedAt: string;
};

function daysBetween(from: string, now: Date): number {
  const then = Date.parse(`${from}T00:00:00Z`);
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return Math.floor((now.getTime() - then) / 86_400_000);
}

/**
 * 商品の仕様のうち、**最も古い**確認日。
 *
 * 新しい方を見ると、一部だけ更新した商品で古い値が残っていても気づけない。
 * 「いちばん古い値がいつのものか」を基準にする。
 */
function oldestFactDate(product: Product): string | null {
  const dates: string[] = [];
  const facts = [
    product.weightG,
    product.outerSizeMm,
    product.bodySizeMm,
    product.capacityL,
    ...product.alternateMeasurements.flatMap((m) => [m.sizeMm, m.capacityL]),
    ...Object.values(product.specs),
  ];
  for (const fact of facts) {
    if (fact?.checkedAt) dates.push(fact.checkedAt);
  }
  return dates.length > 0 ? (dates.sort()[0] as string) : null;
}

export function auditCatalog(input: AuditInput): AuditResult {
  const { catalog, merchantConfig, now } = input;
  const limits = { ...DEFAULT_THRESHOLDS, ...input.thresholds };
  const findings: AuditFinding[] = [];
  const today = now.toISOString().slice(0, 10);

  const visibleProducts = catalog.products.filter(
    (product) => product.status === 'published' || product.status === 'review',
  );

  // --- 商品の仕様が古くなっていないか -------------------------------
  for (const product of visibleProducts) {
    const checkedAt = oldestFactDate(product);
    if (!checkedAt) continue;
    const age = daysBetween(checkedAt, now);
    const isSafety = SAFETY_SENSITIVE_CATEGORIES.has(product.category);
    const limit = isSafety ? limits.safetyRecheckDays : limits.productFactDays;

    if (age > limit) {
      findings.push({
        severity: isSafety ? 'action-required' : 'attention',
        code: isSafety ? 'safety.recheck-due' : 'product.stale-facts',
        subject: product.id,
        message: isSafety
          ? `安全情報の再確認期限を過ぎています（最も古い確認日 ${checkedAt} / ${age}日前）`
          : `仕様の確認から ${age}日 経過した値があります（最も古い確認日 ${checkedAt}）`,
        suggestedAction: isSafety
          ? 'メーカーの回収・リコール情報を確認し、問題があれば status を retired にしてください。問題なければ確認日を更新します。'
          : 'メーカーの公表仕様を再確認し、変更があればデータを更新してください。',
      });
    }
  }

  // --- 出典が古くなっていないか -------------------------------------
  const usedSourceIds = new Set<string>();
  for (const product of visibleProducts) {
    for (const fact of [
      product.weightG,
      product.outerSizeMm,
      product.bodySizeMm,
      product.capacityL,
      ...Object.values(product.specs),
    ]) {
      if (fact?.sourceId) usedSourceIds.add(fact.sourceId);
    }
  }
  for (const source of catalog.sources) {
    if (!usedSourceIds.has(source.id)) continue;
    const age = daysBetween(source.checkedAt, now);
    if (age > limits.sourceDays) {
      findings.push({
        severity: 'attention',
        code: 'source.stale',
        subject: source.id,
        message: `出典の確認から ${age}日 経過しています（${source.checkedAt} / ${source.publisher}）`,
        suggestedAction: 'ページが残っているか、内容が変わっていないかを確認してください。',
      });
    }
  }

  // --- 販売先リンク ---------------------------------------------------
  for (const product of catalog.products.filter((p) => p.status === 'published')) {
    const { links } = resolveMerchantLinks(product, catalog.merchantLinks, merchantConfig);
    if (links.length === 0) {
      findings.push({
        severity: 'attention',
        code: 'product.no-merchant-link',
        subject: product.id,
        message: '公開中ですが、表示できる購入リンクがありません',
        suggestedAction:
          '紹介URLを発行して npm run link:set で登録してください。収益にはつながっていません。',
      });
    }
  }

  for (const link of catalog.merchantLinks) {
    if (link.status !== 'verified') continue;
    const subject = `${link.productId}/${link.merchant}`;

    if (link.verificationMethod === 'identifier-match') {
      findings.push({
        severity: 'attention',
        code: 'link.not-visually-checked',
        subject,
        message: '型番・JANの一致だけで表示しています（リンク先は未確認）',
        suggestedAction:
          'リンク先を開いて商品・サイズ・色を確認し、link:set --verify --visual-check で記録してください。',
      });
    }

    if (link.verifiedAt) {
      const age = daysBetween(link.verifiedAt, now);
      if (age > limits.merchantLinkDays) {
        findings.push({
          severity: 'attention',
          code: 'link.stale-verification',
          subject,
          message: `販売先の照合から ${age}日 経過しています（${link.verifiedAt}）`,
          suggestedAction: 'リンク先がまだ同じ商品を指しているか確認してください。',
        });
      }
    }
  }

  // --- 記事 -----------------------------------------------------------
  const publishedProductIds = new Set(
    catalog.products.filter((p) => p.status === 'published').map((p) => p.id),
  );
  for (const article of catalog.articles.filter((a) => a.status === 'published')) {
    for (const productId of article.productIds) {
      if (!publishedProductIds.has(productId)) {
        findings.push({
          severity: 'action-required',
          code: 'article.references-unpublished-product',
          subject: article.slug,
          message: `公開記事が未公開の商品 ${productId} を参照しています`,
          suggestedAction:
            '商品を公開するか、記事から外してください。このままではビルドが失敗します。',
        });
      }
    }

    const updatedAt = article.updatedAt ?? article.publishedAt;
    if (updatedAt) {
      const age = daysBetween(updatedAt, now);
      if (age > limits.articleDays) {
        findings.push({
          severity: 'attention',
          code: 'article.stale',
          subject: article.slug,
          message: `記事の実質更新から ${age}日 経過しています（${updatedAt}）`,
          suggestedAction:
            '内容が現在も正しいか確認してください。意味のある変更が無ければ更新日は変えないでください。',
        });
      }
    }
  }

  // --- 放置された候補 -------------------------------------------------
  for (const candidate of input.candidates ?? []) {
    if (candidate.status !== 'new') continue;
    const age = daysBetween(candidate.fetchedAt, now);
    if (age > limits.candidateDays) {
      findings.push({
        severity: 'attention',
        code: 'candidate.unreviewed',
        subject: candidate.itemCode,
        message: `${age}日 未処理の商品候補があります（${candidate.itemName.slice(0, 40)}）`,
        suggestedAction: '採用するか、status を rejected にしてください。',
      });
    }
  }

  return {
    findings,
    hasActionRequired: findings.some((f) => f.severity === 'action-required'),
    checkedAt: today,
  };
}

/** 報告用の1行表現。 */
export function formatFinding(finding: AuditFinding): string {
  const mark = finding.severity === 'action-required' ? '要対応' : '確認';
  return `[${mark}] ${finding.subject}: ${finding.message}`;
}

export type { Article, MerchantLink, Source };

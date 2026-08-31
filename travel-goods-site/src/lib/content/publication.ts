import type { Article, Catalog, Product, Source } from '@/lib/catalog/types';
import { findUnsafeMarkdown } from '@/lib/catalog/validate';

/**
 * 記事を公開してよいかの機械的な検査（計画書 11節 Task 7）。
 *
 * ここで ok になっても「内容が正しいことの証明」ではない。
 * 事実確認・安全情報の確認は人（または明示的なレビュー記録）が行う。
 */

export type PublicationVerdict = {
  ok: boolean;
  reasons: string[];
};

/** 下書きテンプレートの未記入マーカー。これが残っていると公開できない。 */
export const DRAFT_PLACEHOLDER_MARKERS = ['TODO:', '【未記入】'] as const;

const MIN_BODY_LENGTH = 400;

export function evaluatePublication(
  article: Article,
  catalog: Pick<Catalog, 'products' | 'sources' | 'merchantLinks'>,
  sources: Source[] = catalog.sources,
): PublicationVerdict {
  const reasons: string[] = [];
  const productMap = new Map<string, Product>(catalog.products.map((p) => [p.id, p]));
  const sourceMap = new Map<string, Source>(sources.map((s) => [s.id, s]));

  if (article.status !== 'published') {
    reasons.push(`記事 ${article.slug}: 公開状態ではありません（status: ${article.status}）`);
  }

  // --- 編集上の確認 -------------------------------------------------
  if (!article.reviewedAt || !article.reviewer) {
    reasons.push(
      `記事 ${article.slug}: レビュー日(reviewedAt)とレビュー担当(reviewer)が必要です。自動検査の合格を人の確認の代わりにしません`,
    );
  }
  if (!article.publishedAt) {
    reasons.push(`記事 ${article.slug}: publishedAt が未設定です`);
  }

  // --- 本文 ---------------------------------------------------------
  const unsafe = findUnsafeMarkdown(article.body);
  if (unsafe.length > 0) {
    reasons.push(`記事 ${article.slug}: 本文に許可されない記法（${unsafe.join(' / ')}）`);
  }
  for (const marker of DRAFT_PLACEHOLDER_MARKERS) {
    if (article.body.includes(marker)) {
      reasons.push(`記事 ${article.slug}: 下書きの未記入箇所が残っています（"${marker}"）`);
    }
  }
  if (article.body.trim().length < MIN_BODY_LENGTH) {
    reasons.push(
      `記事 ${article.slug}: 本文が短すぎます（${article.body.trim().length}文字 / 最低 ${MIN_BODY_LENGTH}文字）`,
    );
  }

  // --- 出典 ---------------------------------------------------------
  if (article.sourceIds.length === 0) {
    reasons.push(`記事 ${article.slug}: 出典(sourceIds)が1件もありません`);
  }
  for (const sourceId of article.sourceIds) {
    const source = sourceMap.get(sourceId);
    if (!source) {
      reasons.push(`記事 ${article.slug}: 出典ID ${sourceId} が見つかりません`);
      continue;
    }
    if (source.editorialUse !== 'verified') {
      reasons.push(
        `記事 ${article.slug}: 出典 ${sourceId} は editorialUse が ${source.editorialUse} です。編集上の確認を済ませてください`,
      );
    }
  }

  // --- 参照商品 -----------------------------------------------------
  for (const productId of article.productIds) {
    const product = productMap.get(productId);
    if (!product) {
      reasons.push(`記事 ${article.slug}: 商品ID ${productId} が見つかりません`);
      continue;
    }
    if (product.status !== 'published') {
      reasons.push(
        `記事 ${article.slug}: 商品 ${productId} が未公開(${product.status})です。公開記事から未確認商品を参照しません`,
      );
    }
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * 公開対象の記事だけを返す。
 * evaluatePublication に落ちた記事は理由付きで除外する。
 */
export function selectPublishableArticles(catalog: Catalog): {
  published: Article[];
  withheld: { slug: string; reasons: string[] }[];
} {
  const published: Article[] = [];
  const withheld: { slug: string; reasons: string[] }[] = [];

  for (const article of catalog.articles) {
    const verdict = evaluatePublication(article, catalog);
    if (verdict.ok) {
      published.push(article);
    } else {
      withheld.push({ slug: article.slug, reasons: verdict.reasons });
    }
  }

  return { published, withheld };
}

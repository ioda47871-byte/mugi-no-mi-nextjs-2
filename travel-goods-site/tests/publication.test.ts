import { describe, expect, it } from 'vitest';
import { evaluatePublication, selectPublishableArticles } from '@/lib/content/publication';
import { parseInline, parseMarkdown } from '@/lib/content/markdown';
import { makeArticle, makeProduct, testSources } from './fixtures/catalog';
import type { Catalog } from '@/lib/catalog/types';

const catalog = {
  products: [makeProduct()],
  sources: testSources,
  merchantLinks: [],
};

describe('evaluatePublication', () => {
  it('条件を満たす記事は公開できる', () => {
    expect(evaluatePublication(makeArticle(), catalog).ok).toBe(true);
  });

  it('出典が無い記事を拒否する', () => {
    const verdict = evaluatePublication(makeArticle({ sourceIds: [] }), catalog);
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join('\n')).toContain('出典');
  });

  it('編集上の確認が済んでいない出典を拒否する', () => {
    const verdict = evaluatePublication(makeArticle({ sourceIds: ['src-test-unverified'] }), catalog);
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join('\n')).toContain('src-test-unverified');
  });

  it('レビュー未実施の記事を拒否する', () => {
    const verdict = evaluatePublication(
      makeArticle({ reviewedAt: null, reviewer: null }),
      catalog,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join('\n')).toContain('レビュー');
  });

  it('未確認(draft)商品を参照する公開記事を拒否する', () => {
    const draftCatalog = { ...catalog, products: [makeProduct({ status: 'draft' })] };
    const verdict = evaluatePublication(makeArticle(), draftCatalog);
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join('\n')).toContain('未公開');
  });

  it('危険なHTMLを含む本文を拒否する', () => {
    const verdict = evaluatePublication(
      makeArticle({ body: `<img src=x onerror=alert(1)>${'あ'.repeat(500)}` }),
      catalog,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join('\n')).toContain('許可されない記法');
  });

  it('下書きテンプレートの未記入マーカーが残っていれば拒否する', () => {
    const verdict = evaluatePublication(
      makeArticle({ body: `${'あ'.repeat(500)}\n\nTODO: 選び方を書く` }),
      catalog,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join('\n')).toContain('未記入');
  });

  it('draft 状態の記事は公開対象にしない', () => {
    const verdict = evaluatePublication(makeArticle({ status: 'draft' }), catalog);
    expect(verdict.ok).toBe(false);
  });

  it('理由には記事slug・商品ID・出典IDが含まれ追跡できる', () => {
    const verdict = evaluatePublication(
      makeArticle({ slug: 'trace-me', productIds: ['p-missing'], sourceIds: ['src-missing'] }),
      catalog,
    );
    const text = verdict.reasons.join('\n');
    expect(text).toContain('trace-me');
    expect(text).toContain('p-missing');
    expect(text).toContain('src-missing');
  });

  it('公開できない記事は一覧から除外され、理由が残る', () => {
    const full: Catalog = {
      dataset: { kind: 'demo', label: 'テスト', notice: null },
      products: catalog.products,
      sources: catalog.sources,
      merchantLinks: [],
      articles: [makeArticle(), makeArticle({ slug: 'draft-one', status: 'draft', intentKey: 'x' })],
    };
    const { published, withheld } = selectPublishableArticles(full);
    expect(published.map((a) => a.slug)).toEqual(['test-article']);
    expect(withheld.map((w) => w.slug)).toEqual(['draft-one']);
  });
});

describe('Markdown レンダラー: 生HTML・スクリプトを実行させない', () => {
  it('生HTMLはブロック要素にならず文字として扱う', () => {
    const blocks = parseMarkdown('<script>alert(1)</script>');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe('paragraph');
    const nodes = (blocks[0] as { children: { type: string; value: string }[] }).children;
    expect(nodes.every((n) => n.type === 'text')).toBe(true);
  });

  it('javascript: リンクをリンクにしない', () => {
    const nodes = parseInline('[押す](javascript:alert(1))');
    expect(nodes.some((n) => n.type === 'link')).toBe(false);
  });

  it('data:text/html リンクをリンクにしない', () => {
    const nodes = parseInline('[押す](data:text/html;base64,PHNjcmlwdD4=)');
    expect(nodes.some((n) => n.type === 'link')).toBe(false);
  });

  it('https リンクとサイト内リンクは通す', () => {
    const external = parseInline('[公式](https://example.invalid/spec)');
    expect(external[0]).toMatchObject({ type: 'link', external: true });
    const internal = parseInline('[比較](/categories/suitcases/)');
    expect(internal[0]).toMatchObject({ type: 'link', external: false, href: '/categories/suitcases/' });
  });

  it('見出し・リスト・比較表の差し込みを解析する', () => {
    const blocks = parseMarkdown(
      ['## 結論', '', '- 軽さ重視', '- 容量重視', '', '{{comparison}}', '', '本文です。'].join('\n'),
    );
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'list', 'comparison', 'paragraph']);
  });
});

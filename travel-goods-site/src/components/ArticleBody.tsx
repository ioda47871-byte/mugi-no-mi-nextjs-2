import Link from 'next/link';
import { parseMarkdown, type BlockNode, type InlineNode } from '@/lib/content/markdown';
import type { ReactNode } from 'react';

/**
 * 記事本文の描画（計画書 8節）。
 *
 * dangerouslySetInnerHTML を使わない。パーサーが返した限定的なノードだけを
 * React 要素へ写像するため、本文から任意のHTML・JavaScriptは実行されない。
 */

type Props = {
  body: string;
  /** {{comparison}} の位置に差し込む比較表。 */
  comparison?: ReactNode;
};

function renderInline(nodes: InlineNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.type) {
      case 'strong':
        return (
          <strong key={key} className="font-bold text-ink">
            {node.value}
          </strong>
        );
      case 'code':
        return (
          <code key={key} className="rounded bg-paper px-1 py-0.5 text-[0.9em] text-ink">
            {node.value}
          </code>
        );
      case 'link':
        return node.external ? (
          <a key={key} className="link-inline" href={node.href} target="_blank" rel="noopener noreferrer">
            {node.value}
          </a>
        ) : (
          <Link key={key} className="link-inline" href={node.href}>
            {node.value}
          </Link>
        );
      default:
        return <span key={key}>{node.value}</span>;
    }
  });
}

function renderBlock(block: BlockNode, index: number, comparison?: ReactNode): ReactNode {
  const key = `block-${index}`;
  switch (block.type) {
    case 'heading': {
      const className =
        block.level === 2
          ? 'mt-10 scroll-mt-24 border-l-4 border-accent pl-3 text-lg font-bold text-ink sm:text-xl'
          : block.level === 3
            ? 'mt-8 scroll-mt-24 text-base font-bold text-ink'
            : 'mt-6 scroll-mt-24 text-sm font-bold text-ink';
      if (block.level === 2) {
        return (
          <h2 key={key} id={block.id} className={className}>
            {renderInline(block.children, key)}
          </h2>
        );
      }
      if (block.level === 3) {
        return (
          <h3 key={key} id={block.id} className={className}>
            {renderInline(block.children, key)}
          </h3>
        );
      }
      return (
        <h4 key={key} id={block.id} className={className}>
          {renderInline(block.children, key)}
        </h4>
      );
    }
    case 'paragraph':
      return (
        <p key={key} className="mt-4 prose-body">
          {renderInline(block.children, key)}
        </p>
      );
    case 'list':
      return block.ordered ? (
        <ol key={key} className="mt-4 list-decimal space-y-2 pl-5 prose-body marker:text-ink-faint">
          {block.items.map((item, itemIndex) => (
            <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
          ))}
        </ol>
      ) : (
        <ul key={key} className="mt-4 list-disc space-y-2 pl-5 prose-body marker:text-accent">
          {block.items.map((item, itemIndex) => (
            <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
          ))}
        </ul>
      );
    case 'quote':
      return (
        <blockquote
          key={key}
          className="mt-5 rounded-r-lg border-l-4 border-accent/40 bg-accent-soft/50 px-4 py-3 prose-body"
        >
          {renderInline(block.children, key)}
        </blockquote>
      );
    case 'divider':
      return <hr key={key} className="my-8 border-paper-line" />;
    case 'comparison':
      return (
        <div key={key} className="my-6">
          {comparison ?? null}
        </div>
      );
    default:
      return null;
  }
}

export default function ArticleBody({ body, comparison }: Props) {
  const blocks = parseMarkdown(body);
  return <div className="max-w-prose">{blocks.map((block, index) => renderBlock(block, index, comparison))}</div>;
}

/**
 * 記事本文の Markdown をパースする（計画書 8節）。
 *
 * 方針:
 * - 生HTMLは一切解釈しない。危険な記法はパーサーが「ただの文字」として扱う。
 * - dangerouslySetInnerHTML を使わずに描画できる中間表現だけを返す。
 * - 対応記法を意図的に狭くし、想定外の入力が新しい表現に化けないようにする。
 *
 * 対応: 見出し(##〜####) / 段落 / 箇条書き / 番号付きリスト / 引用 /
 *       水平線 / リンク / 強調 / インラインコード / 比較表の差し込み {{comparison}}
 */

export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'strong'; value: string }
  | { type: 'code'; value: string }
  | { type: 'link'; value: string; href: string; external: boolean };

export type BlockNode =
  | { type: 'heading'; level: 2 | 3 | 4; text: string; id: string; children: InlineNode[] }
  | { type: 'paragraph'; children: InlineNode[] }
  | { type: 'list'; ordered: boolean; items: InlineNode[][] }
  | { type: 'quote'; children: InlineNode[] }
  | { type: 'divider' }
  | { type: 'comparison' };

const ALLOWED_LINK_PROTOCOLS = new Set(['https:', 'http:', 'mailto:']);

function safeHref(raw: string): { href: string; external: boolean } | null {
  const value = raw.trim();
  if (value.length === 0) return null;
  // サイト内リンク
  if (value.startsWith('/') && !value.startsWith('//')) {
    return { href: value, external: false };
  }
  if (value.startsWith('#')) return { href: value, external: false };
  try {
    const url = new URL(value);
    if (!ALLOWED_LINK_PROTOCOLS.has(url.protocol)) return null;
    return { href: url.toString(), external: url.protocol !== 'mailto:' };
  } catch {
    return null;
  }
}

function slugifyHeading(text: string, index: number): string {
  const base = text
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return base.length > 0 ? `${base}-${index}` : `section-${index}`;
}

/** インライン記法を解析する。未対応の記号はそのまま文字として残す。 */
export function parseInline(raw: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let buffer = '';

  const flush = () => {
    if (buffer.length > 0) {
      nodes.push({ type: 'text', value: buffer });
      buffer = '';
    }
  };

  let index = 0;
  while (index < raw.length) {
    const rest = raw.slice(index);

    const link = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(rest);
    if (link) {
      const target = safeHref(link[2] as string);
      if (target) {
        flush();
        nodes.push({
          type: 'link',
          value: link[1] as string,
          href: target.href,
          external: target.external,
        });
      } else {
        // 許可されないURLはリンクにせず、表示文字だけ残す。
        buffer += link[1] as string;
      }
      index += link[0].length;
      continue;
    }

    const strong = /^\*\*([^*\n]+)\*\*/.exec(rest);
    if (strong) {
      flush();
      nodes.push({ type: 'strong', value: strong[1] as string });
      index += strong[0].length;
      continue;
    }

    const code = /^`([^`\n]+)`/.exec(rest);
    if (code) {
      flush();
      nodes.push({ type: 'code', value: code[1] as string });
      index += code[0].length;
      continue;
    }

    buffer += raw[index];
    index += 1;
  }

  flush();
  return nodes;
}

export function parseMarkdown(body: string): BlockNode[] {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const blocks: BlockNode[] = [];
  let paragraph: string[] = [];
  let headingIndex = 0;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(' ').trim();
    paragraph = [];
    if (text.length > 0) blocks.push({ type: 'paragraph', children: parseInline(text) });
  };

  let cursor = 0;
  while (cursor < lines.length) {
    const line = lines[cursor] as string;
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      flushParagraph();
      cursor += 1;
      continue;
    }

    if (trimmed === '{{comparison}}') {
      flushParagraph();
      blocks.push({ type: 'comparison' });
      cursor += 1;
      continue;
    }

    if (/^-{3,}$/.test(trimmed)) {
      flushParagraph();
      blocks.push({ type: 'divider' });
      cursor += 1;
      continue;
    }

    const heading = /^(#{2,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      const level = (heading[1] as string).length as 2 | 3 | 4;
      const text = (heading[2] as string).trim();
      headingIndex += 1;
      blocks.push({
        type: 'heading',
        level,
        text,
        id: slugifyHeading(text, headingIndex),
        children: parseInline(text),
      });
      cursor += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      flushParagraph();
      const quoteLines: string[] = [];
      while (cursor < lines.length && /^>\s?/.test((lines[cursor] as string).trim())) {
        quoteLines.push((lines[cursor] as string).trim().replace(/^>\s?/, ''));
        cursor += 1;
      }
      blocks.push({ type: 'quote', children: parseInline(quoteLines.join(' ')) });
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    const ordered = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (bullet || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      const items: InlineNode[][] = [];
      while (cursor < lines.length) {
        const current = (lines[cursor] as string).trim();
        const match = isOrdered ? /^\d+\.\s+(.*)$/.exec(current) : /^[-*]\s+(.*)$/.exec(current);
        if (!match) break;
        items.push(parseInline((match[1] as string).trim()));
        cursor += 1;
      }
      blocks.push({ type: 'list', ordered: isOrdered, items });
      continue;
    }

    paragraph.push(trimmed);
    cursor += 1;
  }

  flushParagraph();
  return blocks;
}

/** 目次用の見出し一覧。 */
export function extractHeadings(blocks: BlockNode[]): { id: string; text: string; level: 2 | 3 | 4 }[] {
  return blocks
    .filter((block): block is Extract<BlockNode, { type: 'heading' }> => block.type === 'heading')
    .map(({ id, text, level }) => ({ id, text, level }));
}

interface NoBreakTextProps {
  text: string;
  /** この配列に含まれる語句だけをwhite-space: nowrapで包み、途中で改行されないようにする */
  phrases: string[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 長い文章の折り返し位置はブラウザに任せつつ、指定した語句(固有名詞など)だけは
 * white-space: nowrapで包んで途中改行を防ぐ汎用コンポーネント。
 * 特定の文言には依存しないため、phrasesを差し替えれば他の固有名詞保護にも使える。
 */
export function NoBreakText({ text, phrases }: NoBreakTextProps) {
  if (phrases.length === 0) return <>{text}</>;

  const pattern = new RegExp(`(${phrases.map(escapeRegExp).join('|')})`, 'g');
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, i) =>
        phrases.includes(part) ? (
          <span key={i} className="whitespace-nowrap">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

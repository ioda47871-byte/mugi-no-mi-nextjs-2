import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FORBIDDEN_OUTPUT_PATTERNS,
  RETIRED_DOMAIN,
  findForbiddenOutput,
} from '../src/lib/release/forbidden-output';

const LIVE_DOMAIN = 'tabimono-hikaku.com';

describe('本番成果物の禁止文字列', () => {
  it('旧予定ドメインを検出する', () => {
    expect(findForbiddenOutput(`<link rel="canonical" href="https://${RETIRED_DOMAIN}/" />`)).toContain(
      `旧予定ドメイン ${RETIRED_DOMAIN}（正式ドメインは .com）`,
    );
  });

  it('サブドメイン付きの旧予定ドメインも検出する', () => {
    expect(findForbiddenOutput(`https://www.${RETIRED_DOMAIN}/guide/`)).toHaveLength(1);
  });

  it('正式ドメイン tabimono-hikaku.com は検出しない', () => {
    expect(findForbiddenOutput(`<link rel="canonical" href="https://${LIVE_DOMAIN}/" />`)).toEqual([]);
    expect(findForbiddenOutput(`Sitemap: https://${LIVE_DOMAIN}/sitemap.xml`)).toEqual([]);
    expect(findForbiddenOutput(`contact@${LIVE_DOMAIN}`)).toEqual([]);
  });

  it('check:release の走査一覧に旧予定ドメインが載っている', () => {
    const labels = FORBIDDEN_OUTPUT_PATTERNS.map((entry) => entry.label);
    expect(labels.some((label) => label.includes(RETIRED_DOMAIN))).toBe(true);
  });
});

describe('成果物のもとになるファイルに旧予定ドメインが無い', () => {
  // 文書（docs/）には「当初は .jp を候補にしていた」という経緯を残すため、
  // ここでは配信物へ流れ込む入力だけを見る。
  const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const roots = ['src', 'datasets/production', 'public'].map((dir) => path.join(site, dir));

  const collect = (dir: string, acc: string[]): string[] => {
    if (!fs.existsSync(dir)) return acc;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(full, acc);
      else acc.push(full);
    }
    return acc;
  };

  it('src・本番データセット・publicのどこにも旧予定ドメインが無い', () => {
    const offenders = roots
      .flatMap((root) => collect(root, []))
      .filter((file) => fs.readFileSync(file, 'utf8').includes(RETIRED_DOMAIN))
      .map((file) => path.relative(site, file));
    expect(offenders).toEqual([]);
  });

  it('.env.example の例示URLが正式ドメインになっている', () => {
    const example = fs.readFileSync(path.join(site, '.env.example'), 'utf8');
    expect(example).toContain(`https://${LIVE_DOMAIN}`);
    expect(example).not.toContain(RETIRED_DOMAIN);
  });
});

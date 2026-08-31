import type { DatasetInfo } from '@/lib/catalog/types';
import { siteConfig } from '@/config/site';

/**
 * 画面上部の状態表示。読者に必要な一文だけを出す。
 *
 * - デモデータ使用中: 「すべて架空」であることを必ず知らせる。
 * - 実データのプレビュー: 「未公開プレビュー」と伝える。実商品に「架空」と表示しない。
 * - 本番 + 実データ: 何も出さない。
 */
export default function DatasetNotice({ dataset }: { dataset: DatasetInfo }) {
  if (dataset.kind === 'demo' && dataset.notice) {
    return (
      <div
        data-testid="demo-notice"
        role="note"
        className="border-b border-warn/30 bg-warn-soft px-4 py-2 text-center text-xs font-medium leading-relaxed text-warn"
      >
        <span className="font-bold">［デモデータ表示中］</span> {dataset.notice}
      </div>
    );
  }

  if (!siteConfig.isProduction) {
    return (
      <div
        data-testid="preview-notice"
        role="note"
        className="border-b border-paper-line bg-paper px-4 py-2 text-center text-xs leading-relaxed text-ink-faint"
      >
        未公開プレビューです。掲載内容は準備中のものが含まれます。
      </div>
    );
  }

  return null;
}

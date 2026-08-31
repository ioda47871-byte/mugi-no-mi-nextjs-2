import type { DatasetInfo } from '@/lib/catalog/types';
import { siteConfig } from '@/config/site';

/**
 * デモデータセットを使っていることを、全ページで必ず知らせる。
 * 本番モードではそもそもデモデータを読み込めない（load.ts で例外）。
 */
export default function DatasetNotice({ dataset }: { dataset: DatasetInfo }) {
  if (dataset.kind !== 'demo' || !dataset.notice) return null;
  return (
    <div
      data-testid="demo-notice"
      role="note"
      className="border-b border-warn/30 bg-warn-soft px-4 py-2 text-center text-xs font-medium leading-relaxed text-warn"
    >
      <span className="font-bold">［デモデータ表示中］</span> {dataset.notice}
      {siteConfig.mode === 'preview' ? '（このプレビューは noindex です）' : null}
    </div>
  );
}

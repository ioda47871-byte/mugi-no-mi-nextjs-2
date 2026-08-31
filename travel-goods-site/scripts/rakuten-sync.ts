/**
 * 楽天からの自動取得ジョブ（Phase 2-1）。
 *
 *   --mode links     登録済み商品のJAN・型番で検索し、紹介URLを取得して登録する
 *   --mode discover  キーワードで検索し、新しい商品候補を「未確認」で保存する
 *   --mode audit     表示中のリンクがまだ生きているかを確認する（販売終了の検出）
 *
 * 既定は dry-run（何も書き込まない）。書き込むには --apply が必要。
 * strong 一致を自動で verified にするには、さらに --auto-verify が必要。
 *
 * 守っていること（計画書 12-3節）:
 * - スケジュール実行の既定は OFF（AUTOMATION_ENABLED=true が必要）
 * - リクエスト数・レート・再試行に上限
 * - 同一ジョブの重複実行をロックで防ぐ
 * - 検証を通してからまとめて書き込む（途中状態で公開ファイルを壊さない）
 * - 外部の文言はデータとして扱い、指示として解釈しない
 * - 資格情報をログに出さない
 */
import fs from 'node:fs';
import path from 'node:path';
import { readDatasetInput, resolveDatasetDir, resolveDatasetKind } from '../src/lib/catalog/load';
import { inspectCatalog } from '../src/lib/catalog/validate';
import { isAutomationEnabled, readRakutenCredentials, redactSecrets } from '../src/lib/rakuten/config';
import { RakutenClient } from '../src/lib/rakuten/client';
import { matchProduct, pickBestMatch, searchKeywordsFor } from '../src/lib/rakuten/match';
import {
  mergeCandidates,
  pruneCandidates,
  readCandidates,
  writeCandidates,
  type Candidate,
} from '../src/lib/rakuten/candidates';
import type { MerchantLink, Product } from '../src/lib/catalog/types';

const argv = process.argv.slice(2);
const flag = (name: string): string | null => {
  const index = argv.indexOf(`--${name}`);
  if (index < 0) return null;
  const value = argv[index + 1];
  return value && !value.startsWith('--') ? value : null;
};
const has = (name: string) => argv.includes(`--${name}`);

function fail(message: string): never {
  console.error(`エラー: ${redactSecrets(message)}`);
  process.exit(2);
}

const mode = flag('mode') ?? 'links';
const apply = has('apply');
const autoVerify = has('auto-verify');
const keyword = flag('keyword');
const category = flag('category');
const maxRequests = Number(flag('max-requests') ?? 30);
const today = new Date().toISOString().slice(0, 10);

if (mode !== 'links' && mode !== 'discover' && mode !== 'audit') {
  fail('--mode は links / discover / audit のいずれかです。');
}
if (mode === 'discover' && !keyword) fail('--mode discover には --keyword が必要です。');
if (autoVerify && !apply) fail('--auto-verify は --apply と一緒に指定してください。');

// --- 前提の確認 -------------------------------------------------------
if (apply && !isAutomationEnabled()) {
  fail(
    '自動処理が無効です。書き込みを行うには AUTOMATION_ENABLED=true を設定してください（既定は false）。\n' +
      '  まず --apply なしの dry-run で結果を確認することをおすすめします。',
  );
}

const creds = readRakutenCredentials();
if (!creds.ok) {
  console.error('楽天ウェブサービスの資格情報が未設定です。');
  console.error(`  未設定: ${creds.missing.join(', ')}`);
  console.error('  取得手順は docs/rakuten-automation.md を参照してください。');
  console.error('  affiliateId が無いと紹介URL(affiliateUrl)は返りません。');
  process.exit(3);
}
const credentials = creds.credentials;

const datasetKind = resolveDatasetKind();
if (datasetKind !== 'production') fail(`本番データセット以外では実行しません（現在: ${datasetKind}）。`);
const datasetDir = resolveDatasetDir(datasetKind);

// --- 重複実行の防止 ---------------------------------------------------
const lockPath = path.resolve(process.cwd(), '.preview/rakuten-sync.lock');
fs.mkdirSync(path.dirname(lockPath), { recursive: true });
if (fs.existsSync(lockPath)) {
  const age = Date.now() - fs.statSync(lockPath).mtimeMs;
  if (age < 30 * 60 * 1000) {
    fail('同じジョブが実行中です（30分以内のロックが残っています）。完了を待ってください。');
  }
  fs.rmSync(lockPath);
}
fs.writeFileSync(lockPath, `${new Date().toISOString()}\n`, 'utf8');

async function main(): Promise<void> {
  const inspection = inspectCatalog(readDatasetInput(datasetKind), { now: new Date() });
  if (!inspection.ok) fail('データセットの検証に失敗しています。先に validate:content を通してください。');
  const catalog = inspection.catalog;

  const client = new RakutenClient(credentials, { maxRequests });

  console.log(`モード       : ${mode}`);
  console.log(`データセット : ${datasetKind}`);
  console.log(`書き込み     : ${apply ? 'あり' : 'なし（dry-run）'}`);
  console.log(`自動 verified: ${autoVerify ? 'あり（strong一致のみ）' : 'なし'}`);
  console.log('');

  if (mode === 'links') {
    await syncLinks(catalog.products, catalog.merchantLinks, client);
  } else if (mode === 'audit') {
    await auditLinks(catalog.products, catalog.merchantLinks, client);
  } else {
    await discover(catalog.products, client);
  }

  console.log(`\n使用リクエスト数: ${client.requestsUsed}`);
}

/** 登録済み商品の紹介URLを取得する。 */
async function syncLinks(
  products: Product[],
  existingLinks: MerchantLink[],
  client: RakutenClient,
): Promise<void> {
  // 対象は「公開または確認中」で、JANか十分な長さの型番を持つ商品。
  const targets = products.filter(
    (product) =>
      (product.status === 'published' || product.status === 'review') &&
      searchKeywordsFor(product).length > 0,
  );

  console.log(`対象商品: ${targets.length} 件`);
  const updates: MerchantLink[] = [];
  const skipped: string[] = [];

  for (const product of targets) {
    const keywords = searchKeywordsFor(product);
    let best: ReturnType<typeof pickBestMatch> = null;

    for (const query of keywords) {
      const items = await client.search({ keyword: query, hits: 20 });
      best = pickBestMatch(product, items);
      if (best?.match.confidence === 'strong') break;
    }

    if (!best) {
      skipped.push(`${product.id}: 一致する販売ページが見つかりませんでした`);
      continue;
    }

    const shouldVerify = autoVerify && best.match.confidence === 'strong';
    const link: MerchantLink = {
      productId: product.id,
      merchant: 'rakuten',
      externalProductId: best.item.itemCode,
      affiliateUrl: best.item.affiliateUrl as string,
      // バリエーション一致は表示条件。商品側の値をそのまま使う。
      matchedVariant: product.variant,
      verifiedAt: shouldVerify ? today : null,
      status: shouldVerify ? 'verified' : 'unverified',
      // 自動取得はリンク先を開いていない。目視確認と混同しない。
      verificationMethod: shouldVerify ? 'identifier-match' : null,
      note:
        `楽天APIで自動取得（${today}、一致度 ${best.match.confidence}）。` +
        `${best.match.reasons.join(' / ')}` +
        (shouldVerify ? '' : ' 表示するには色・サイズを目視確認して verified にしてください。'),
    };
    updates.push(link);

    console.log(
      `  ${product.id}\n` +
        `    一致度   : ${best.match.confidence}\n` +
        `    販売ページ: ${best.item.itemName.slice(0, 60)}\n` +
        `    状態     : ${link.status}${shouldVerify ? '（自動で表示対象）' : '（未表示）'}`,
    );
    if (best.match.blockers.length > 0) {
      console.log(`    未一致   : ${best.match.blockers.join(' / ')}`);
    }
  }

  for (const message of skipped) console.log(`  ${message}`);

  if (!apply) {
    console.log('\ndry-run のため書き込んでいません。--apply で反映します。');
    return;
  }

  // 検証を通してからまとめて書き込む
  const merged = [
    ...existingLinks.filter(
      (link) =>
        !(link.merchant === 'rakuten' && updates.some((entry) => entry.productId === link.productId)),
    ),
    ...updates,
  ];
  const rakutenLinks = merged.filter((link) => link.merchant === 'rakuten');

  const check = inspectCatalog(
    { ...readDatasetInput(datasetKind), merchantLinks: merged },
    { now: new Date() },
  );
  if (!check.ok) {
    console.error('\nこの内容では検証に通らないため、書き込みを中止しました:');
    for (const issue of check.issues.filter((i) => i.severity === 'error')) {
      console.error(`  - [${issue.code}] ${issue.subject}: ${issue.message}`);
    }
    process.exit(1);
  }

  const file = path.join(datasetDir, 'merchants', 'rakuten.json');
  fs.writeFileSync(file, `${JSON.stringify(rakutenLinks, null, 2)}\n`, 'utf8');
  console.log(`\n更新しました: ${file}（${updates.length} 件）`);
}

/**
 * 表示中のリンクがまだ生きているかを確認する。
 *
 * 商品が販売終了になってもリンクは残り、誰も気づかない。
 * JAN・型番で再検索して見つからなければ「販売終了の疑い」として報告する。
 *
 * **リンクを勝手に消さない。** --apply を付けたときだけ unverified に落とし、
 * 画面から外す。データは残すので、復活したときに戻せる。
 */
async function auditLinks(
  products: Product[],
  existingLinks: MerchantLink[],
  client: RakutenClient,
): Promise<void> {
  const productMap = new Map(products.map((product) => [product.id, product]));
  const targets = existingLinks.filter(
    (link) => link.merchant === 'rakuten' && link.status === 'verified',
  );

  console.log(`点検対象の楽天リンク: ${targets.length} 件`);
  const suspects: MerchantLink[] = [];

  for (const link of targets) {
    const product = productMap.get(link.productId);
    if (!product) continue;

    const keywords = searchKeywordsFor(product);
    if (keywords.length === 0) {
      console.log(`  ${link.productId}: JAN・型番が無いため自動点検できません`);
      continue;
    }

    let found = false;
    for (const query of keywords) {
      const items = await client.search({ keyword: query, hits: 20 });
      if (pickBestMatch(product, items)) {
        found = true;
        break;
      }
    }

    if (found) {
      console.log(`  ${link.productId}: 販売を確認できました`);
    } else {
      suspects.push(link);
      console.log(`  ${link.productId}: 販売ページが見つかりません（販売終了の疑い）`);
    }
  }

  if (suspects.length === 0) {
    console.log('\n表示中のリンクはすべて販売を確認できました。');
    return;
  }

  console.log(`\n販売終了の疑いがあるリンク: ${suspects.length} 件`);
  console.log('検索で見つからないだけの可能性もあります。リンク先を開いて確認してください。');

  if (!apply) {
    console.log('\ndry-run のため変更していません。--apply で画面から外します（削除はしません）。');
    return;
  }

  const updated = existingLinks
    .filter((link) => link.merchant === 'rakuten')
    .map((link) =>
      suspects.some((s) => s.productId === link.productId)
        ? {
            ...link,
            status: 'unverified' as const,
            verifiedAt: null,
            verificationMethod: null,
            note: `${today} の点検で販売ページを確認できず、表示から外しました。復活を確認したら再度 verified にしてください。`,
          }
        : link,
    );

  const merged = [...existingLinks.filter((l) => l.merchant !== 'rakuten'), ...updated];
  const check = inspectCatalog(
    { ...readDatasetInput(datasetKind), merchantLinks: merged },
    { now: new Date() },
  );
  if (!check.ok) {
    console.error('\nこの内容では検証に通らないため、書き込みを中止しました。');
    process.exit(1);
  }

  fs.writeFileSync(
    path.join(datasetDir, 'merchants', 'rakuten.json'),
    `${JSON.stringify(updated, null, 2)}\n`,
    'utf8',
  );
  console.log(`\n${suspects.length} 件を画面から外しました（データは残しています）。`);
}

/** 新しい商品候補を集める。採用は人が決める。 */
async function discover(products: Product[], client: RakutenClient): Promise<void> {
  const items = await client.search({ keyword: keyword as string, hits: 30 });
  console.log(`検索語「${keyword}」の結果: ${items.length} 件`);

  const incoming: Candidate[] = items.map((item) => {
    // 既存商品と結び付くかを調べる（結び付けば「新商品候補」ではない）
    let matchedProductId: string | null = null;
    let confidence: 'strong' | 'weak' | 'none' = 'none';
    let reasons: string[] = [];
    for (const product of products) {
      const result = matchProduct(product, item);
      if (result.confidence !== 'none') {
        matchedProductId = product.id;
        confidence = result.confidence;
        reasons = result.reasons;
        break;
      }
    }

    return {
      itemCode: item.itemCode,
      itemName: item.itemName,
      shopName: item.shopName ?? null,
      affiliateUrl: item.affiliateUrl ?? null,
      query: keyword as string,
      category: category ?? null,
      matchedProductId,
      matchConfidence: confidence,
      matchReasons: reasons.slice(0, 10),
      fetchedAt: today,
      status: 'new',
    };
  });

  const newOnes = incoming.filter((entry) => entry.matchedProductId === null);
  console.log(`  うち既存商品と結び付かない候補: ${newOnes.length} 件`);
  for (const entry of newOnes.slice(0, 10)) {
    console.log(`    - ${entry.itemName.slice(0, 70)}`);
  }
  if (newOnes.length > 10) console.log(`    …ほか ${newOnes.length - 10} 件`);

  console.log(
    '\n候補はメーカー公表仕様を含みません。採用するには、仕様の出典を別途確認し、' +
      '\n商品として登録する必要があります（自動では公開されません）。',
  );

  if (!apply) {
    console.log('\ndry-run のため書き込んでいません。--apply で保存します。');
    return;
  }

  const existing = readCandidates(datasetDir);
  const merged = pruneCandidates(mergeCandidates(existing, incoming), new Date());
  writeCandidates(datasetDir, merged);
  console.log(`\n候補を保存しました: ${path.join(datasetDir, 'candidates/rakuten.json')}（${merged.length} 件）`);
}

main()
  .catch((error: unknown) => {
    console.error(redactSecrets(`実行に失敗しました: ${(error as Error).message}`));
    process.exitCode = 1;
  })
  .finally(() => {
    fs.rmSync(lockPath, { force: true });
  });

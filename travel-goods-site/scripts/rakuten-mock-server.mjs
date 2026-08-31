// 楽天商品検索APIの応答を模したローカルのモック。127.0.0.1 でのみ待ち受ける。
// 目的: 資格情報が届く前に、取得ジョブの動きを最後まで通しで確かめる。
// 返す値はすべて架空。実在の紹介URL・店舗ではない。
import http from 'node:http';

const AFFILIATE = (id) => `https://hb.afl.rakuten.co.jp/ichiba/mock0000.mock0000.mock0001.mock0002/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fmockshop%2F${id}%2F`;

// キーワード（型番・JAN）→ 返す商品
const CATALOG = [
  {
    // 型番とJANの両方が本文に入る = strong 一致になるはず
    match: ['4549550317535', 'BMA-TRCS01MBK'],
    item: {
      itemCode: 'mockshop:bma-trcs01mbk',
      itemName: 'エレコム BMA-TRCS01MBK 旅行用パッキングキューブ Mサイズ ブラック',
      itemCaption: 'メーカー品番 BMA-TRCS01MBK / JANコード 4549550317535',
      affiliateUrl: AFFILIATE('bma-trcs01mbk'),
      itemUrl: 'https://item.rakuten.co.jp/mockshop/bma-trcs01mbk/',
      shopName: 'モック商店',
      itemPrice: 3186,
    },
  },
  {
    // 型番だけ一致（JANが公表されていない商品）= weak 一致になるはず
    match: ['クレスタS 09161'],
    item: {
      itemCode: 'mockshop:ace-09161',
      itemName: 'エース クレスタS 09161 スーツケース 35/42L ガンメタリック',
      itemCaption: 'ACE クレスタS 09161 機内持ち込み エキスパンダブル',
      affiliateUrl: AFFILIATE('ace-09161'),
      itemUrl: 'https://item.rakuten.co.jp/mockshop/ace-09161/',
      shopName: 'モック商店',
      itemPrice: 29700,
    },
  },
  {
    // affiliateUrl が無い = 採用されないはず（affiliateId 未設定時の再現）
    match: ['A110DN11'],
    item: {
      itemCode: 'mockshop:anker-a110dn11',
      itemName: 'Anker Zolo Power Bank 10000mAh A110DN11 ブラック',
      itemCaption: '型番 A110DN11',
      itemUrl: 'https://item.rakuten.co.jp/mockshop/anker-a110dn11/',
      shopName: 'モック商店',
      itemPrice: 4990,
    },
  },
];

const FORMAT = process.env.MOCK_FORMAT ?? 'lower'; // upper | lower | flat
const log = [];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const keyword = url.searchParams.get('keyword') ?? '';
  const hasAffiliateId = Boolean(url.searchParams.get('affiliateId'));
  const hasApplicationId = Boolean(url.searchParams.get('applicationId'));
  const hasAccessKey = Boolean(req.headers.accesskey);
  // 値は保持・出力しない。モックにも必ず架空の資格情報を使う。
  log.push({ hasAffiliateId, hasApplicationId, hasAccessKey });
  if (!hasApplicationId || !hasAccessKey) {
    res.writeHead(401, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'missing_credentials' }));
    return;
  }

  const hits = CATALOG.filter((entry) =>
    entry.match.some((m) => m.replace(/\s/g, '').toUpperCase() === keyword.replace(/\s/g, '').toUpperCase()),
  ).map((entry) => {
    const item = { ...entry.item };
    // 実APIと同じく、affiliateId が無ければ affiliateUrl は返さない
    if (!hasAffiliateId) delete item.affiliateUrl;
    else if (item.affiliateUrl) item.itemUrl = item.affiliateUrl;
    return item;
  });

  const body =
    FORMAT === 'lower'
      ? { items: hits.map((item) => ({ item })), count: hits.length }
      : FORMAT === 'flat'
        ? { Items: hits, count: hits.length }
        : { Items: hits.map((Item) => ({ Item })), count: hits.length };

  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
});

process.on('SIGTERM', () => {
  console.error(JSON.stringify(log, null, 2));
  server.close(() => process.exit(0));
});

server.listen(8791, '127.0.0.1', () => console.error('mock listening on 8791 format=' + FORMAT));

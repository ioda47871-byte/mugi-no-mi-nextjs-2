'use client';

import { cubicPoint, cubicTangentAngleDeg, willowLeafPath, type Point } from '@/lib/svg-curve';

type WheatVariant = 'sprig' | 'pair' | 'spray';

interface WheatDecorationProps {
  className?: string;
  /**
   * sprig: 縦に1本立つ穂(既定)。pair: 高さ・角度違いの2本が根元で交差する束。
   * spray: 見出し脇に添える横流れの枝(参考画像の横長ガーランドを基準にした、
   * 茎が横方向へ緩やかに波打ちながら伸び、複数の穂と葉が付く構成)。
   */
  variant?: WheatVariant;
  /**
   * 茎の傾き方向。見出しの左右に対称配置する際、機械的な鏡写しにならないよう
   * 左右で茎のカーブ自体を変える(単純なCSS -scale-x-100ミラーではない)。
   */
  lean?: 'left' | 'right';
}

interface StalkConfig {
  height: number;
  tipLateral: number;
  grainCount: number;
  grainZone: [number, number];
  grainScale: number;
  /** 穂の下、茎の途中から伸びる細い葉(参考画像の「穂+葉が混ざった枝」を再現) */
  leafPositions?: number[];
}

/** 1本の麦の穂(茎+粒+芒+葉)のpath群を返す。原点は常に(0, baseY) */
function buildStalk(baseX: number, baseY: number, config: StalkConfig, lean: 'left' | 'right') {
  const dir = lean === 'right' ? 1 : -1;
  const tipX = baseX + dir * config.tipLateral;
  const tipY = baseY - config.height;

  const p0: Point = [baseX, baseY];
  const p1: Point = [baseX, baseY - config.height * 0.62];
  const p2: Point = [tipX, baseY - config.height * 0.86];
  const p3: Point = [tipX, tipY];

  const stemPath = `M${p0[0]} ${p0[1]} C ${p1[0]} ${p1[1]}, ${p2[0]} ${p2[1]}, ${p3[0]} ${p3[1]}`;

  const [zoneStart, zoneEnd] = config.grainZone;
  const grains = Array.from({ length: config.grainCount }, (_, i) => {
    const t = config.grainCount === 1 ? zoneStart : zoneStart + (i / (config.grainCount - 1)) * (zoneEnd - zoneStart);
    const [x, y] = cubicPoint(p0, p1, p2, p3, t);
    const tangent = cubicTangentAngleDeg(p0, p1, p2, p3, t);
    const side = i % 2 === 0 ? 1 : -1;
    const bulge = Math.sin(Math.PI * ((t - zoneStart) / (zoneEnd - zoneStart)));
    const grainAngle = tangent - 90 + side * (32 + (1 - bulge) * 12);
    const scale = config.grainScale * (0.6 + 0.42 * bulge);

    return { x, y, angle: grainAngle, scale };
  });

  const leaves = (config.leafPositions ?? []).map((t, i) => {
    const [x, y] = cubicPoint(p0, p1, p2, p3, t);
    const tangent = cubicTangentAngleDeg(p0, p1, p2, p3, t);
    const side = i % 2 === 0 ? 1 : -1;
    const leafLen = config.height * 0.22;
    return willowLeafPath([x, y], tangent - 90 + side * 32, leafLen, leafLen * 0.17);
  });

  return { stemPath, tipX, tipY, grains, leaves };
}

// 粒はやや細身の紡錘形(参考画像の繊細な粒に合わせ、幅を絞っている)。
// 芒(のぎ)は粒の先からさらに長く伸ばし、麦らしい「棘立った」印象を出す。
const GRAIN_D = 'M0 0 C-1.6 -5.8 -1.2 -13.4 0 -19 C1.2 -13.4 1.6 -5.8 0 0 Z';
const AWN_D = 'M0 -19 L1.5 -37';

/**
 * 見出し脇に添える、横方向へ緩やかに波打つ茎(spray variant)。
 * buildStalk(縦の穂)とは軸の向きが違うため、粒・葉の角度は接線に対して
 * ±90度を基準に計算し直している。leanで波打つ向き自体を変え、
 * 単純な鏡写しにならないようにしている。
 */
function buildSpray(lean: 'left' | 'right') {
  const p0: Point = [4, 27];
  const p1: Point = lean === 'right' ? [42, 6] : [42, 44];
  const p2: Point = lean === 'right' ? [92, 38] : [92, 12];
  const p3: Point = [134, lean === 'right' ? 17 : 29];

  const stemPath = `M${p0[0]} ${p0[1]} C ${p1[0]} ${p1[1]}, ${p2[0]} ${p2[1]}, ${p3[0]} ${p3[1]}`;

  const grainZone: [number, number] = [0.1, 0.95];
  const grainCount = 9;
  const grains = Array.from({ length: grainCount }, (_, i) => {
    const t = grainZone[0] + (i / (grainCount - 1)) * (grainZone[1] - grainZone[0]);
    const [x, y] = cubicPoint(p0, p1, p2, p3, t);
    const tangent = cubicTangentAngleDeg(p0, p1, p2, p3, t);
    const side = i % 2 === 0 ? 1 : -1;
    const jitter = pseudoJitter(i * 4.1 + 0.6);
    const grainAngle = tangent + side * (66 + jitter * 10);
    const scale = 0.62 + 0.32 * Math.sin(Math.PI * ((t - grainZone[0]) / (grainZone[1] - grainZone[0]))) + jitter * 0.1;
    return { x, y, angle: grainAngle, scale };
  });

  const leafPositions = [0.2, 0.38, 0.56, 0.74, 0.88];
  const leaves = leafPositions.map((t, i) => {
    const [x, y] = cubicPoint(p0, p1, p2, p3, t);
    const tangent = cubicTangentAngleDeg(p0, p1, p2, p3, t);
    const side = i % 2 === 0 ? -1 : 1;
    const jitter = pseudoJitter(i * 6.2 + 3);
    const leafLen = 12 + jitter * 3;
    return willowLeafPath([x, y], tangent + side * (26 + jitter * 6), leafLen, leafLen * 0.18);
  });

  return { stemPath, grains, leaves };
}

/** 決定論的な疑似乱数(0〜1)。WillowDecoration.tsxと同じ簡易ハッシュ */
function pseudoJitter(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function Stalk({ stalk }: { stalk: ReturnType<typeof buildStalk> }) {
  return (
    <>
      <path d={stalk.stemPath} />
      <path d={`M${stalk.tipX} ${stalk.tipY} L${stalk.tipX} ${stalk.tipY - 13}`} />
      {stalk.leaves.map((d, i) => (
        <path key={`leaf-${i}`} d={d} />
      ))}
      {stalk.grains.map((g, i) => (
        <g key={i} transform={`translate(${g.x.toFixed(1)} ${g.y.toFixed(1)}) rotate(${g.angle.toFixed(1)}) scale(${g.scale.toFixed(2)})`}>
          <path d={GRAIN_D} />
          <path d={AWN_D} />
        </g>
      ))}
    </>
  );
}

/**
 * 小麦の穂の線画装飾。パン・商品・焼き上がりに関する箇所を表すモチーフ
 * (店・空間を表すWillowDecoration.tsxとは役割を分けている)。
 * 単純な「茎+均等な葉のはしご」ではなく、緩やかにカーブする茎に沿って
 * 粒(先端が尖った紡錘形)と細い芒(のぎ)を実座標ベースで配置しており、
 * 植物図鑑の線画に近い印象を狙っている。leanで茎の曲がる向きそのものを
 * 変えられるため、見出し左右に置いても機械的な鏡写しにならない。
 */
export function WheatDecoration({ className = '', variant = 'sprig', lean = 'right' }: WheatDecorationProps) {
  if (variant === 'spray') {
    const spray = buildSpray(lean);
    return (
      <svg
        viewBox="0 0 140 46"
        fill="none"
        stroke="currentColor"
        strokeWidth={0.65}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={className}
      >
        <path d={spray.stemPath} />
        {spray.leaves.map((d, i) => (
          <path key={`leaf-${i}`} d={d} />
        ))}
        {spray.grains.map((g, i) => (
          <g key={i} transform={`translate(${g.x.toFixed(1)} ${g.y.toFixed(1)}) rotate(${g.angle.toFixed(1)}) scale(${g.scale.toFixed(2)})`}>
            <path d={GRAIN_D} />
            <path d={AWN_D} />
          </g>
        ))}
      </svg>
    );
  }

  if (variant === 'pair') {
    const back = buildStalk(
      26,
      150,
      { height: 132, tipLateral: 12, grainCount: 10, grainZone: [0.16, 0.92], grainScale: 0.85, leafPositions: [0.28, 0.42] },
      lean === 'right' ? 'left' : 'right',
    );
    const front = buildStalk(
      34,
      150,
      { height: 150, tipLateral: 16, grainCount: 11, grainZone: [0.14, 0.94], grainScale: 1, leafPositions: [0.22, 0.36, 0.5] },
      lean,
    );

    return (
      <svg
        viewBox="0 0 60 152"
        fill="none"
        stroke="currentColor"
        strokeWidth={0.68}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={className}
      >
        <g opacity={0.7}>
          <Stalk stalk={back} />
        </g>
        <Stalk stalk={front} />
      </svg>
    );
  }

  const stalk = buildStalk(
    30,
    128,
    { height: 116, tipLateral: 15, grainCount: 10, grainZone: [0.15, 0.93], grainScale: 1, leafPositions: [0.24, 0.4] },
    lean,
  );

  return (
    <svg
      viewBox="0 0 60 130"
      fill="none"
      stroke="currentColor"
      strokeWidth={0.68}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <Stalk stalk={stalk} />
    </svg>
  );
}

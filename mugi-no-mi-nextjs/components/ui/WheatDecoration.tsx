'use client';

import { cubicPoint, cubicTangentAngleDeg, type Point } from '@/lib/svg-curve';

type WheatVariant = 'sprig' | 'pair';

interface WheatDecorationProps {
  className?: string;
  /** sprig: 1本の穂(既定)。pair: 高さ・角度違いの2本が根元で交差する、やや華やかな束 */
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
}

/** 1本の麦の穂(茎+粒+芒)のpath群を返す。原点は常に(0, baseY) */
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
    const grainAngle = tangent - 90 + side * (48 + (1 - bulge) * 18);
    const scale = config.grainScale * (0.62 + 0.4 * bulge);

    return { x, y, angle: grainAngle, scale };
  });

  return { stemPath, tipX, tipY, grains };
}

const GRAIN_D = 'M0 0 C-2.6 -5.5 -2.1 -12.5 0 -17 C2.1 -12.5 2.6 -5.5 0 0 Z';
const AWN_D = 'M0 -17 L1.6 -30';

function Stalk({ stalk }: { stalk: ReturnType<typeof buildStalk> }) {
  return (
    <>
      <path d={stalk.stemPath} />
      <path d={`M${stalk.tipX} ${stalk.tipY} L${stalk.tipX} ${stalk.tipY - 12}`} />
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
  if (variant === 'pair') {
    const back = buildStalk(26, 150, { height: 132, tipLateral: 12, grainCount: 8, grainZone: [0.18, 0.92], grainScale: 0.85 }, lean === 'right' ? 'left' : 'right');
    const front = buildStalk(34, 150, { height: 150, tipLateral: 16, grainCount: 9, grainZone: [0.15, 0.94], grainScale: 1 }, lean);

    return (
      <svg
        viewBox="0 0 60 152"
        fill="none"
        stroke="currentColor"
        strokeWidth={0.9}
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

  const stalk = buildStalk(30, 128, { height: 116, tipLateral: 15, grainCount: 9, grainZone: [0.16, 0.93], grainScale: 1 }, lean);

  return (
    <svg
      viewBox="0 0 60 130"
      fill="none"
      stroke="currentColor"
      strokeWidth={0.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <Stalk stalk={stalk} />
    </svg>
  );
}

'use client';

import { useId, type CSSProperties } from 'react';
import { cubicPoint, cubicTangentAngleDeg, droopControlPoints, droopPath, type Point } from '@/lib/svg-curve';

type WillowVariant = 'canopy' | 'corner' | 'branch' | 'sprig';

interface WillowDecorationProps {
  className?: string;
  /** ページ端に入り込む装飾などで、内側へ向かって消えるmask-imageを指定する場合に使用 */
  style?: CSSProperties;
  /**
   * 装飾の規模(3階層):
   * - canopy: LEVEL1。大型の背景装飾(例: Galleryページ右上から垂れる柳)。
   *   本数が多く、内部にグラデーションを持ち、下(先端)へ向かうほど自動的に透明になる。
   * - corner: LEVEL1〜2。ページの角(Heroの端など)から入り込む、canopyよりやや小ぶりで
   *   非対称な柳。こちらもグラデーションで先端が消える。
   * - branch: LEVEL2。ページ余白・カードの角に添える中くらいの柳の枝(3本)。
   * - sprig: LEVEL3。見出し脇・小さなカードの角に添える控えめな小枝(2本)。
   * 既定はbranch。
   */
  variant?: WillowVariant;
  /** trueの場合、左右反転して表示する */
  flip?: boolean;
}

interface VariantConfig {
  viewBox: string;
  origin: Point;
  count: number;
  lateralMin: number;
  lateralMax: number;
  spreadUnit: number;
  baseLength: number;
  edgeShorten: number;
  tickPositions: number[];
  tickLenBase: number;
  strokeWidth: number;
  fade: boolean;
}

const VARIANTS: Record<WillowVariant, VariantConfig> = {
  canopy: {
    viewBox: '0 0 460 420',
    origin: [230, 2],
    count: 11,
    lateralMin: -1,
    lateralMax: 1,
    spreadUnit: 150,
    baseLength: 380,
    edgeShorten: 0.24,
    tickPositions: [0.3, 0.45, 0.6, 0.74, 0.87],
    tickLenBase: 20,
    strokeWidth: 0.85,
    fade: true,
  },
  corner: {
    viewBox: '0 0 300 340',
    origin: [300, 2],
    count: 6,
    lateralMin: -1.1,
    lateralMax: 0.05,
    spreadUnit: 110,
    baseLength: 280,
    edgeShorten: 0.2,
    tickPositions: [0.28, 0.46, 0.63, 0.78, 0.9],
    tickLenBase: 16,
    strokeWidth: 0.85,
    fade: true,
  },
  branch: {
    viewBox: '0 0 100 240',
    origin: [50, 2],
    count: 4,
    lateralMin: -1,
    lateralMax: 1,
    spreadUnit: 24,
    baseLength: 220,
    edgeShorten: 0.14,
    tickPositions: [0.3, 0.48, 0.65, 0.8, 0.92],
    tickLenBase: 9,
    strokeWidth: 1,
    fade: false,
  },
  sprig: {
    viewBox: '0 0 60 130',
    origin: [30, 2],
    count: 2,
    lateralMin: -1,
    lateralMax: 1,
    spreadUnit: 8,
    baseLength: 118,
    edgeShorten: 0.08,
    tickPositions: [0.45, 0.85],
    tickLenBase: 6,
    strokeWidth: 1,
    fade: false,
  },
};

/**
 * 柳の枝が垂れる線画装飾。店・空間・土地としてのBrot yanagiらしさを表す
 * モチーフ(装飾の使い分けはWheatDecoration.tsxのコメントを参照)。
 *
 * 単一の小さなアイコンではなく、根元(画面の外にある柳の木を想定した1点)
 * から複数の枝が扇状に垂れ下がる構造を、variantごとの本数・広がり・
 * 長さのパラメータから生成している。各枝は「根元付近はほぼ直進し、
 * 中盤から先端にかけて大きく流れる」曲線(lib/svg-curve.tsのdroopPath)で、
 * 重力で垂れるシルエットを表現する。葉の刻みは枝の曲線上の実座標・接線
 * 角度から配置しているため、曲線の形を変えても自動的に追従する。
 * canopy/cornerは内部にグラデーションを持ち、先端(コンテンツに近づく側)
 * ほど自動的に透明になる(呼び出し側でopacityを追加調整する必要はない)。
 */
export function WillowDecoration({ className = '', style, variant = 'branch', flip = false }: WillowDecorationProps) {
  const gradId = useId();
  const config = VARIANTS[variant];
  const { viewBox, origin, count, lateralMin, lateralMax, spreadUnit, baseLength, edgeShorten, tickPositions, tickLenBase, strokeWidth, fade } = config;
  const stroke = fade ? `url(#${gradId})` : 'currentColor';

  const strands = Array.from({ length: count }, (_, i) => {
    const frac = count === 1 ? 0.5 : i / (count - 1);
    const lateral = lateralMin + frac * (lateralMax - lateralMin);
    const lengthFactor = 1 - edgeShorten * Math.abs(lateral);
    const end: Point = [origin[0] + lateral * spreadUnit, origin[1] + baseLength * lengthFactor];
    const [p0, p1, p2, p3] = droopControlPoints(origin, end);

    // 柳の葉は枝からほぼ垂直に突き出すのではなく、枝が伸びていく方向(接線)に
    // 沿って細長く伸びる。接線方向を基準に左右へごく浅い角度(18〜26度)だけ
    // 振ることで、扇状の骨(オリーブ/ユーカリ的な見え方)ではなく、柳らしい
    // 「枝に沿って垂れる細葉」に近づける。葉の先端をわずかにたわませ
    // (Q曲線)、直線的な硬さも避けている。
    const ticks = tickPositions.map((t, ti) => {
      const [x, y] = cubicPoint(p0, p1, p2, p3, t);
      const tangent = cubicTangentAngleDeg(p0, p1, p2, p3, t);
      const side = ti % 2 === 0 ? 1 : -1;
      const spread = 18 + (ti % 3) * 4;
      const leafAngle = ((tangent + side * spread) * Math.PI) / 180;
      const len = tickLenBase * (1 - 0.22 * t);
      const tx = x + len * Math.cos(leafAngle);
      const ty = y + len * Math.sin(leafAngle);
      const bowAngle = ((tangent + side * (spread * 0.5)) * Math.PI) / 180;
      const mx = x + len * 0.55 * Math.cos(bowAngle);
      const my = y + len * 0.55 * Math.sin(bowAngle);
      return `M${x.toFixed(1)} ${y.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`;
    });

    return { pathD: droopPath(origin, end), ticks };
  });

  return (
    <svg
      viewBox={viewBox}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${flip ? '-scale-x-100' : ''} ${className}`}
      style={style}
    >
      {fade && (
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {strands.map((s, i) => (
        <g key={i}>
          <path d={s.pathD} />
          {s.ticks.map((d, ti) => (
            <path key={ti} d={d} />
          ))}
        </g>
      ))}
    </svg>
  );
}

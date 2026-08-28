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
    count: 9,
    lateralMin: -1,
    lateralMax: 1,
    spreadUnit: 210,
    baseLength: 380,
    edgeShorten: 0.22,
    tickPositions: [0.32, 0.48, 0.63, 0.78, 0.9],
    tickLenBase: 15,
    strokeWidth: 0.85,
    fade: true,
  },
  corner: {
    viewBox: '0 0 300 340',
    origin: [300, 2],
    count: 5,
    lateralMin: -1.15,
    lateralMax: 0.1,
    spreadUnit: 150,
    baseLength: 280,
    edgeShorten: 0.18,
    tickPositions: [0.3, 0.5, 0.68, 0.85],
    tickLenBase: 13,
    strokeWidth: 0.85,
    fade: true,
  },
  branch: {
    viewBox: '0 0 100 240',
    origin: [50, 2],
    count: 3,
    lateralMin: -1,
    lateralMax: 1,
    spreadUnit: 16,
    baseLength: 220,
    edgeShorten: 0.12,
    tickPositions: [0.35, 0.55, 0.75, 0.92],
    tickLenBase: 8,
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

    const ticks = tickPositions.map((t, ti) => {
      const [x, y] = cubicPoint(p0, p1, p2, p3, t);
      const tangent = cubicTangentAngleDeg(p0, p1, p2, p3, t);
      const side = ti % 2 === 0 ? 1 : -1;
      const leafAngle = ((tangent + side * 68) * Math.PI) / 180;
      const len = tickLenBase * (1 - 0.28 * t);
      const tx = x + len * Math.cos(leafAngle);
      const ty = y + len * Math.sin(leafAngle);
      return `M${x.toFixed(1)} ${y.toFixed(1)} L${tx.toFixed(1)} ${ty.toFixed(1)}`;
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

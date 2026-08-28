/**
 * WillowDecoration.tsx / WheatDecoration.tsx専用の、3次ベジェ曲線上の
 * 座標・接線角度を求める純粋関数群。柳の葉/小麦の粒を「枝(茎)の上の
 * 実際の位置・向き」に沿って配置するために使う(固定座標の手打ちを避け、
 * 曲線の形を変えても葉/粒の位置が自動的に追従するようにするため)。
 */

export type Point = readonly [number, number];

export function cubicPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const x = mt ** 3 * p0[0] + 3 * mt ** 2 * t * p1[0] + 3 * mt * t ** 2 * p2[0] + t ** 3 * p3[0];
  const y = mt ** 3 * p0[1] + 3 * mt ** 2 * t * p1[1] + 3 * mt * t ** 2 * p2[1] + t ** 3 * p3[1];
  return [x, y];
}

/** 接線の角度(度)。0度=+x方向、90度=+y方向(SVG座標系) */
export function cubicTangentAngleDeg(p0: Point, p1: Point, p2: Point, p3: Point, t: number): number {
  const mt = 1 - t;
  const dx = 3 * mt ** 2 * (p1[0] - p0[0]) + 6 * mt * t * (p2[0] - p1[0]) + 3 * t ** 2 * (p3[0] - p2[0]);
  const dy = 3 * mt ** 2 * (p1[1] - p0[1]) + 6 * mt * t * (p2[1] - p1[1]) + 3 * t ** 2 * (p3[1] - p2[1]);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/**
 * 「重力で垂れる」柳らしい曲線: 根元(origin)付近はほぼ真っ直ぐ垂れ、
 * 中盤から先端(end)に向けて横に大きく流れる。制御点2つを持つ
 * 3次ベジェのd文字列(先頭の"M"含む)を返す。
 */
export function droopPath(origin: Point, end: Point): string {
  const [ox, oy] = origin;
  const [ex, ey] = end;
  const c1: Point = [ox + (ex - ox) * 0.15, oy + (ey - oy) * 0.27];
  const c2: Point = [ox + (ex - ox) * 0.75, oy + (ey - oy) * 0.68];
  return `M${ox} ${oy} C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${ex} ${ey}`;
}

export function droopControlPoints(origin: Point, end: Point): [Point, Point, Point, Point] {
  const [ox, oy] = origin;
  const [ex, ey] = end;
  const c1: Point = [ox + (ex - ox) * 0.15, oy + (ey - oy) * 0.27];
  const c2: Point = [ox + (ex - ox) * 0.75, oy + (ey - oy) * 0.68];
  return [origin, c1, c2, end];
}

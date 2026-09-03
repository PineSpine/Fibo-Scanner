export interface Fit {
  slope: number;
  intercept: number;
  /** Bestimmtheitsmass 0..1. Bei weniger als zwei Punkten 0. */
  r2: number;
  n: number;
}

/**
 * Lineare Ausgleichsgerade nach kleinsten Quadraten.
 * Quelle: Standardformel, etwa Bronstein, Taschenbuch der Mathematik, Kap. 16.
 */
export function leastSquares(xs: readonly number[], ys: readonly number[]): Fit {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return { slope: 0, intercept: 0, r2: 0, n };

  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]!;
    sy += ys[i]!;
  }
  const mx = sx / n;
  const my = sy / n;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0) return { slope: 0, intercept: my, r2: 0, n };

  const slope = sxy / sxx;
  // syy === 0 heisst: alle y gleich. Die Gerade trifft exakt, aber sie sagt
  // nichts aus. r2 = 0 ist hier ehrlicher als r2 = 1.
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept: my - slope * mx, r2, n };
}

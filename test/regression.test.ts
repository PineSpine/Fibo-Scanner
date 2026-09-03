import { describe, expect, it } from 'vitest';
import { leastSquares } from '../src/metrics/regression.ts';

describe('Ausgleichsgerade', () => {
  it('findet eine exakte Gerade', () => {
    const xs = [0, 1, 2, 3, 4];
    const ys = xs.map((x) => 2.5 * x - 1);
    const fit = leastSquares(xs, ys);
    expect(fit.slope).toBeCloseTo(2.5, 12);
    expect(fit.intercept).toBeCloseTo(-1, 12);
    expect(fit.r2).toBeCloseTo(1, 12);
  });

  it('meldet fehlende Streuung in y als r2 = 0, nicht als perfekte Passung', () => {
    const fit = leastSquares([0, 1, 2], [5, 5, 5]);
    expect(fit.slope).toBe(0);
    expect(fit.r2).toBe(0);
  });

  it('braucht mindestens zwei Punkte', () => {
    expect(leastSquares([1], [1]).n).toBe(1);
    expect(leastSquares([1], [1]).r2).toBe(0);
  });
});

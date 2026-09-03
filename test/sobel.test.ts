import { describe, expect, it } from 'vitest';
import { sobelMagnitude } from '../src/metrics/sobel.ts';

function image(width: number, height: number, f: (x: number, y: number) => number): Uint8Array {
  const d = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) d[y * width + x] = f(x, y);
  return d;
}

describe('Sobel-Betrag', () => {
  it('sieht in einer gleichmaessigen Flaeche keine Kante', () => {
    const out = sobelMagnitude(image(16, 16, () => 128), 16, 16);
    expect(Math.max(...out)).toBe(0);
  });

  it('gibt einer idealen Schwarz-Weiss-Kante genau 255', () => {
    const out = sobelMagnitude(image(16, 16, (x) => (x < 8 ? 0 : 255)), 16, 16);
    // Der Sprung liegt zwischen x = 7 und x = 8, beide Spalten sehen ihn voll.
    expect(out[8 * 16 + 7]).toBe(255);
    expect(out[8 * 16 + 8]).toBe(255);
    expect(out[8 * 16 + 3]).toBe(0);
  });

  it('richtet sich nicht nach der Kantenrichtung', () => {
    const senkrecht = sobelMagnitude(image(16, 16, (x) => (x < 8 ? 20 : 200)), 16, 16);
    const waagerecht = sobelMagnitude(image(16, 16, (_x, y) => (y < 8 ? 20 : 200)), 16, 16);
    expect(senkrecht[8 * 16 + 8]).toBe(waagerecht[8 * 16 + 8]);
  });
});

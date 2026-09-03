import { describe, expect, it } from 'vitest';
import { betrag, fft, fft2 } from '../src/metrics/fft.ts';

/** Langsame, offensichtlich richtige Fassung als Vergleichsmaßstab. */
function dft(re: number[], im: number[]): { re: number[]; im: number[] } {
  const n = re.length;
  const ar: number[] = [];
  const ai: number[] = [];
  for (let k = 0; k < n; k++) {
    let sr = 0;
    let si = 0;
    for (let t = 0; t < n; t++) {
      const w = (-2 * Math.PI * k * t) / n;
      sr += re[t]! * Math.cos(w) - im[t]! * Math.sin(w);
      si += re[t]! * Math.sin(w) + im[t]! * Math.cos(w);
    }
    ar.push(sr);
    ai.push(si);
  }
  return { re: ar, im: ai };
}

describe('FFT', () => {
  it('stimmt mit der direkten Berechnung überein', () => {
    const n = 64;
    const re: number[] = [];
    const im: number[] = [];
    // Etwas ohne jede Symmetrie, damit sich Fehler nicht wegheben.
    for (let i = 0; i < n; i++) {
      re.push(Math.sin(i * 0.37) + 0.4 * Math.cos(i * 1.13) + (i % 7) * 0.1);
      im.push(0);
    }
    const soll = dft(re, im);
    const fr = Float64Array.from(re);
    const fi = Float64Array.from(im);
    fft(fr, fi);
    for (let k = 0; k < n; k++) {
      expect(fr[k]!).toBeCloseTo(soll.re[k]!, 8);
      expect(fi[k]!).toBeCloseTo(soll.im[k]!, 8);
    }
  });

  it('findet eine reine Schwingung an genau einer Stelle', () => {
    const n = 128;
    const k0 = 9;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * k0 * i) / n);
    fft(re, im);
    // Reeller Kosinus: halbe Energie bei +k0, halbe bei -k0.
    expect(Math.hypot(re[k0]!, im[k0]!)).toBeCloseTo(n / 2, 6);
    expect(Math.hypot(re[n - k0]!, im[n - k0]!)).toBeCloseTo(n / 2, 6);
    expect(Math.hypot(re[k0 + 1]!, im[k0 + 1]!)).toBeLessThan(1e-8);
  });

  it('kehrt sich selbst um', () => {
    const n = 32;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    const original: number[] = [];
    for (let i = 0; i < n; i++) {
      re[i] = Math.sin(i * 0.9) * 3 + 1;
      original.push(re[i]!);
    }
    fft(re, im);
    fft(re, im, true);
    for (let i = 0; i < n; i++) {
      expect(re[i]!).toBeCloseTo(original[i]!, 9);
      expect(im[i]!).toBeCloseTo(0, 9);
    }
  });

  it('verlangt eine Zweierpotenz', () => {
    expect(() => fft(new Float64Array(12), new Float64Array(12))).toThrow(/Zweierpotenz/);
  });
});

describe('2D-FFT', () => {
  it('findet ein schräges Streifenmuster bei der richtigen Frequenz', () => {
    const b = 64;
    const h = 32;
    const kx = 5;
    const ky = 3;
    const daten = new Float64Array(b * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < b; x++) {
        daten[y * b + x] = Math.cos(2 * Math.PI * ((kx * x) / b + (ky * y) / h));
      }
    }
    const s = fft2(daten, b, h);
    const treffer = betrag(s, kx, ky);
    expect(treffer).toBeCloseTo((b * h) / 2, 5);
    // Das Spiegelbild gehört dazu, alles andere muss verschwinden.
    expect(betrag(s, -kx, -ky)).toBeCloseTo((b * h) / 2, 5);
    expect(betrag(s, kx, -ky)).toBeLessThan(1e-6);
    expect(betrag(s, kx + 1, ky)).toBeLessThan(1e-6);
  });

  it('legt den Mittelwert auf den Nullkoeffizienten', () => {
    const b = 16;
    const h = 8;
    const daten = new Float64Array(b * h).fill(2.5);
    const s = fft2(daten, b, h);
    expect(betrag(s, 0, 0)).toBeCloseTo(2.5 * b * h, 9);
    expect(betrag(s, 1, 0)).toBeLessThan(1e-9);
  });
});

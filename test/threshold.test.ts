import { describe, expect, it } from 'vitest';
import { chooseThreshold } from '../src/metrics/threshold.ts';

describe('Schwellwert nach Otsu', () => {
  it('trennt zwei klar getrennte Klassen', () => {
    const mag = new Uint8Array(1000);
    for (let i = 0; i < 200; i++) mag[i] = 200;
    const t = chooseThreshold(mag, 8);
    expect(t.threshold).toBeGreaterThan(8);
    expect(t.threshold).toBeLessThanOrEqual(200);
    expect(t.density).toBeCloseTo(0.2, 6);
  });

  it('laesst eine leere Flaeche leer', () => {
    const t = chooseThreshold(new Uint8Array(1000), 8);
    expect(t.density).toBe(0);
    expect(t.peakMagnitude).toBe(0);
  });

  it('haelt die Untergrenze ein, damit Rauschen keine Kante wird', () => {
    // Schwaches Rauschen um 3, ohne echte Kante. Otsu wuerde mittendurch
    // schneiden und die Haelfte zur Kante erklaeren.
    const mag = new Uint8Array(1000);
    for (let i = 0; i < mag.length; i++) mag[i] = i % 7;
    const t = chooseThreshold(mag, 8);
    expect(t.threshold).toBe(8);
    expect(t.density).toBe(0);
  });

  it('meldet die schaerfste Kante, nicht den Mittelwert', () => {
    // Duenne, aber gestochen scharfe Struktur: Mittelwert winzig, Spitze hoch.
    const mag = new Uint8Array(10000);
    for (let i = 0; i < 60; i++) mag[i] = 240;
    const t = chooseThreshold(mag, 8);
    expect(t.meanMagnitude).toBeLessThan(2);
    expect(t.peakMagnitude).toBeGreaterThan(200);
  });
});

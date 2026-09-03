import { describe, expect, it } from 'vitest';
import { createSmoother, createStabilityTracker } from '../src/calibration/stability.ts';

/** Zehn Sekunden bei dreissig Bildern je Sekunde. */
const SCHRITT = 1000 / 30;

describe('Schwankungsmessung — die Abnahmebedingung für M1', () => {
  it('meldet stabil, wenn der Wert zehn Sekunden lang ruhig steht', () => {
    const tracker = createStabilityTracker();
    let bericht = tracker.report;
    for (let i = 0; i <= 300; i++) bericht = tracker.push(1.74, i * SCHRITT);
    expect(bericht.span).toBe(0);
    expect(bericht.seconds).toBeCloseTo(10, 1);
    expect(bericht.stable).toBe(true);
  });

  it('meldet nicht stabil, solange das Fenster nicht voll ist', () => {
    const tracker = createStabilityTracker();
    let bericht = tracker.report;
    // Neun Sekunden reichen nicht, auch wenn sich nichts bewegt.
    for (let i = 0; i <= 270; i++) bericht = tracker.push(1.74, i * SCHRITT);
    expect(bericht.seconds).toBeLessThan(9.5);
    expect(bericht.stable).toBe(false);
  });

  it('meldet nicht stabil, wenn der Wert um mehr als 0,05 wandert', () => {
    const tracker = createStabilityTracker();
    let bericht = tracker.report;
    for (let i = 0; i <= 300; i++) {
      bericht = tracker.push(1.7 + (i % 2 === 0 ? 0 : 0.06), i * SCHRITT);
    }
    expect(bericht.span).toBeCloseTo(0.06, 6);
    expect(bericht.stable).toBe(false);
  });

  it('vergisst, was länger als zehn Sekunden her ist', () => {
    const tracker = createStabilityTracker();
    // Erst ein Ausreisser, danach zwölf Sekunden Ruhe.
    tracker.push(1.2, 0);
    let bericht = tracker.report;
    for (let i = 1; i <= 360; i++) bericht = tracker.push(1.74, i * SCHRITT);
    expect(bericht.span).toBe(0);
    expect(bericht.stable).toBe(true);
  });

  it('fängt nach reset() von vorn an', () => {
    const tracker = createStabilityTracker();
    for (let i = 0; i <= 300; i++) tracker.push(1.74, i * SCHRITT);
    tracker.reset();
    expect(tracker.report.samples).toBe(0);
    expect(tracker.report.stable).toBe(false);
  });
});

describe('Glättung mit Konfidenzgewicht', () => {
  it('rührt sich nicht bei Konfidenz null', () => {
    const glaetter = createSmoother();
    for (let i = 0; i < 100; i++) glaetter.push(1.9, 0);
    expect(glaetter.value).toBe(0);
    expect(glaetter.settled).toBe(false);
  });

  it('nähert sich einem gleichbleibenden Wert an', () => {
    const glaetter = createSmoother();
    for (let i = 0; i < 120; i++) glaetter.push(1.74, 1);
    expect(glaetter.value).toBeCloseTo(1.74, 6);
    expect(glaetter.settled).toBe(true);
  });

  it('folgt einem unsicheren Bild langsamer als einem sicheren', () => {
    const sicher = createSmoother();
    const unsicher = createSmoother();
    sicher.push(1.0, 1);
    unsicher.push(1.0, 1);
    for (let i = 0; i < 10; i++) {
      sicher.push(2.0, 1);
      unsicher.push(2.0, 0.2);
    }
    expect(sicher.value).toBeGreaterThan(unsicher.value);
  });

  it('gilt erst nach genügend vertrauenswürdigen Bildern als eingeschwungen', () => {
    const glaetter = createSmoother();
    for (let i = 0; i < 4; i++) glaetter.push(1.74, 1);
    expect(glaetter.settled).toBe(false);
    for (let i = 0; i < 20; i++) glaetter.push(1.74, 1);
    expect(glaetter.settled).toBe(true);
  });
});

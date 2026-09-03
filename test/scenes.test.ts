import { describe, expect, it } from 'vitest';
import { fractalSurface, brickWall, flatWall, branchingTree, blur } from './fixtures/scenes.ts';
import { whiteNoise, type GrayImage } from './fixtures/images.ts';
import { sobelMagnitude } from '../src/metrics/sobel.ts';
import { createBoxCountingMetric } from '../src/metrics/boxCounting.ts';
import type { Frame, Result } from '../src/metrics/types.ts';

/** Die ganze Kette, wie sie im Betrieb laeuft: Graubild, Sobel, Zaehlung. */
function measure(img: GrayImage): Result {
  const soft = blur(img); // die Optik zeichnet nie pixelscharf
  const frame: Frame = {
    gray: soft.data,
    edges: sobelMagnitude(soft.data, soft.width, soft.height),
    width: soft.width,
    height: soft.height,
    timestamp: 0,
  };
  return metric.run(frame);
}

const metric = createBoxCountingMetric();

describe('Plausibilitaet ueber die ganze Kette', () => {
  it('sieht auf einer glatten Wand nichts und sagt das auch', () => {
    const r = measure(flatWall());
    expect(r.value).toBe(0);
    expect(metric.confidence(r)).toBe(0);
  });

  it('ordnet Motive nach Verzweigungsgrad', () => {
    const wand = measure(brickWall()).value;
    const baumSchmal = measure(branchingTree(512, 11, 0.6)).value;
    const baumBreit = measure(branchingTree(512, 12, 0.76)).value;
    const rauschen = measure(whiteNoise()).value;

    expect(wand).toBeLessThan(baumSchmal);
    expect(baumSchmal).toBeLessThan(baumBreit);
    expect(baumBreit).toBeLessThan(rauschen);
  });

  it('trifft die Erwartungswerte aus der Projektbeschreibung', () => {
    // Backsteinwand ~1,2 · Farnwedel ~1,7 · Baumkrone ~1,8 · Rauschen ~2,0.
    // Die Toleranz ist weit, weil ein synthetisches Motiv nur ungefaehr das
    // trifft, was die Kamera im Freien sieht. Eng geprueft wird die Reihenfolge.
    expect(measure(brickWall()).value).toBeLessThan(1.6);
    expect(measure(branchingTree(512, 11, 0.72)).value).toBeGreaterThan(1.6);
    expect(measure(branchingTree(512, 11, 0.72)).value).toBeLessThan(1.85);
    expect(measure(whiteNoise()).value).toBeGreaterThan(1.85);
  });

  it('haelt einen verzweigten Baum fuer vertrauenswuerdig', () => {
    const r = measure(branchingTree(512, 11, 0.72));
    expect(metric.confidence(r)).toBeGreaterThan(0.8);
    expect(r.caveats).toHaveLength(0);
  });

  it('warnt bei einer Flaeche ohne scharfe Kanten', () => {
    const r = measure(fractalSurface(512, 0.5, 3));
    expect(r.caveats).toContain('Motiv unscharf – Abstand ändern');
    expect(metric.confidence(r)).toBe(0);
  });
});

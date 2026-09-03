import { describe, expect, it } from 'vitest';
import { sierpinski, koch, whiteNoise, emptyPlane, type GrayImage } from './fixtures/images.ts';
import { boxCount, createBoxCountingMetric } from '../src/metrics/boxCounting.ts';
import type { Frame } from '../src/metrics/types.ts';

/**
 * Die Referenzbilder sind bereits Kantenbilder, deshalb gehen sie unveraendert
 * in beide Kanaele. Geprueft wird hier nur die Zaehlung, nicht der Sobel.
 */
function frame(img: GrayImage): Frame {
  return { gray: img.data, edges: img.data, width: img.width, height: img.height, timestamp: 0 };
}

function shifted(img: GrayImage, dx: number, dy: number): GrayImage {
  const out = new Uint8Array(img.data.length);
  for (let y = 0; y < img.height; y++) {
    const sy = y - dy;
    if (sy < 0 || sy >= img.height) continue;
    for (let x = 0; x < img.width; x++) {
      const sx = x - dx;
      if (sx < 0 || sx >= img.width) continue;
      out[y * img.width + x] = img.data[sy * img.width + sx]!;
    }
  }
  return { data: out, width: img.width, height: img.height };
}

const metric = createBoxCountingMetric();

describe('Kaestchenzaehlung gegen die Referenzbilder', () => {
  it('Sierpinski-Dreieck: 1,585', () => {
    const d = boxCount(frame(sierpinski())).slope;
    // Das diskrete Sierpinski-Dreieck liegt exakt im Zweierraster des
    // Zaehlgitters, hier darf nichts abweichen.
    expect(d).toBeCloseTo(Math.log(3) / Math.log(2), 6);
  });

  it('Koch-Schneeflocke: 1,262', () => {
    const d = boxCount(frame(koch())).slope;
    // Die Dreiteilung der Kurve passt nicht ins Zweierraster, und die
    // Minimierung ueber die Gitterlagen zieht die groben Skalen staerker nach
    // unten als die feinen. Beides zusammen ergibt einen systematischen
    // Ueberschlag von rund 0,05 -- reproduzierbar, deshalb zweifach geprueft:
    // einmal gegen den Sollwert mit Toleranz, einmal eng gegen den Istwert,
    // damit eine Aenderung am Verfahren nicht unbemerkt durchrutscht.
    expect(d).toBeCloseTo(Math.log(4) / Math.log(3), 1);
    expect(Math.abs(d - Math.log(4) / Math.log(3))).toBeLessThan(0.06);
    expect(d).toBeCloseTo(1.3103, 3);
  });

  it('Weisses Rauschen: 2,0', () => {
    const d = boxCount(frame(whiteNoise())).slope;
    // Ein Kaestchen von 2x2 Pixeln bleibt bei halber Dichte mit 6,25 Prozent
    // Wahrscheinlichkeit leer. Deshalb 1,98 statt 2,00.
    expect(Math.abs(d - 2)).toBeLessThan(0.03);
  });

  it('Leere Flaeche: kein Wert, keine Konfidenz', () => {
    const r = metric.run(frame(emptyPlane()));
    expect(r.value).toBe(0);
    expect(metric.confidence(r)).toBe(0);
    expect(r.caveats).toContain('keine Kanten gefunden');
  });
});

describe('Unabhaengigkeit von der Gitterlage', () => {
  // Die Hand wandert. Wandert der Messwert mit, ist er wertlos. Geprueft wird
  // ueber alle vier Versaetze innerhalb einer Kaestchenbreite der feinsten
  // Skala; M1 verlangt weniger als 0,05 Schwankung.
  for (const [name, img] of [['Sierpinski', sierpinski()], ['Koch', koch()]] as const) {
    it(`${name}: Verschiebung um bis zu drei Pixel aendert nichts`, () => {
      const values: number[] = [];
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 4; dx++) values.push(boxCount(frame(shifted(img, dx, dy))).slope);
      }
      const span = Math.max(...values) - Math.min(...values);
      expect(span).toBeLessThan(0.01);
    });
  }
});

describe('Mindestens fuenf Skalen', () => {
  it('liefert fuenf Kaestchengroessen von 2 bis 32 Pixeln', () => {
    const raw = boxCount(frame(sierpinski()));
    expect(raw.scales).toEqual([2, 4, 8, 16, 32]);
    expect(raw.counts).toHaveLength(5);
  });

  it('wertet auch ein nicht quadratisches Bild aus', () => {
    const src = sierpinski(512);
    const w = 640;
    const h = 480;
    const edges = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) edges[y * w + x] = src.data[(y % 512) * 512 + (x % 512)]!;
    }
    const raw = boxCount({ gray: edges, edges, width: w, height: h, timestamp: 0 });
    expect(raw.side).toBe(256);
    expect(raw.scales).toEqual([2, 4, 8, 16, 32]);
  });
});

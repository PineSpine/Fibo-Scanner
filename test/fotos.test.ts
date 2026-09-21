import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { lesePng } from '../scripts/png.ts';
import type { Frame } from '../src/metrics/types.ts';
import {
  createParastichenMetric,
  parastichen,
  parastichenErgebnis,
} from '../src/metrics/parastichen.ts';
import { VERTRAUEN_GERING } from '../src/calibration/messreihe.ts';

/**
 * Die ersten echten Fotos, draußen festgehalten am 21.09.2026.
 *
 * Beide zeigen die ganze Blüte, nicht ihre Mitte. Am Telefon stand bei der
 * Zinnie "5/8" in Gold -- mit einem Prozent Vertrauen. Das Verfahren hatte
 * also selbst gesagt, dass es nichts gefunden hat; die Anzeige hat es
 * trotzdem golden ausgesprochen. Diese Bilder halten fest, dass so etwas nicht
 * wieder als Befund durchgeht.
 *
 * Ausgeschnitten aus den Bildschirmfotos des Standbilds, auf 512 Pixel
 * gebracht und als Graustufen gespeichert (Rec. 709, wie der Shader).
 */
function lade(name: string): Frame {
  const bild = lesePng(fileURLToPath(new URL(`./fotos/${name}`, import.meta.url)));
  const gray = new Uint8Array(bild.breite * bild.hoehe);
  for (let i = 0; i < gray.length; i++) gray[i] = bild.daten[4 * i]!;
  return {
    gray,
    edges: new Uint8Array(gray.length),
    width: bild.breite,
    height: bild.hoehe,
    timestamp: 0,
  };
}

const metrik = createParastichenMetric();

describe('Echte Blüten, ganze Blüte im Bild: keine Spiralaussage', () => {
  for (const name of ['dahlie.png', 'zinnie.png']) {
    it(`${name}: Vertrauen unter der Anzeigegrenze, mit Grund`, () => {
      const r = parastichenErgebnis(parastichen(lade(name)));
      expect(metrik.confidence(r)).toBeLessThan(VERTRAUEN_GERING);
      // Ohne Grund stünde in der Anzeige nur ein Strich. Wer draußen steht,
      // soll erfahren, was er anders machen kann.
      expect(r.caveats.length).toBeGreaterThan(0);
    });
  }

  it('zählt bei der Dahlie die Blütenblätter, nicht die Blütchen', () => {
    // Das ist die Erklärung für die Zahlen, nicht die Anforderung: 12 bis 14
    // ist die Zahl der äußeren Blütenblätter. Ändert sich das, hat sich am
    // Verfahren etwas verschoben -- dann erst hierher sehen.
    const roh = parastichen(lade('dahlie.png'));
    for (const arme of [roh.links, roh.rechts]) {
      expect(arme).toBeGreaterThanOrEqual(10);
      expect(arme).toBeLessThanOrEqual(15);
    }
  });
});

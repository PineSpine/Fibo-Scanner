import { describe, expect, it } from 'vitest';
import {
  createParastichenMetric,
  parastichen,
  parastichenErgebnis,
  sucheMitte,
} from '../src/metrics/parastichen.ts';
import { VERTRAUEN_GERING } from '../src/calibration/messreihe.ts';
import { bluetenstand } from './fixtures/phyllotaxis.ts';
import { blur, branchingTree, brickWall, flatWall, fractalSurface } from './fixtures/scenes.ts';
import { whiteNoise, type GrayImage } from './fixtures/images.ts';
import { verrauscht, verschoben } from './fixtures/stoerung.ts';
import type { Frame } from '../src/metrics/types.ts';

/**
 * Die Mittelsuche. Ohne sie ist die Spiralenzählung draußen unbrauchbar:
 * Die Blütenmitte muss auf etwa einen Pixel genau stimmen, und so genau zielt
 * niemand. Diese Tests halten beides fest -- dass es ohne Suche scheitert, und
 * dass es mit Suche gelingt, ohne auf Fremdmotiven etwas herbeizusuchen.
 */

const metrik = createParastichenMetric();

function alsFrame(bild: GrayImage): Frame {
  return { gray: bild.data, edges: new Uint8Array(bild.data.length), width: bild.width, height: bild.height, timestamp: 0 };
}

/** Ein Blütenstand, wie er draußen ankäme: weich, verrauscht, daneben gezielt. */
function draussen(anzahl: number, dx: number, dy: number): Frame {
  return alsFrame(verschoben(verrauscht(blur(bluetenstand({ anzahl }).bild)), dx, dy));
}

describe('Ohne Suche: schon wenige Pixel Versatz zerstören die Zählung', () => {
  it('55/89 bei vier Pixeln daneben: kein Vertrauen mehr', () => {
    // Das ist der Befund, der die Suche nötig gemacht hat. Ändert er sich,
    // ist das Verfahren robuster geworden -- dann hierher sehen und die
    // Begründung in parastichenUm anpassen.
    const r = parastichenErgebnis(parastichen(draussen(2000, 4, 4)));
    expect(metrik.confidence(r)).toBeLessThan(VERTRAUEN_GERING);
  });
});

describe('Mit Suche: die Mitte wird gefunden', () => {
  const faelle: Array<[number, number, number, string]> = [
    [700, 13, -7, '34/55'],
    [2000, -30, 22, '55/89'],
    // Hier blieb ein einfacher Aufstieg von der Bildmitte an einem
    // Nebengipfel hängen. Das grobe Raster davor fängt das ab.
    [400, 45, 38, '21/34'],
  ];

  for (const [anzahl, dx, dy, paar] of faelle) {
    it(`${anzahl} Blütchen, um (${dx}, ${dy}) versetzt: ${paar}, Mitte auf einen Pixel`, () => {
      const roh = sucheMitte(draussen(anzahl, dx, dy));
      const r = parastichenErgebnis(roh);
      expect(r.label).toBe(paar);
      expect(roh.treffer).toBe(true);
      expect(metrik.confidence(r)).toBeGreaterThan(0.9);
      expect(Math.abs(roh.mitte.x - (256 + dx))).toBeLessThanOrEqual(1);
      expect(Math.abs(roh.mitte.y - (256 + dy))).toBeLessThanOrEqual(1);
    });
  }

  it('findet vom vorigen Bild aus weiter, wenn die Hand ein Stück wandert', () => {
    // So läuft es in der Messreihe: volle Suche nur am ersten Bild, danach
    // ein kurzer Aufstieg von der zuletzt gefundenen Mitte.
    const erstes = sucheMitte(draussen(1200, 10, 5));
    const zweites = sucheMitte(draussen(1200, 17, -1), undefined, erstes.mitte);
    expect(parastichenErgebnis(zweites).label).toBe('55/89');
    expect(Math.abs(zweites.mitte.x - 273)).toBeLessThanOrEqual(1);
    expect(Math.abs(zweites.mitte.y - 255)).toBeLessThanOrEqual(1);
  });

  it('lässt einen genau zentrierten Blütenstand, wo er ist', () => {
    const roh = sucheMitte(alsFrame(bluetenstand({ anzahl: 700 }).bild));
    expect(roh.mitte).toEqual({ x: 256, y: 256 });
    expect(parastichenErgebnis(roh).label).toBe('34/55');
  });
});

describe('Mit Suche: auf Fremdmotiven wird nichts herbeigesucht', () => {
  // Wer achtzig Mittelpunkte ausprobiert, findet auch im Rauschen den besten
  // von achtzig. Die strengere Schwelle für gesuchte Befunde muss das abfangen.
  const faelle: Array<[string, () => GrayImage]> = [
    ['Backsteinwand', () => brickWall()],
    ['glatte Wand', () => flatWall()],
    ['Baum r=0,72', () => branchingTree(512, 11, 0.72)],
    ['Baum r=0,76', () => branchingTree(512, 11, 0.76)],
    ['fraktale Fläche', () => fractalSurface(512, 0.5, 3)],
    ['fraktale Fläche, andere Saat', () => fractalSurface(512, 0.5, 11)],
    ['Bildrauschen', () => whiteNoise()],
  ];

  for (const [name, mach] of faelle) {
    it(`${name}: Vertrauen unter der Anzeigegrenze`, () => {
      const r = parastichenErgebnis(sucheMitte(alsFrame(blur(mach()))));
      expect(metrik.confidence(r)).toBeLessThan(VERTRAUEN_GERING);
    });
  }
});

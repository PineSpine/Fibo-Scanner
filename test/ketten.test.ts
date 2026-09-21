import { describe, expect, it } from 'vitest';
import { createKettenMetric, entscheide, ketten, kettenErgebnis, kettenStimmen, type Stimmen } from '../src/metrics/ketten.ts';
import { sucheMitte } from '../src/metrics/parastichen.ts';
import { VERTRAUEN_GERING, VERTRAUEN_GUT } from '../src/calibration/messreihe.ts';
import { bluetenstand } from './fixtures/phyllotaxis.ts';
import { blur, branchingTree, brickWall, flatWall, fractalSurface } from './fixtures/scenes.ts';
import { whiteNoise, type GrayImage } from './fixtures/images.ts';
import { verrauscht, verschoben } from './fixtures/stoerung.ts';
import type { Frame } from '../src/metrics/types.ts';

/**
 * Die Kettenzählung: Blütchen finden, Nachbarn verbinden, Kreuzungen zählen.
 *
 * Geprüft wird, was sie an gerechneten Blütenständen können muss -- exakt,
 * auch verrauscht und daneben gezielt -- und was sie auf Fremdmotiven nicht
 * darf: irgendetwas melden. Echte Fotos von Blütenständen liegen nicht im
 * Repository (fremde Bilder); siehe scripts/ketten-probe.ts.
 */

const metrik = createKettenMetric();

function alsFrame(bild: GrayImage): Frame {
  return { gray: bild.data, edges: new Uint8Array(bild.data.length), width: bild.width, height: bild.height, timestamp: 0 };
}

function draussen(anzahl: number, dx: number, dy: number): Frame {
  return alsFrame(verschoben(verrauscht(blur(bluetenstand({ anzahl }).bild)), dx, dy));
}

describe('Kettenzählung an gerechneten Blütenständen', () => {
  const faelle: Array<[number, number, number, string]> = [
    [700, 13, -7, '34/55'],
    [1200, -8, 15, '55/89'],
    [2000, -20, 12, '55/89'],
  ];

  for (const [anzahl, dx, dy, paar] of faelle) {
    it(`${anzahl} Blütchen, verrauscht und um (${dx}, ${dy}) versetzt: exakt ${paar}`, () => {
      const roh = ketten(draussen(anzahl, dx, dy));
      const r = kettenErgebnis(roh);
      expect(roh.exakt).toBe(true);
      expect(r.label).toBe(paar);
      expect(roh.treffer).toBe(true);
      expect(metrik.confidence(r)).toBeGreaterThanOrEqual(VERTRAUEN_GUT);
    });
  }

  it('zählt nach außen mehr Spiralen, in Fibonacci-Schritten', () => {
    // Das ist der Befund, den die Fouriertransformation nie liefern konnte:
    // Die Blütchen bleiben gleich groß, der Umfang wächst -- und mit ihm die
    // Zahl der sichtbaren Spiralen, Schritt für Schritt entlang der Folge.
    const roh = ketten(draussen(700, 13, -7));
    const folge: string[] = [];
    for (const r of roh.ringe) {
      if (r.gitter < 4 || r.einig < 0.75) continue;
      const paar = `${r.klein}/${r.gross}`;
      if (folge.at(-1) !== paar) folge.push(paar);
    }
    expect(folge).toEqual(expect.arrayContaining(['13/21', '21/34', '34/55']));
    expect(folge.indexOf('13/21')).toBeLessThan(folge.indexOf('21/34'));
    expect(folge.indexOf('21/34')).toBeLessThan(folge.indexOf('34/55'));
  });

  it('liefert die Ketten zum Nachzeichnen mit, in beiden Scharen', () => {
    const roh = ketten(draussen(700, 13, -7));
    expect(roh.segmente.some((s) => s.schar === 0)).toBe(true);
    expect(roh.segmente.some((s) => s.schar === 1)).toBe(true);
  });
});

describe('Kettenzählung auf Fremdmotiven: kein Befund', () => {
  const faelle: Array<[string, () => GrayImage]> = [
    ['Backsteinwand', () => brickWall()],
    ['glatte Wand', () => flatWall()],
    ['Baum r=0,72', () => branchingTree(512, 11, 0.72)],
    ['fraktale Fläche', () => fractalSurface(512, 0.5, 3)],
    ['Bildrauschen', () => whiteNoise()],
  ];

  for (const [name, mach] of faelle) {
    it(`${name}: nichts gezählt`, () => {
      const roh = ketten(alsFrame(blur(mach())));
      const r = kettenErgebnis(roh);
      expect(roh.paar).toBeNull();
      expect(metrik.confidence(r)).toBeLessThan(VERTRAUEN_GERING);
      expect(r.caveats[0]).toMatch(/keine zählbaren Blütchenreihen/);
    });
  }
});

/** Drei Handaufnahmen, wie eine Messreihe sie liefert: verschoben, verrauscht. */
function reihe(bild: GrayImage): ReturnType<typeof entscheide> {
  const stimmen: Stimmen[] = [];
  let start: { x: number; y: number } | undefined;
  for (const [dx, dy, saat] of [[0, 0, 11], [3, -2, 12], [-2, 3, 13]] as const) {
    const f = alsFrame(verrauscht(verschoben(bild, dx, dy), 8, saat));
    const m = sucheMitte(f, undefined, start).mitte;
    start = m;
    stimmen.push(kettenStimmen(f, m.x, m.y));
  }
  return entscheide(stimmen);
}

describe('Kettenzählung über eine Reihe aus drei Bildern', () => {
  it('ein gerechneter Blütenstand bleibt exakt, mit dreifacher Stütze', () => {
    const roh = reihe(blur(bluetenstand({ anzahl: 700 }).bild));
    expect(roh.bilder).toBe(3);
    expect(roh.exakt).toBe(true);
    expect(kettenErgebnis(roh).label).toBe('34/55');
  });

  // Die Mindestzahlen an Gittern gelten je Bild. Bevor sie mit der Zahl der
  // Bilder wuchsen, meldete die fraktale Fläche „≈ 10/13" und die
  // Backsteinwand „≈ 24/26" -- ein zufälliges Gitter je Bild reichte.
  for (const [name, mach] of [
    ['Backsteinwand', () => brickWall()],
    ['fraktale Fläche', () => fractalSurface(512, 0.5, 3)],
    ['Bildrauschen', () => whiteNoise()],
  ] as const) {
    it(`${name}: auch über drei Bilder kein Befund`, () => {
      const roh = reihe(blur(mach()));
      expect(roh.paar).toBeNull();
      expect(metrik.confidence(kettenErgebnis(roh))).toBeLessThan(VERTRAUEN_GERING);
    });
  }
});

describe('Kettenzählung: was dasteht', () => {
  it('ungefähr bleibt ungefähr -- mit Tilde, nie golden, nie über "gering"', () => {
    // Gebaut wie ein ungefährer Befund an einer echten Sonnenblume.
    const r = kettenErgebnis({
      mitte: { x: 256, y: 256 },
      ringe: [],
      paar: [35, 55],
      exakt: false,
      genauigkeit: 3,
      stuetze: 25,
      bilder: 1,
      treffer: false,
      segmente: [],
    });
    expect(r.label).toBe('≈ 35/55');
    expect(r.detail['treffer']).toBe(0);
    expect(r.caveats[0]).toMatch(/zu ungenau für eine Fibonacci-Aussage/);
    const k = metrik.confidence(r);
    expect(k).toBeGreaterThanOrEqual(VERTRAUEN_GERING);
    expect(k).toBeLessThan(VERTRAUEN_GUT);
  });

  it('auch ein sehr gut gestützter ungefährer Befund wird nicht golden', () => {
    const r = kettenErgebnis({
      mitte: { x: 256, y: 256 },
      ringe: [],
      paar: [34, 55],
      exakt: false,
      genauigkeit: 1,
      stuetze: 200,
      bilder: 1,
      treffer: false,
      segmente: [],
    });
    expect(metrik.confidence(r)).toBeLessThan(VERTRAUEN_GUT);
  });
});

import { describe, expect, it } from 'vitest';
import {
  benachbarteFibonacci,
  createParastichenMetric,
  naechsteFibonacci,
  parastichen,
} from '../src/metrics/parastichen.ts';
import { bluetenstand, bluetenstandOhneFibonacci } from './fixtures/phyllotaxis.ts';
import type { Frame, Result } from '../src/metrics/types.ts';
import type { GrayImage } from './fixtures/images.ts';

const metrik = createParastichenMetric();

function alsFrame(bild: GrayImage): Frame {
  return { gray: bild.data, edges: bild.data, width: bild.width, height: bild.height, timestamp: 0 };
}

function messe(bild: GrayImage): { roh: ReturnType<typeof parastichen>; r: Result } {
  const f = alsFrame(bild);
  return { roh: parastichen(f), r: metrik.run(f) };
}

describe('Fibonacci-Prüfung', () => {
  it('erkennt benachbarte Paare, in beliebiger Reihenfolge', () => {
    expect(benachbarteFibonacci(34, 55)).toBe(true);
    expect(benachbarteFibonacci(55, 34)).toBe(true);
    expect(benachbarteFibonacci(21, 34)).toBe(true);
    expect(benachbarteFibonacci(55, 89)).toBe(true);
  });

  it('weist Paare ab, die nur zufällig nach Fibonacci aussehen', () => {
    // Beides Fibonacci, aber nicht benachbart.
    expect(benachbarteFibonacci(21, 55)).toBe(false);
    // Eines daneben.
    expect(benachbarteFibonacci(34, 56)).toBe(false);
    expect(benachbarteFibonacci(33, 55)).toBe(false);
    // Gleich ist kein Paar.
    expect(benachbarteFibonacci(34, 34)).toBe(false);
  });

  it('findet die nächstliegende Fibonacci-Zahl', () => {
    expect(naechsteFibonacci(56)).toBe(55);
    expect(naechsteFibonacci(36)).toBe(34);
    expect(naechsteFibonacci(1)).toBe(1);
  });
});

describe('Spiralenzählung an Blütenständen nach Vogel', () => {
  // Welches Paar sichtbar wird, haengt von der Blütchenzahl ab: die Blütchen
  // bleiben gleich groß, der Umfang wächst nach außen.
  const faelle: Array<[number, [number, number]]> = [
    [200, [21, 34]],
    [400, [21, 34]],
    [700, [34, 55]],
    [1200, [55, 89]],
    [2000, [55, 89]],
    [3000, [55, 89]],
  ];

  for (const [anzahl, [klein, gross]] of faelle) {
    it(`${anzahl} Blütchen ergeben ${klein}/${gross}`, () => {
      const { roh, r } = messe(bluetenstand({ anzahl }).bild);
      expect([Math.min(roh.links, roh.rechts), Math.max(roh.links, roh.rechts)]).toEqual([
        klein,
        gross,
      ]);
      expect(roh.treffer).toBe(true);
      expect(r.label).toBe(`${klein}/${gross}`);
      expect(metrik.confidence(r)).toBeGreaterThan(0.9);
      expect(r.caveats).toHaveLength(0);
    });
  }

  it('hängt nicht davon ab, wie der Blütenstand gedreht liegt', () => {
    // Die Winkelachse ist periodisch; eine Drehung verschiebt nur die Phase.
    const werte = [0, 0.4, 1.1, 2.7, 5.0].map((drehung) => {
      const { roh } = messe(bluetenstand({ anzahl: 1200, drehung }).bild);
      return `${Math.min(roh.links, roh.rechts)}/${Math.max(roh.links, roh.rechts)}`;
    });
    expect(new Set(werte).size).toBe(1);
    expect(werte[0]).toBe('55/89');
  });
});

describe('Das Verfahren sieht nicht überall Fibonacci', () => {
  it('verweigert die Aussage bei einem Winkel ohne Fibonacci-Struktur', () => {
    // 100 Grad ergibt 18 gerade Speichen statt zweier Spiralfamilien.
    const { roh, r } = messe(bluetenstandOhneFibonacci({ anzahl: 1200 }).bild);
    expect(roh.treffer).toBe(false);
    expect(roh.links).toBe(roh.rechts);
    expect(metrik.confidence(r)).toBe(0);
    expect(r.caveats).toContain('nur eine Spiralfamilie erkennbar');
  });

  it('findet in gleichmäßigem Rauschen nichts Vertrauenswürdiges', () => {
    const groesse = 512;
    const daten = new Uint8Array(groesse * groesse);
    let a = 12345;
    for (let i = 0; i < daten.length; i++) {
      a = (a * 1103515245 + 12345) & 0x7fffffff;
      daten[i] = a % 256;
    }
    const { roh, r } = messe({ data: daten, width: groesse, height: groesse });
    expect(roh.treffer).toBe(false);
    expect(metrik.confidence(r)).toBe(0);
    expect(r.caveats[0]).toMatch(/keine deutlichen Spiralen/);
  });

  it('findet auf einer leeren Fläche nichts', () => {
    const groesse = 512;
    const { r } = messe({ data: new Uint8Array(groesse * groesse).fill(180), width: groesse, height: groesse });
    expect(metrik.confidence(r)).toBe(0);
  });
});

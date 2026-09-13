import { describe, expect, it } from 'vitest';
import {
  fasseDiskret,
  fasseStetig,
  type Probe,
} from '../src/calibration/messreihe.ts';
import { bildabstand, createUnruhewaechter } from '../src/calibration/bewegung.ts';

function stetig(werte: readonly number[], konfidenz = 0.8): Probe[] {
  return werte.map((w) => ({ wert: w, marke: w.toFixed(2), konfidenz }));
}

function schweigend(anzahl: number): Probe[] {
  return Array.from({ length: anzahl }, () => ({ wert: 0, marke: null, konfidenz: 0 }));
}

describe('Messreihe, stetig — die fraktale Dimension', () => {
  it('nimmt den Median, nicht den Mittelwert', () => {
    // Neun ruhige Messungen und ein verwackeltes Bild. Der Mittelwert laege
    // bei 1,76 -- der Median steht, wo die Messung wirklich war.
    const befund = fasseStetig(stetig([1.74, 1.74, 1.75, 1.73, 1.74, 1.75, 1.74, 1.74, 1.73, 1.95]));
    expect(befund.wert).toBeCloseTo(1.74, 2);
  });

  it('zaehlt als einig, was innerhalb der Toleranz liegt', () => {
    const befund = fasseStetig(stetig([1.74, 1.75, 1.73, 1.74, 1.76]));
    // Alle fuenf liegen innerhalb von 0,025 um den Median 1,74.
    expect(befund.traeger).toBe(5);
    expect(befund.einigkeit).toBe(1);
    expect(befund.spanne).toBeCloseTo(0.03, 6);
  });

  it('meldet geringe Einigkeit, wenn die Reihe auseinanderlaeuft', () => {
    const befund = fasseStetig(stetig([1.2, 1.4, 1.6, 1.8, 2.0]));
    expect(befund.einigkeit).toBeCloseTo(0.2, 6);
    expect(befund.spanne).toBeCloseTo(0.8, 6);
  });

  it('zaehlt schweigende Bilder in den Nenner', () => {
    // Fuenf gute Messungen, fuenf Bilder ohne Befund: die Haelfte der Reihe
    // hat nichts gesehen, und das gehoert in die Aussage.
    const befund = fasseStetig([...stetig([1.74, 1.74, 1.74, 1.74, 1.74]), ...schweigend(5)]);
    expect(befund.traeger).toBe(5);
    expect(befund.proben).toBe(10);
    expect(befund.einigkeit).toBeCloseTo(0.5, 6);
  });

  it('senkt das Vertrauen mit der Einigkeit', () => {
    const einig = fasseStetig(stetig([1.74, 1.74, 1.74, 1.74], 0.9));
    const uneinig = fasseStetig(stetig([1.2, 1.5, 1.74, 1.9], 0.9));
    expect(einig.konfidenz).toBeCloseTo(0.9, 6);
    // Ein Wert, den nur ein Viertel der Bilder trug, ist keine 90-Prozent-Aussage.
    expect(uneinig.konfidenz).toBeLessThan(0.3);
  });

  it('gibt nichts her, wenn kein Bild etwas gefunden hat', () => {
    const befund = fasseStetig(schweigend(20));
    expect(befund.marke).toBeNull();
    expect(befund.proben).toBe(20);
    expect(befund.vertreter).toBe(-1);
  });

  it('zeigt auf die Probe, die den Befund vertritt', () => {
    const proben = stetig([1.9, 1.74, 1.2]);
    const befund = fasseStetig(proben);
    expect(befund.vertreter).toBe(1);
  });
});

describe('Messreihe, diskret — die Spiralenzahlen', () => {
  const paar = (marke: string, konfidenz = 0.8): Probe => ({
    wert: Number(marke.split('/')[1]),
    marke,
    konfidenz,
  });

  it('nimmt den haeufigsten Befund, nicht den letzten', () => {
    // So sieht das Zappeln aus, das die App draussen unbrauchbar machte.
    const befund = fasseDiskret([
      paar('34/55'),
      paar('34/55'),
      paar('21/34'),
      paar('34/55'),
      paar('33/55'),
      paar('34/55'),
    ]);
    expect(befund.marke).toBe('34/55');
    expect(befund.traeger).toBe(4);
    expect(befund.einigkeit).toBeCloseTo(4 / 6, 6);
  });

  it('mittelt niemals — 34 und 55 ergeben nicht 44,5', () => {
    const befund = fasseDiskret([paar('34/55'), paar('34/55'), paar('21/34')]);
    expect(befund.wert).toBe(55);
    expect(befund.marke).toBe('34/55');
  });

  it('entscheidet Gleichstand nach dem Vertrauen', () => {
    const befund = fasseDiskret([paar('21/34', 0.4), paar('34/55', 0.9)]);
    expect(befund.marke).toBe('34/55');
  });

  it('meldet geringe Einigkeit, wenn jedes Bild etwas anderes sagt', () => {
    const befund = fasseDiskret([paar('21/34'), paar('34/55'), paar('13/21'), paar('8/13')]);
    expect(befund.einigkeit).toBeCloseTo(0.25, 6);
    expect(befund.konfidenz).toBeLessThan(0.25);
  });

  it('zaehlt schweigende Bilder in den Nenner', () => {
    const befund = fasseDiskret([paar('34/55'), paar('34/55'), ...schweigend(18)]);
    expect(befund.marke).toBe('34/55');
    expect(befund.einigkeit).toBeCloseTo(0.1, 6);
  });

  it('hat keine Spanne — eine Abstimmung ist keine Rechnung', () => {
    expect(fasseDiskret([paar('34/55'), paar('21/34')]).spanne).toBe(0);
  });
});

describe('Bildunruhe', () => {
  it('ist null, wenn sich nichts aendert', () => {
    const a = Uint8Array.from({ length: 64 }, (_, i) => i);
    expect(bildabstand(a, Uint8Array.from(a))).toBe(0);
  });

  it('misst den mittleren Betrag der Aenderung', () => {
    const a = new Uint8Array([10, 10, 10, 10]);
    const b = new Uint8Array([12, 8, 10, 14]);
    // Abstaende 2, 2, 0, 4 -- im Mittel 2.
    expect(bildabstand(a, b)).toBeCloseTo(2, 6);
  });

  it('gibt null zurueck, wenn die Bilder nicht zusammenpassen', () => {
    expect(bildabstand(new Uint8Array(4), new Uint8Array(8))).toBe(0);
  });

  it('merkt sich den groessten Ruck einer Reihe', () => {
    const waechter = createUnruhewaechter();
    const ruhig = new Uint8Array(16).fill(100);
    const ruck = new Uint8Array(16).fill(160);
    waechter.beobachte(ruhig);
    waechter.beobachte(ruhig);
    waechter.beobachte(ruck);
    waechter.beobachte(ruck);
    expect(waechter.gipfel).toBeCloseTo(60, 6);
    // Der geglaettete Wert faellt danach wieder, der Gipfel bleibt stehen.
    waechter.beobachte(ruck);
    expect(waechter.wert).toBeLessThan(60);
    expect(waechter.gipfel).toBeCloseTo(60, 6);
  });

  it('faengt nach dem Zuruecksetzen von vorne an', () => {
    const waechter = createUnruhewaechter();
    waechter.beobachte(new Uint8Array(16).fill(0));
    waechter.beobachte(new Uint8Array(16).fill(50));
    waechter.gipfelZuruecksetzen();
    expect(waechter.gipfel).toBe(0);
  });
});

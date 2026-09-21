import type { Spiralfamilie } from '../metrics/parastichen.ts';
import type { LogPolarOptionen } from '../metrics/logPolar.ts';

export interface Nachzeichner {
  /** Die gefundenen Spiralfamilien ins Bild legen. */
  spiralen(
    familien: readonly [Spiralfamilie, Spiralfamilie],
    treffer: boolean,
    optionen: LogPolarOptionen,
    /**
     * Um welchen Punkt gemessen wurde, als Anteil des Messbilds (0..1). Die
     * Blütenmitte liegt fast nie in der Bildmitte -- gezeichnet wird dort, wo
     * die Suche sie gefunden hat, sonst lägen die Linien neben den Spiralen.
     */
    mitte: { x: number; y: number },
  ): void;
  /**
   * Die gezählten Ketten ins Bild legen: jede Verbindung zwischen zwei
   * Blütchen, die in die Zählung eingegangen ist. Keine Näherung und keine
   * Kurve, sondern genau das, was gezählt wurde -- wer der Zahl nicht traut,
   * sieht nach, ob die Ketten den Reihen folgen.
   */
  ketten(
    segmente: readonly { x1: number; y1: number; x2: number; y2: number; schar: 0 | 1 }[],
    treffer: boolean,
    /** Kantenlänge des Messbilds, in dessen Pixeln die Segmente liegen. */
    messkante: number,
  ): void;
  /** Nichts gefunden, also nichts zeichnen. */
  loeschen(): void;
}

const NS = 'http://www.w3.org/2000/svg';

/** Höchstens so viele Arme je Familie. 89 Linien wären ein Knäuel, kein Befund. */
const ARME_HOECHSTENS = 13;
/** Stützpunkte je Spirale. Mehr glättet nichts mehr, kostet aber. */
const PUNKTE = 24;

/**
 * Zeichnet eine Spiralfamilie als Pfad.
 *
 * In Log-Polar-Koordinaten liegt die Familie auf den Linien konstanter Phase:
 *
 *   arme · (Winkel / 2π) + radiusFrequenz · (Ring / Ringzahl) = k − phase / 2π
 *
 * Nach dem Winkel aufgelöst und für jeden Ring ausgewertet ergibt das genau die
 * Kurve, die im Spektrum den Gipfel erzeugt hat. Deshalb liegt sie im Bild auch
 * dort, wo die Spirale wirklich ist -- nachgezeichnet, nicht danebengemalt.
 */
function pfad(
  familie: Spiralfamilie,
  k: number,
  rInnen: number,
  rAussen: number,
  nRadius: number,
  mx: number,
  my: number,
): string {
  const schritt = Math.log(rAussen / rInnen) / (nRadius - 1);
  const teile: string[] = [];
  for (let p = 0; p < PUNKTE; p++) {
    const j = (p / (PUNKTE - 1)) * (nRadius - 1);
    const r = rInnen * Math.exp(j * schritt);
    const winkel =
      ((2 * Math.PI) / familie.arme) *
      (k - familie.phase / (2 * Math.PI) - (familie.radiusFrequenz * j) / nRadius);
    const x = mx + r * Math.cos(winkel);
    const y = my + r * Math.sin(winkel);
    teile.push(`${p === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return teile.join(' ');
}

export function createNachzeichner(svg: SVGSVGElement): Nachzeichner {
  let letzteForm = '';

  return {
    spiralen(familien, treffer, optionen, mitte): void {
      // Neu gezeichnet wird nur, wenn sich der Befund ändert. Bei dreißig
      // Bildern je Sekunde jedes Mal hundert Pfade zu ersetzen, würde die
      // Messung ausbremsen, die sie darstellen sollen.
      const form = familien
        .map((f) => `${f.arme}:${f.radiusFrequenz}:${f.phase.toFixed(2)}`)
        .join('|') + (treffer ? '!' : '') + `@${mitte.x.toFixed(4)},${mitte.y.toFixed(4)}`;
      if (form === letzteForm) return;
      letzteForm = form;

      svg.textContent = '';
      // Der Messring in Prozent der Platte: die Rechenkette schneidet den
      // mittigen quadratischen Ausschnitt, dessen halbe Kante 50 % entspricht.
      const rInnen = optionen.innen * 50;
      const rAussen = optionen.aussen * 50;
      const mx = mitte.x * 100;
      const my = mitte.y * 100;

      for (const familie of familien) {
        if (familie.arme < 2) continue;
        const abstand = Math.max(1, Math.ceil(familie.arme / ARME_HOECHSTENS));
        for (let k = 0; k < familie.arme; k += abstand) {
          const linie = document.createElementNS(NS, 'path');
          linie.setAttribute('d', pfad(familie, k, rInnen, rAussen, optionen.nRadius, mx, my));
          linie.setAttribute('class', treffer ? 'spirale spirale-treffer' : 'spirale');
          svg.append(linie);
        }
      }
    },

    ketten(segmente, treffer, messkante): void {
      const form = `ketten:${segmente.length}:${segmente[0]?.x1 ?? 0}:${treffer ? '!' : ''}`;
      if (form === letzteForm) return;
      letzteForm = form;
      svg.textContent = '';
      if (segmente.length === 0) return;

      // Ein Pfad je Schar statt eines Elements je Verbindung -- bei einer
      // Sonnenblume sind es über tausend, und das Standbild soll nicht stocken.
      const faktor = 100 / messkante;
      const pfade = ['', ''];
      for (const s of segmente) {
        pfade[s.schar] +=
          `M${(s.x1 * faktor).toFixed(2)} ${(s.y1 * faktor).toFixed(2)}` +
          `L${(s.x2 * faktor).toFixed(2)} ${(s.y2 * faktor).toFixed(2)}`;
      }
      pfade.forEach((d, schar) => {
        if (!d) return;
        // Erst ein dunkler Hof, dann die Linie darauf -- wie Straßen auf einer
        // Karte. Ohne Hof verschwand Grünspan auf dunklen Blütchen und
        // Papierfarbe auf gelben; ein Beleg, den man nicht sieht, belegt nichts.
        for (const rolle of ['kette-hof', 'kette-linie']) {
          const linie = document.createElementNS(NS, 'path');
          linie.setAttribute('d', d);
          // Die zweite Schar gestrichelt, damit man beide Richtungen
          // auseinanderhalten kann, ohne eine weitere Farbe einzuführen.
          linie.setAttribute(
            'class',
            `kette ${rolle} ${schar === 1 ? 'kette-zweite' : ''} ${treffer ? 'kette-treffer' : ''}`.trim(),
          );
          svg.append(linie);
        }
      });
    },

    loeschen(): void {
      if (letzteForm === '') return;
      letzteForm = '';
      svg.textContent = '';
    },
  };
}

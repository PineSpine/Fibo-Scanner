import type { Spiralfamilie } from '../metrics/parastichen.ts';
import type { LogPolarOptionen } from '../metrics/logPolar.ts';

export interface Nachzeichner {
  /** Die gefundenen Spiralfamilien ins Bild legen. */
  spiralen(
    familien: readonly [Spiralfamilie, Spiralfamilie],
    treffer: boolean,
    optionen: LogPolarOptionen,
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
): string {
  const schritt = Math.log(rAussen / rInnen) / (nRadius - 1);
  const teile: string[] = [];
  for (let p = 0; p < PUNKTE; p++) {
    const j = (p / (PUNKTE - 1)) * (nRadius - 1);
    const r = rInnen * Math.exp(j * schritt);
    const winkel =
      ((2 * Math.PI) / familie.arme) *
      (k - familie.phase / (2 * Math.PI) - (familie.radiusFrequenz * j) / nRadius);
    const x = 50 + r * Math.cos(winkel);
    const y = 50 + r * Math.sin(winkel);
    teile.push(`${p === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return teile.join(' ');
}

export function createNachzeichner(svg: SVGSVGElement): Nachzeichner {
  let letzteForm = '';

  return {
    spiralen(familien, treffer, optionen): void {
      // Neu gezeichnet wird nur, wenn sich der Befund ändert. Bei dreißig
      // Bildern je Sekunde jedes Mal hundert Pfade zu ersetzen, würde die
      // Messung ausbremsen, die sie darstellen sollen.
      const form = familien
        .map((f) => `${f.arme}:${f.radiusFrequenz}:${f.phase.toFixed(2)}`)
        .join('|') + (treffer ? '!' : '');
      if (form === letzteForm) return;
      letzteForm = form;

      svg.textContent = '';
      // Der Messring in Prozent der Platte: die Rechenkette schneidet den
      // mittigen quadratischen Ausschnitt, dessen halbe Kante 50 % entspricht.
      const rInnen = optionen.innen * 50;
      const rAussen = optionen.aussen * 50;

      for (const familie of familien) {
        if (familie.arme < 2) continue;
        const abstand = Math.max(1, Math.ceil(familie.arme / ARME_HOECHSTENS));
        for (let k = 0; k < familie.arme; k += abstand) {
          const linie = document.createElementNS(NS, 'path');
          linie.setAttribute('d', pfad(familie, k, rInnen, rAussen, optionen.nRadius));
          linie.setAttribute('class', treffer ? 'spirale spirale-treffer' : 'spirale');
          svg.append(linie);
        }
      }
    },

    loeschen(): void {
      if (letzteForm === '') return;
      letzteForm = '';
      svg.textContent = '';
    },
  };
}

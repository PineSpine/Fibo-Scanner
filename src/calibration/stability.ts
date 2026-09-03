export interface StabilityReport {
  /** Spanne zwischen groesstem und kleinstem Wert im Fenster. */
  span: number;
  /** Wie lange das Fenster tatsaechlich schon gefuellt ist, in Sekunden. */
  seconds: number;
  samples: number;
  /** Fenster voll und Spanne unter der Grenze. */
  stable: boolean;
}

export interface StabilityTracker {
  push(value: number, timestamp: number): StabilityReport;
  reset(): void;
  readonly report: StabilityReport;
}

const EMPTY: StabilityReport = { span: 0, seconds: 0, samples: 0, stable: false };

/**
 * Fuehrt Buch ueber die Schwankung des angezeigten Werts.
 *
 * Das ist die Abnahmebedingung fuer M1: bei ruhiger Hand darf der Wert ueber
 * zehn Sekunden um weniger als 0,05 wandern. Ein Messgeraet, das seine eigene
 * Unruhe nicht kennt, kann sie auch nicht melden -- deshalb steht die Spanne
 * in der Anzeige und nicht nur im Protokoll.
 */
export function createStabilityTracker(windowMs = 10_000, limit = 0.05): StabilityTracker {
  const values: number[] = [];
  const times: number[] = [];
  let current: StabilityReport = EMPTY;

  return {
    push(value: number, timestamp: number): StabilityReport {
      values.push(value);
      times.push(timestamp);
      while (times.length > 0 && timestamp - times[0]! > windowMs) {
        times.shift();
        values.shift();
      }

      let lo = Infinity;
      let hi = -Infinity;
      for (const v of values) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      const seconds = (timestamp - (times[0] ?? timestamp)) / 1000;
      const span = values.length > 0 ? hi - lo : 0;

      current = {
        span,
        seconds,
        samples: values.length,
        stable: seconds >= windowMs / 1000 - 0.5 && span < limit,
      };
      return current;
    },

    reset(): void {
      values.length = 0;
      times.length = 0;
      current = EMPTY;
    },

    get report(): StabilityReport {
      return current;
    },
  };
}

export interface Smoother {
  /** Neuen Messwert einarbeiten und den geglaetteten Wert zurueckgeben. */
  push(value: number, confidence: number): number;
  reset(): void;
  readonly value: number;
  readonly settled: boolean;
}

/**
 * Exponentielle Glaettung, gewichtet mit der Konfidenz.
 *
 * Ein Frame, dem das Verfahren selbst nicht traut -- verwackelt, zu dunkel,
 * Kanten gesaettigt --, darf die Anzeige nicht mitreissen. Deshalb geht die
 * Konfidenz als Faktor in die Schrittweite ein: bei 0 bleibt der Wert stehen,
 * bei 1 folgt er mit voller Rate.
 *
 * `alpha` ist bewusst klein. Bei 30 Bildern je Sekunde entspricht 0,12 einer
 * Einschwingzeit von knapp einer Sekunde -- schnell genug, um beim Schwenken
 * mitzukommen, langsam genug, dass die letzte Stelle nicht zappelt.
 */
export function createSmoother(alpha = 0.12): Smoother {
  let value = 0;
  let weight = 0;

  return {
    push(sample: number, confidence: number): number {
      const a = alpha * Math.max(0, Math.min(1, confidence));
      if (a === 0) return value;
      if (weight === 0) {
        value = sample;
      } else {
        value += (sample - value) * a;
      }
      weight = Math.min(1, weight + a);
      return value;
    },
    reset(): void {
      value = 0;
      weight = 0;
    },
    get value(): number {
      return value;
    },
    /** Genug vertrauenswuerdige Frames gesehen, um den Wert zu zeigen. */
    get settled(): boolean {
      return weight > 0.6;
    },
  };
}

export interface Belichtungsbericht {
  /** Mittlere Helligkeit des Messbildes, 0..255. */
  helligkeit: number;
  /** Das Bild hat sich beruhigt, die Automatik ist fertig. */
  eingependelt: boolean;
  /** So dunkel, dass eine Kantenmessung nichts taugt. */
  zuDunkel: boolean;
  /** Wie lange beobachtet wird, in Sekunden. */
  sekunden: number;
}

export interface Belichtungswaechter {
  beobachte(gray: Uint8Array, timestamp: number): Belichtungsbericht;
  reset(): void;
}

export interface Belichtungsoptionen {
  /** Ab dieser Helligkeit gilt das Bild als brauchbar. */
  dunkelgrenze: number;
  /** Zulaessige Aenderung der mittleren Helligkeit je Bild. */
  ruhe: number;
  /** So viele ruhige Bilder in Folge gelten als eingependelt. */
  ruhigeBilder: number;
  /** Frühestens nach dieser Zeit gilt das Bild als eingependelt. */
  mindestensSekunden: number;
  /** Spätestens nach dieser Zeit wird nicht länger gewartet. */
  hoechstensSekunden: number;
}

export const BELICHTUNG_STANDARD: Belichtungsoptionen = {
  dunkelgrenze: 28,
  ruhe: 1,
  ruhigeBilder: 6,
  mindestensSekunden: 0.8,
  hoechstensSekunden: 4,
};

/**
 * Wartet, bis die Belichtungsautomatik der Kamera fertig ist.
 *
 * Der Grund ist ein Fehler, der beim ersten Feldversuch auffiel: Die
 * Belichtung wurde gesperrt, sobald der Kamerastrom stand -- also wenige
 * hundert Millisekunden nach dem Start. Die Automatik eines Telefons beginnt
 * aber dunkel und braucht ein bis zwei Sekunden, bis sie den Raum gefunden hat.
 * Wer vorher sperrt, friert das schwarze Anfangsbild ein, und es hellt sich nie
 * wieder auf. Im hell beleuchteten Zimmer sah die App dann fast nichts,
 * während die Kamera-App des Telefons ein normales Bild lieferte.
 *
 * Beobachtet wird die mittlere Helligkeit. Ändert sie sich über mehrere Bilder
 * kaum noch, ist die Automatik zur Ruhe gekommen und die Sperre darf greifen.
 * Nach `hoechstensSekunden` wird nicht weiter gewartet -- ein flackerndes
 * Kunstlicht kommt sonst nie zur Ruhe.
 */
export function createBelichtungswaechter(
  optionen: Belichtungsoptionen = BELICHTUNG_STANDARD,
): Belichtungswaechter {
  let start = 0;
  let letzte = -1;
  let ruhige = 0;
  let fertig = false;

  return {
    beobachte(gray: Uint8Array, timestamp: number): Belichtungsbericht {
      if (start === 0) start = timestamp;
      const sekunden = (timestamp - start) / 1000;

      // Jeder sechzehnte Punkt genügt für einen Mittelwert. Bei 512 x 512 sind
      // das 16384 Stichproben -- der Fehler liegt weit unter einer Graustufe.
      let summe = 0;
      let anzahl = 0;
      for (let i = 0; i < gray.length; i += 16) {
        summe += gray[i]!;
        anzahl++;
      }
      const helligkeit = anzahl > 0 ? summe / anzahl : 0;

      if (!fertig) {
        if (letzte >= 0 && Math.abs(helligkeit - letzte) <= optionen.ruhe) ruhige++;
        else ruhige = 0;
        letzte = helligkeit;

        const beruhigt = ruhige >= optionen.ruhigeBilder && sekunden >= optionen.mindestensSekunden;
        if (beruhigt || sekunden >= optionen.hoechstensSekunden) fertig = true;
      }

      return {
        helligkeit,
        eingependelt: fertig,
        zuDunkel: helligkeit < optionen.dunkelgrenze,
        sekunden,
      };
    },

    reset(): void {
      start = 0;
      letzte = -1;
      ruhige = 0;
      fertig = false;
    },
  };
}

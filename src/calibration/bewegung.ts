/**
 * Wie stark sich das Bild von einem Messbild zum naechsten geaendert hat.
 *
 * Die Zahl beantwortet die Frage, die bei jedem zappelnden Messwert als erstes
 * zu stellen ist: Lag es am Verfahren oder an der Hand? Ohne sie ist jede
 * Aussage ueber Reproduzierbarkeit eine Vermutung -- man sieht, dass der Wert
 * springt, aber nicht, ob das Bild dabei stillstand.
 *
 * Bewusst kein Tor: Es wird kein Bild verworfen, weil es "zu unruhig" waere.
 * Eine solche Schwelle muesste am Geraet gemessen sein, und das ist sie nicht.
 * Unruhige Bilder erledigen sich in der Messreihe von selbst -- sie sind sich
 * untereinander uneinig, und die Einigkeit ist genau das, was die Reihe meldet.
 * Diese Zahl steht daneben und sagt, woran es lag.
 */

/**
 * Mittlerer Betrag der Helligkeitsaenderung zwischen zwei Graustufenbildern,
 * in Graustufen (0..255).
 *
 * Ruhige Hand auf ruhigem Motiv: Sensorrauschen, wenige Graustufen. Ein
 * Schwenk oder ein nachregelnder Autofokus hebt den Wert deutlich darueber --
 * um wie viel, ist am Geraet abzulesen (Messprotokoll, Zeile "Bildunruhe")
 * und noch nicht kalibriert.
 *
 * Unterschiedlich grosse Bilder ergeben 0: dann gibt es nichts zu vergleichen.
 */
export function bildabstand(a: Uint8Array, b: Uint8Array): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let summe = 0;
  for (let i = 0; i < a.length; i++) summe += Math.abs(a[i]! - b[i]!);
  return summe / a.length;
}

export interface Unruhewaechter {
  /** Neues Messbild einarbeiten, geglaetteten Abstand zurueckgeben. */
  beobachte(gray: Uint8Array): number;
  /** Groesster Einzelabstand seit dem letzten `merkeZuruecksetzen`. */
  readonly gipfel: number;
  gipfelZuruecksetzen(): void;
  reset(): void;
  readonly wert: number;
}

/**
 * Fuehrt Buch ueber die Bildunruhe.
 *
 * Geglaettet wird kurz -- ein Zehntel Sekunde reicht, um das Sensorrauschen
 * herauszunehmen, ohne einen Ruck zu verschlucken. Der Gipfel bleibt daneben
 * stehen: Fuer eine Messreihe ist nicht die mittlere Unruhe interessant,
 * sondern die groesste. Ein einziger Ruck in der Mitte der Reihe erklaert mehr
 * Uneinigkeit als zwei Sekunden leichtes Zittern.
 */
export function createUnruhewaechter(alpha = 0.25): Unruhewaechter {
  let vorheriges: Uint8Array | null = null;
  let wert = 0;
  let gipfel = 0;

  return {
    beobachte(gray: Uint8Array): number {
      if (vorheriges === null || vorheriges.length !== gray.length) {
        vorheriges = Uint8Array.from(gray);
        return wert;
      }
      const abstand = bildabstand(gray, vorheriges);
      // Die Kopie ist noetig: Die Pipeline legt zwar je Bild einen neuen
      // Puffer an, aber darauf soll sich diese Datei nicht verlassen.
      vorheriges = Uint8Array.from(gray);
      wert = wert === 0 ? abstand : wert + (abstand - wert) * alpha;
      if (abstand > gipfel) gipfel = abstand;
      return wert;
    },
    get gipfel(): number {
      return gipfel;
    },
    gipfelZuruecksetzen(): void {
      gipfel = 0;
    },
    reset(): void {
      vorheriges = null;
      wert = 0;
      gipfel = 0;
    },
    get wert(): number {
      return wert;
    },
  };
}

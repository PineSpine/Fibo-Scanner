export interface AnzeigeZustand {
  /** null, solange nichts Belastbares gemessen wurde. */
  wert: number | null;
  konfidenz: number;
  stabil: boolean;
  /** Warum der Wert unsicher ist, oder was der Nutzer tun kann. */
  hinweis: string;
  deutung: string;
  schwankung: number | null;
  sekunden: number;
  dichte: number;
  r2: number;
  /** Ausgewertete Bilder je Sekunde. */
  messrate: number;
  belichtung: string;
}

export interface Anzeige {
  zeige(zustand: AnzeigeZustand): void;
}

const zahl = (wert: number, stellen: number): string =>
  wert.toLocaleString('de-DE', {
    minimumFractionDigits: stellen,
    maximumFractionDigits: stellen,
  });

/**
 * Ein Messwert ohne Vertrauensangabe ist eine Behauptung. Die App zeigt
 * deshalb beides, und bei niedrigem Vertrauen tritt die Zahl zurück, statt zu
 * verschwinden -- wer misst, soll sehen, was das Gerät sieht.
 */
function vertrauensstufe(konfidenz: number): 'gut' | 'gering' | 'keins' {
  if (konfidenz >= 0.6) return 'gut';
  if (konfidenz >= 0.15) return 'gering';
  return 'keins';
}

function vertrauenswort(konfidenz: number): string {
  if (konfidenz >= 0.85) return 'hoch';
  if (konfidenz >= 0.6) return 'brauchbar';
  if (konfidenz >= 0.15) return 'schwach';
  return 'keins';
}

function frag<T extends Element>(wurzel: ParentNode, wahl: string): T {
  const element = wurzel.querySelector<T>(wahl);
  if (!element) throw new Error(`Element fehlt: ${wahl}`);
  return element;
}

export function createAnzeige(wurzel: ParentNode = document): Anzeige {
  const schleier = frag<HTMLElement>(wurzel, '.schleier');
  const wertFeld = frag<HTMLOutputElement>(wurzel, '#wert');
  const hinweisFeld = frag<HTMLElement>(wurzel, '#wert-hinweis');
  const deutungFeld = frag<HTMLElement>(wurzel, '#deutung');
  const schwankungFeld = frag<HTMLElement>(wurzel, '#rand-schwankung');
  const konfidenzFeld = frag<HTMLElement>(wurzel, '#rand-konfidenz');
  const dichteFeld = frag<HTMLElement>(wurzel, '#rand-dichte');
  const r2Feld = frag<HTMLElement>(wurzel, '#rand-r2');
  const messrateFeld = frag<HTMLElement>(wurzel, '#rand-messrate');
  const belichtungFeld = frag<HTMLElement>(wurzel, '#rand-belichtung');

  let letzteDeutung = '';

  return {
    zeige(z: AnzeigeZustand): void {
      wertFeld.textContent = z.wert === null ? '—' : zahl(z.wert, 2);
      schleier.dataset['vertrauen'] = vertrauensstufe(z.konfidenz);
      schleier.dataset['stabil'] = z.stabil ? 'ja' : 'nein';
      hinweisFeld.textContent = z.hinweis;

      // Der Erklärtext wechselt nur, wenn er sich wirklich ändert. Sonst
      // flackert er bei jedem Bild.
      if (z.deutung !== letzteDeutung) {
        deutungFeld.textContent = z.deutung;
        letzteDeutung = z.deutung;
      }

      if (z.schwankung === null) {
        schwankungFeld.textContent = '—';
        schwankungFeld.removeAttribute('data-treffer');
      } else {
        const gefuellt = z.sekunden >= 9.5;
        schwankungFeld.textContent = gefuellt
          ? zahl(z.schwankung, 3)
          : `${zahl(z.schwankung, 3)} (${zahl(z.sekunden, 0)} s)`;
        // Gold ist selten und bedeutet hier genau eine Sache: die
        // Abnahmebedingung für M1 ist gerade erfüllt.
        if (gefuellt && z.stabil) schwankungFeld.dataset['treffer'] = 'ja';
        else schwankungFeld.removeAttribute('data-treffer');
      }

      konfidenzFeld.textContent = `${Math.round(z.konfidenz * 100)} % · ${vertrauenswort(z.konfidenz)}`;
      dichteFeld.textContent = `${zahl(z.dichte * 100, 1)} %`;
      r2Feld.textContent = z.r2 > 0 ? zahl(z.r2, 4) : '—';
      messrateFeld.textContent = z.messrate > 0 ? zahl(z.messrate, 0) : '—';
      belichtungFeld.textContent = z.belichtung;
    },
  };
}

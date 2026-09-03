export interface AnzeigeZustand {
  /** Name des laufenden Verfahrens, wie er über dem Wert steht. */
  verfahren: string;
  /** Fertig formatierter Messwert, oder null solange keiner belastbar ist. */
  wert: string | null;
  konfidenz: number;
  stabil: boolean;
  /** Ein Fibonacci-Paar wurde gefunden. Der einzige weitere Anlass für Gold. */
  treffer: boolean;
  /** Warum der Wert unsicher ist, oder was der Nutzer tun kann. */
  hinweis: string;
  schwankung: number | null;
  sekunden: number;
  /** Mittlere Bildhelligkeit 0..255. */
  helligkeit: number;
  /** Ausgewertete Bilder je Sekunde. */
  messrate: number;
  belichtung: string;
  /** Was das Verfahren selbst meldet. Wechselt mit dem Modus. */
  detail: Readonly<Record<string, number>>;
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
 * Deutsche Beschriftungen für die Zwischenwerte der Verfahren. Was hier fehlt,
 * erscheint unter seinem technischen Namen -- besser als gar nicht.
 */
const DETAIL_NAMEN: Readonly<Record<string, string>> = {
  density: 'Kantendichte',
  r2: 'Geradheit r²',
  threshold: 'Schwellwert',
  meanMagnitude: 'Kantenbetrag, Mittel',
  peakMagnitude: 'Kantenbetrag, Spitze',
  scales: 'genutzte Skalen',
  side: 'Ausschnitt, Kante',
  links: 'Spiralen, eine Richtung',
  rechts: 'Spiralen, andere Richtung',
  schaerfeLinks: 'Gipfelschärfe, eine',
  schaerfeRechts: 'Gipfelschärfe, andere',
  treffer: 'Fibonacci-Paar',
};

/** Zwischenwerte, die niemandem etwas sagen, bleiben aus dem Protokoll heraus. */
const DETAIL_VERBORGEN = new Set(['side']);

function detailWert(schluessel: string, wert: number): string {
  if (schluessel === 'treffer') return wert === 1 ? 'ja' : 'nein';
  if (schluessel === 'density') return `${zahl(wert * 100, 1)} %`;
  if (Number.isInteger(wert)) return String(wert);
  return zahl(wert, wert < 10 ? 3 : 1);
}

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

function frag<T extends Element>(wurzel: ParentNode, wahl: string): T {
  const element = wurzel.querySelector<T>(wahl);
  if (!element) throw new Error(`Element fehlt: ${wahl}`);
  return element;
}

export function createAnzeige(wurzel: ParentNode = document): Anzeige {
  const schleier = frag<HTMLElement>(wurzel, '.schleier');
  const verfahrenFeld = frag<HTMLElement>(wurzel, '#wert-name');
  const wertFeld = frag<HTMLOutputElement>(wurzel, '#wert');
  const hinweisFeld = frag<HTMLElement>(wurzel, '#wert-hinweis');
  const schwankungFeld = frag<HTMLElement>(wurzel, '#rand-schwankung');
  const konfidenzFeld = frag<HTMLElement>(wurzel, '#rand-konfidenz');
  const messrateFeld = frag<HTMLElement>(wurzel, '#rand-messrate');
  const belichtungFeld = frag<HTMLElement>(wurzel, '#rand-belichtung');
  const helligkeitFeld = frag<HTMLElement>(wurzel, '#rand-helligkeit');
  const detailListe = frag<HTMLElement>(wurzel, '#rand-detail');

  let letzteDetailForm = '';

  return {
    zeige(z: AnzeigeZustand): void {
      verfahrenFeld.textContent = z.verfahren;
      wertFeld.textContent = z.wert ?? '—';
      schleier.dataset['vertrauen'] = vertrauensstufe(z.konfidenz);
      schleier.dataset['stabil'] = z.stabil ? 'ja' : 'nein';
      schleier.dataset['treffer'] = z.treffer ? 'ja' : 'nein';

      // Solange kein Wert dasteht, erklärt der Hinweis allein, woran es liegt.
      // Steht einer da, gehört das Vertrauen davor -- es ist die Einschränkung,
      // die immer gilt, der Vorbehalt nur die von heute.
      hinweisFeld.textContent =
        z.wert === null
          ? z.hinweis
          : `Vertrauen ${Math.round(z.konfidenz * 100)} %${z.hinweis ? ` · ${z.hinweis}` : ''}`;

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

      konfidenzFeld.textContent = `${Math.round(z.konfidenz * 100)} %`;
      messrateFeld.textContent = z.messrate > 0 ? zahl(z.messrate, 0) : '—';
      belichtungFeld.textContent = z.belichtung;
      // Ein Prozentwert der vollen Aussteuerung ist greifbarer als 0..255.
      helligkeitFeld.textContent = `${zahl((z.helligkeit / 255) * 100, 0)} %`;

      // Die Zeilen werden nur neu gebaut, wenn sich die Auswahl der Schlüssel
      // ändert -- sonst hinge bei dreißig Bildern je Sekunde das halbe
      // Protokoll am Neuaufbau.
      const schluessel = Object.keys(z.detail).filter((k) => !DETAIL_VERBORGEN.has(k));
      const form = schluessel.join('|');
      if (form !== letzteDetailForm) {
        detailListe.textContent = '';
        for (const k of schluessel) {
          const paar = document.createElement('div');
          paar.className = 'rand-paar';
          const dt = document.createElement('dt');
          dt.textContent = DETAIL_NAMEN[k] ?? k;
          const dd = document.createElement('dd');
          dd.dataset['schluessel'] = k;
          paar.append(dt, dd);
          detailListe.append(paar);
        }
        letzteDetailForm = form;
      }
      for (const dd of detailListe.querySelectorAll<HTMLElement>('dd[data-schluessel]')) {
        const k = dd.dataset['schluessel']!;
        dd.textContent = detailWert(k, z.detail[k] ?? 0);
      }
    },
  };
}

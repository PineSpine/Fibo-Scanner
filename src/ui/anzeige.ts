export interface Befund {
  id: string;
  /** Name des Verfahrens, wie er dasteht. */
  name: string;
  /** Fertig formatierter Messwert, oder null solange keiner belastbar ist. */
  wert: string | null;
  konfidenz: number;
  /** Ein Fibonacci-Paar wurde gefunden. Einer der beiden Anlässe für Gold. */
  treffer: boolean;
  /** Warum der Wert unsicher ist, oder was der Nutzer tun kann. */
  hinweis: string;
}

export interface AnzeigeZustand {
  /** Was gerade am meisten hergibt. Steht groß über dem Bild. */
  haupt: Befund;
  /** Die übrigen Verfahren, klein darunter. */
  neben: readonly Befund[];
  stabil: boolean;
  schwankung: number | null;
  sekunden: number;
  /** Mittlere Bildhelligkeit 0..255. */
  helligkeit: number;
  /** Ausgewertete Bilder je Sekunde. */
  messrate: number;
  belichtung: string;
  /** Wann der laufende Stand gebaut wurde. */
  stand: string;
  /** Zwischenwerte des Hauptbefundes. */
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
  streuung: 'Struktur im Ring',
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
  const nebenListe = frag<HTMLElement>(wurzel, '#nebenbefunde');
  const schwankungFeld = frag<HTMLElement>(wurzel, '#rand-schwankung');
  const konfidenzFeld = frag<HTMLElement>(wurzel, '#rand-konfidenz');
  const messrateFeld = frag<HTMLElement>(wurzel, '#rand-messrate');
  const belichtungFeld = frag<HTMLElement>(wurzel, '#rand-belichtung');
  const helligkeitFeld = frag<HTMLElement>(wurzel, '#rand-helligkeit');
  const standFeld = frag<HTMLElement>(wurzel, '#rand-stand');
  const detailListe = frag<HTMLElement>(wurzel, '#rand-detail');

  let letzteDetailForm = '';
  let letzteNebenForm = '';

  /** Baut die Zeilen der Nebenbefunde, aber nur wenn sich die Auswahl ändert. */
  function nebenAufbauen(neben: readonly Befund[]): void {
    const form = neben.map((b) => b.id).join('|');
    if (form === letzteNebenForm) return;
    nebenListe.textContent = '';
    for (const b of neben) {
      const zeile = document.createElement('li');
      zeile.className = 'befund';
      zeile.dataset['id'] = b.id;
      const name = document.createElement('span');
      name.className = 'befund-name';
      const wert = document.createElement('span');
      wert.className = 'befund-wert';
      const vertrauen = document.createElement('span');
      vertrauen.className = 'befund-vertrauen';
      const balken = document.createElement('span');
      balken.className = 'befund-balken';
      balken.append(document.createElement('i'));
      zeile.append(name, wert, vertrauen, balken);
      nebenListe.append(zeile);
    }
    letzteNebenForm = form;
  }

  return {
    zeige(z: AnzeigeZustand): void {
      verfahrenFeld.textContent = z.haupt.name;
      wertFeld.textContent = z.haupt.wert ?? '—';
      schleier.dataset['vertrauen'] = vertrauensstufe(z.haupt.konfidenz);
      schleier.dataset['stabil'] = z.stabil ? 'ja' : 'nein';
      schleier.dataset['treffer'] = z.haupt.treffer ? 'ja' : 'nein';

      // Solange kein Wert dasteht, erklärt der Hinweis allein, woran es liegt.
      // Steht einer da, gehört das Vertrauen davor -- es ist die Einschränkung,
      // die immer gilt, der Vorbehalt nur die von heute.
      hinweisFeld.textContent =
        z.haupt.wert === null
          ? z.haupt.hinweis
          : `Vertrauen ${Math.round(z.haupt.konfidenz * 100)} %${
              z.haupt.hinweis ? ` · ${z.haupt.hinweis}` : ''
            }`;

      nebenAufbauen(z.neben);
      for (const b of z.neben) {
        const zeile = nebenListe.querySelector<HTMLElement>(`[data-id="${b.id}"]`);
        if (!zeile) continue;
        zeile.dataset['vertrauen'] = vertrauensstufe(b.konfidenz);
        zeile.dataset['treffer'] = b.treffer ? 'ja' : 'nein';
        const name = zeile.querySelector('.befund-name');
        const wert = zeile.querySelector('.befund-wert');
        if (name) name.textContent = b.name;
        // Ohne Vertrauen keine Zahl, sondern der Grund. Eine Zahl ohne Deckung
        // wäre genau die Behauptung, die die App nicht aufstellen soll.
        if (wert) wert.textContent = b.wert ?? (b.hinweis || 'nichts gefunden');
        const vertrauen = zeile.querySelector('.befund-vertrauen');
        if (vertrauen) {
          vertrauen.textContent =
            b.wert === null
              ? 'nichts gefunden'
              : `Vertrauen ${Math.round(b.konfidenz * 100)} %${b.hinweis ? ` · ${b.hinweis}` : ''}`;
        }
        const fuellung = zeile.querySelector<HTMLElement>('.befund-balken i');
        if (fuellung) fuellung.style.width = `${Math.round(b.konfidenz * 100)}%`;
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

      konfidenzFeld.textContent = `${Math.round(z.haupt.konfidenz * 100)} %`;
      messrateFeld.textContent = z.messrate > 0 ? zahl(z.messrate, 0) : '—';
      belichtungFeld.textContent = z.belichtung;
      standFeld.textContent = z.stand;
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

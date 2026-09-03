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
  /**
   * Alle Verfahren, das aussagekräftigste zuerst. Sie stehen zusammen an einer
   * Stelle: Wer nicht weiß, wonach er sucht, soll nicht an zwei Orten
   * nachsehen müssen.
   */
  befunde: readonly Befund[];
  /**
   * Was mit dem Bild selbst nicht stimmt -- zu dunkel, Belichtung regelt noch.
   * Leer, wenn alles in Ordnung ist; dann bleibt das Bild frei.
   */
  zustand: string;
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
  /** Zwischenwerte des führenden Verfahrens. */
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
  const zustandFeld = frag<HTMLElement>(wurzel, '#zustand');
  const befundListe = frag<HTMLElement>(wurzel, '#befunde');
  const schwankungFeld = frag<HTMLElement>(wurzel, '#rand-schwankung');
  const konfidenzFeld = frag<HTMLElement>(wurzel, '#rand-konfidenz');
  const messrateFeld = frag<HTMLElement>(wurzel, '#rand-messrate');
  const belichtungFeld = frag<HTMLElement>(wurzel, '#rand-belichtung');
  const helligkeitFeld = frag<HTMLElement>(wurzel, '#rand-helligkeit');
  const standFeld = frag<HTMLElement>(wurzel, '#rand-stand');
  const detailListe = frag<HTMLElement>(wurzel, '#rand-detail');

  let letzteDetailForm = '';
  let letzteBefundForm = '';

  /** Baut die Zeilen, aber nur wenn sich Auswahl oder Reihenfolge ändern. */
  function befundeAufbauen(befunde: readonly Befund[]): void {
    const form = befunde.map((b) => b.id).join('|');
    if (form === letzteBefundForm) return;
    befundListe.textContent = '';
    for (const b of befunde) {
      const zeile = document.createElement('li');
      zeile.className = 'befund';
      zeile.dataset['id'] = b.id;
      for (const [klasse, tag] of [
        ['befund-name', 'span'],
        ['befund-wert', 'output'],
        ['befund-vertrauen', 'span'],
      ] as const) {
        const el = document.createElement(tag);
        el.className = klasse;
        zeile.append(el);
      }
      const balken = document.createElement('span');
      balken.className = 'befund-balken';
      balken.append(document.createElement('i'));
      zeile.append(balken);
      befundListe.append(zeile);
    }
    letzteBefundForm = form;
  }

  return {
    zeige(z: AnzeigeZustand): void {
      zustandFeld.textContent = z.zustand;
      zustandFeld.hidden = z.zustand === '';

      befundeAufbauen(z.befunde);
      z.befunde.forEach((b, rang) => {
        const zeile = befundListe.querySelector<HTMLElement>(`[data-id="${b.id}"]`);
        if (!zeile) return;
        // Der erste Befund ist der aussagekräftigste. Er steht größer da --
        // aber in derselben Liste, nicht an einem anderen Ort.
        zeile.dataset['rang'] = rang === 0 ? 'erster' : 'weiterer';
        zeile.dataset['vertrauen'] = vertrauensstufe(b.konfidenz);
        zeile.dataset['treffer'] = b.treffer ? 'ja' : 'nein';

        const name = zeile.querySelector('.befund-name');
        const wert = zeile.querySelector('.befund-wert');
        const vertrauen = zeile.querySelector('.befund-vertrauen');
        if (name) name.textContent = b.name;
        // Ohne Vertrauen keine Zahl, sondern der Grund. Eine Zahl ohne Deckung
        // wäre genau die Behauptung, die die App nicht aufstellen soll.
        if (wert) wert.textContent = b.wert ?? '—';
        if (vertrauen) {
          vertrauen.textContent =
            b.wert === null
              ? b.hinweis || 'nichts gefunden'
              : `Vertrauen ${Math.round(b.konfidenz * 100)} %${b.hinweis ? ` · ${b.hinweis}` : ''}`;
        }
        const fuellung = zeile.querySelector<HTMLElement>('.befund-balken i');
        if (fuellung) fuellung.style.width = `${Math.round(b.konfidenz * 100)}%`;
      });

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

      konfidenzFeld.textContent = `${Math.round((z.befunde[0]?.konfidenz ?? 0) * 100)} %`;
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

/**
 * Baut je Verfahren einen Ausklapper: erst das Phänomen, dann die Messung.
 *
 * Getrennt, weil es zwei verschiedene Fragen sind. Die erste -- was ist das
 * überhaupt -- stellt sich jedem einmal. Die zweite -- wie kommt die Zahl
 * zustande -- nur dem, der der Zahl nicht traut.
 */
export function erklaerungenAufbauen(
  ziel: HTMLElement,
  verfahren: ReadonlyArray<{ label: string; phaenomen: readonly string[]; verfahren: readonly string[] }>,
): void {
  ziel.textContent = '';
  for (const v of verfahren) {
    const block = document.createElement('details');
    block.className = 'ausklapp';
    const griff = document.createElement('summary');
    griff.textContent = v.label;
    block.append(griff);

    for (const absatz of v.phaenomen) {
      const p = document.createElement('p');
      p.textContent = absatz;
      block.append(p);
    }

    const zwischen = document.createElement('h3');
    zwischen.textContent = 'Wie die App das misst';
    block.append(zwischen);

    for (const absatz of v.verfahren) {
      const p = document.createElement('p');
      p.className = 'zurueckhaltung';
      p.textContent = absatz;
      block.append(p);
    }

    ziel.append(block);
  }
}

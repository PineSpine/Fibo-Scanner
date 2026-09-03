import type { GrayImage } from './images.ts';

/**
 * Der Goldene Winkel in Bogenmaß: 2π/φ² = 137,50776…°.
 *
 * Quelle der Anordnung: H. Vogel, "A better way to construct the sunflower
 * head", Mathematical Biosciences 44 (1979). Das Blütchen mit der Nummer n
 * sitzt bei Radius c·√n und Winkel n·ψ. Die Wurzel sorgt dafür, dass jedes
 * Blütchen gleich viel Fläche bekommt.
 */
export const GOLDENER_WINKEL = Math.PI * (3 - Math.sqrt(5));

export interface Bluetenstand {
  bild: GrayImage;
  /** Mittelpunkt in Bildkoordinaten. */
  cx: number;
  cy: number;
  /** Radius des äußersten Blütchens. */
  radius: number;
  anzahl: number;
}

export interface BluetenstandOptionen {
  groesse: number;
  /** Zahl der Blütchen. Bestimmt, welche Fibonacci-Zahlen sichtbar werden. */
  anzahl: number;
  /** Anteil des halben Bildes, den der Blütenstand einnimmt. */
  fuellung: number;
  /** Winkel je Blütchen. Standard ist der Goldene Winkel. */
  winkel: number;
  /** Blütchenradius als Anteil des mittleren Abstands. */
  dicke: number;
  /** Drehung des ganzen Standes, damit Tests nicht auf eine Lage bauen. */
  drehung: number;
  /** Grundton und Blütchenton. */
  grund: number;
  tinte: number;
}

export const BLUETENSTAND_STANDARD: BluetenstandOptionen = {
  groesse: 512,
  anzahl: 1200,
  fuellung: 0.94,
  winkel: GOLDENER_WINKEL,
  dicke: 0.42,
  drehung: 0.7,
  grund: 210,
  tinte: 45,
};

/**
 * Zeichnet einen Blütenstand nach Vogel: Sonnenblume, Zapfen, Korbblütler.
 *
 * Welche Spiralenzahlen sichtbar sind, hängt vom Radius ab -- außen mehr als
 * innen, weil die Blütchen gleich groß bleiben, der Umfang aber wächst. Genau
 * deshalb wertet das Messverfahren einen Kreisring aus und nicht die ganze
 * Scheibe.
 */
export function bluetenstand(teil: Partial<BluetenstandOptionen> = {}): Bluetenstand {
  const o = { ...BLUETENSTAND_STANDARD, ...teil };
  const groesse = o.groesse;
  const daten = new Uint8Array(groesse * groesse).fill(o.grund);
  const cx = groesse / 2;
  const cy = groesse / 2;
  const radius = (groesse / 2) * o.fuellung;
  const c = radius / Math.sqrt(o.anzahl);

  // Gleiche Fläche je Blütchen, also überall derselbe Abstand.
  const abstand = radius * Math.sqrt(Math.PI / o.anzahl);
  const dicke = Math.max(1.2, abstand * o.dicke);

  for (let n = 1; n <= o.anzahl; n++) {
    const r = c * Math.sqrt(n);
    const t = n * o.winkel + o.drehung;
    const x = cx + r * Math.cos(t);
    const y = cy + r * Math.sin(t);

    // Weiche Scheibe: harte Kanten erzeugen im Spektrum Oberwellen, die als
    // zusätzliche Spiralfamilien durchgehen könnten.
    const rand = Math.ceil(dicke) + 1;
    for (let dy = -rand; dy <= rand; dy++) {
      const yi = Math.round(y) + dy;
      if (yi < 0 || yi >= groesse) continue;
      for (let dx = -rand; dx <= rand; dx++) {
        const xi = Math.round(x) + dx;
        if (xi < 0 || xi >= groesse) continue;
        const d = Math.hypot(xi - x, yi - y);
        const anteil = Math.max(0, Math.min(1, (dicke - d) / 1.2 + 0.5));
        if (anteil <= 0) continue;
        const i = yi * groesse + xi;
        const neu = daten[i]! * (1 - anteil) + o.tinte * anteil;
        if (neu < daten[i]!) daten[i] = Math.round(neu);
      }
    }
  }

  return { bild: { data: daten, width: groesse, height: groesse }, cx, cy, radius, anzahl: o.anzahl };
}

/**
 * Dieselbe Anordnung, aber mit einem Winkel, der keine Fibonacci-Zahlen
 * erzeugt. Prüft, dass das Verfahren nicht überall Fibonacci sieht -- das ist
 * die Zahlenmystik, die die Projektbeschreibung ausschließt.
 */
export function bluetenstandOhneFibonacci(teil: Partial<BluetenstandOptionen> = {}): Bluetenstand {
  // 100 Grad: teilerfremd zu 360, ergibt eine saubere Spirale, aber die
  // Spiralenzahlen sind Nenner der Kettenbruchnäherung von 100/360 = 5/18 --
  // also 4, 18, 22 und so fort, keine Fibonacci-Folge.
  return bluetenstand({ ...teil, winkel: (100 * Math.PI) / 180 });
}

export interface LogPolarOptionen {
  /** Abtastpunkte über den vollen Winkel. Zweierpotenz. */
  nWinkel: number;
  /** Abtastringe zwischen innerem und äußerem Radius. Zweierpotenz. */
  nRadius: number;
  /** Innerer Radius, als Anteil des halben Bildes. */
  innen: number;
  /** Äußerer Radius, als Anteil des halben Bildes. */
  aussen: number;
}

/**
 * 512 Winkelschritte, damit auch 89 Arme noch sauber getroffen werden: bei 89
 * Armen bleiben knapp sechs Abtastpunkte je Arm. Mit 256 waeren es drei -- ueber
 * der Nyquist-Grenze, aber zu knapp, um einen Gipfel verlaesslich zu treffen.
 */
export const LOGPOLAR_STANDARD: LogPolarOptionen = {
  nWinkel: 512,
  nRadius: 64,
  innen: 0.4,
  aussen: 0.97,
};

export interface LogPolarBild {
  /** Zeilenweise, Index = ring * nWinkel + winkel. */
  daten: Float64Array;
  nWinkel: number;
  nRadius: number;
}

function abtasten(
  gray: Uint8Array,
  breite: number,
  hoehe: number,
  x: number,
  y: number,
): number {
  // Bilinear. Außerhalb des Bildes gibt es nichts, also null -- der
  // Ringmittelwert wird ohnehin gleich abgezogen.
  if (x < 0 || y < 0 || x > breite - 1 || y > hoehe - 1) return 0;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, breite - 1);
  const y1 = Math.min(y0 + 1, hoehe - 1);
  const fx = x - x0;
  const fy = y - y0;
  const a = gray[y0 * breite + x0]!;
  const b = gray[y0 * breite + x1]!;
  const c = gray[y1 * breite + x0]!;
  const d = gray[y1 * breite + x1]!;
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

/**
 * Bildet einen Kreisring um (cx, cy) auf ein Rechteck ab: waagerecht der
 * Winkel, senkrecht der Logarithmus des Radius.
 *
 * Warum logarithmisch: Eine Spiralanordnung ist selbstähnlich unter Drehung
 * und Streckung. In (Winkel, log Radius) wird daraus eine Verschiebung -- das
 * Muster also periodisch, und die Fouriertransformation kann es fassen. Die
 * Winkelfrequenz eines Gipfels ist dann unmittelbar die Zahl der Spiralarme:
 * m Arme kreuzen einen Kreis m-mal.
 *
 * Von jedem Ring wird der Mittelwert abgezogen. Damit verschwindet der
 * Helligkeitsverlauf von innen nach außen, der sonst das ganze Spektrum
 * überdeckt. In Winkelrichtung ist kein Fensterfilter nötig -- die Achse ist
 * von Natur aus periodisch, es gibt keine Kante, an der etwas ausfranst.
 * In Radiusrichtung dagegen schon, dort liegt ein Hann-Fenster.
 */
export function logPolar(
  gray: Uint8Array,
  breite: number,
  hoehe: number,
  cx: number,
  cy: number,
  optionen: LogPolarOptionen = LOGPOLAR_STANDARD,
): LogPolarBild {
  const { nWinkel, nRadius, innen, aussen } = optionen;
  const halb = Math.min(breite, hoehe) / 2;
  const rInnen = Math.max(1, innen * halb);
  const rAussen = Math.max(rInnen + 1, aussen * halb);
  const schritt = Math.log(rAussen / rInnen) / (nRadius - 1);

  const daten = new Float64Array(nWinkel * nRadius);

  for (let j = 0; j < nRadius; j++) {
    const r = rInnen * Math.exp(j * schritt);
    let summe = 0;
    const zeile = j * nWinkel;
    for (let i = 0; i < nWinkel; i++) {
      const t = (2 * Math.PI * i) / nWinkel;
      const wert = abtasten(gray, breite, hoehe, cx + r * Math.cos(t), cy + r * Math.sin(t));
      daten[zeile + i] = wert;
      summe += wert;
    }
    // Ringmittel abziehen und Hann-Fenster über den Radius legen.
    const mittel = summe / nWinkel;
    const fenster = 0.5 - 0.5 * Math.cos((2 * Math.PI * j) / (nRadius - 1));
    for (let i = 0; i < nWinkel; i++) {
      daten[zeile + i] = (daten[zeile + i]! - mittel) * fenster;
    }
  }

  return { daten, nWinkel, nRadius };
}

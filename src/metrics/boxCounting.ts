import type { Frame, Metric, Result } from './types.ts';
import { leastSquares } from './regression.ts';
import { chooseThreshold } from './threshold.ts';

export interface BoxCountingOptions {
  /** Kleinste Kantenlaenge der Zaehlkaestchen in Pixeln. Zweierpotenz, >= 2. */
  minBox: number;
  /** Groesste Kantenlaenge. Zweierpotenz, >= 8 * minBox fuer fuenf Skalen. */
  maxBox: number;
  /**
   * Untergrenze des Schwellwerts, damit Sensorrauschen keine Kante wird.
   * Der Sobel-Betrag ist durch 4 geteilt, 8 entspricht also einem Sprung von
   * rund 32 Graustufen ueber zwei Pixel. Bildrauschen eines Handysensors bei
   * Tageslicht bleibt darunter, eine Blattkante nicht.
   */
  thresholdFloor: number;
}

/**
 * Skalenbereich 2..32 Pixel, also fuenf Skalen -- das Minimum aus der
 * Projektbeschreibung, und zugleich das Optimum aus der Kalibrierung.
 *
 * Nach unten: bei einem Pixel Kaestchenbreite zaehlt das Verfahren Pixel statt
 * Struktur; weisses Rauschen misst dann 1,79 statt 2,0.
 * Nach oben: Kaestchen ab 64 Pixeln erfassen bei 512 Pixeln Bildbreite nur noch
 * die Umrisse des Motivs, nicht seine Textur. Die Koch-Kurve faellt dadurch von
 * 1,24 auf 1,21, und der Wert reagiert staerker auf Verwackeln.
 * Gemessene Abweichung der Referenzbilder in diesem Bereich: hoechstens 0,025.
 */
export const DEFAULT_OPTIONS: BoxCountingOptions = {
  minBox: 2,
  maxBox: 32,
  thresholdFloor: 8,
};

/** Groesste Zweierpotenz <= n. */
function floorPow2(n: number): number {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Weicher Uebergang von 0 (bei a) auf 1 (bei b). */
function ramp(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Die vier Gitterlagen, die sich um eine halbe Kaestchenbreite unterscheiden. */
const OFFSETS: ReadonlyArray<readonly [0 | 1, 0 | 1]> = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];

/**
 * Zaehlt, wie viele Kaestchen belegt waeren, wenn je vier Nachbarzellen zu
 * einer verodert werden. `ox`/`oy` verschieben das Gitter um eine Elternzelle,
 * also um genau eine halbe Kaestchenbreite der neuen Ebene. Am rechten und
 * unteren Rand wird auf die letzte Zelle geklemmt, damit alle Lagen gleich
 * viele Kaestchen haben und die Zaehlungen vergleichbar bleiben.
 */
function countCoarse(src: Uint8Array, dim: number, ox: 0 | 1, oy: 0 | 1): number {
  const od = dim >> 1;
  const last = dim - 1;
  let count = 0;
  for (let y = 0; y < od; y++) {
    const r0 = Math.min(2 * y + oy, last) * dim;
    const r1 = Math.min(2 * y + oy + 1, last) * dim;
    for (let x = 0; x < od; x++) {
      const c0 = Math.min(2 * x + ox, last);
      const c1 = Math.min(2 * x + ox + 1, last);
      if ((src[r0 + c0]! | src[r0 + c1]! | src[r1 + c0]! | src[r1 + c1]!) !== 0) count++;
    }
  }
  return count;
}

/** Wie countCoarse, aber baut die neue Ebene auch auf. */
function buildCoarse(src: Uint8Array, dim: number, ox: 0 | 1, oy: 0 | 1): Uint8Array {
  const od = dim >> 1;
  const last = dim - 1;
  const out = new Uint8Array(od * od);
  for (let y = 0; y < od; y++) {
    const r0 = Math.min(2 * y + oy, last) * dim;
    const r1 = Math.min(2 * y + oy + 1, last) * dim;
    for (let x = 0; x < od; x++) {
      const c0 = Math.min(2 * x + ox, last);
      const c1 = Math.min(2 * x + ox + 1, last);
      out[y * od + x] = (src[r0 + c0]! | src[r0 + c1]! | src[r1 + c0]! | src[r1 + c1]!) !== 0 ? 1 : 0;
    }
  }
  return out;
}

export interface BoxCountingRaw {
  /** Kaestchenlaengen in Pixeln, aufsteigend. */
  scales: number[];
  /** Belegte Kaestchen je Skala. */
  counts: number[];
  slope: number;
  r2: number;
  threshold: number;
  density: number;
  meanMagnitude: number;
  peakMagnitude: number;
  /** Kantenlaenge des ausgewerteten quadratischen Ausschnitts. */
  side: number;
  saturated: boolean;
}

/**
 * Kaestchenzaehlung ueber eine Belegungspyramide.
 *
 * Statt das Bild fuer jede Skala neu abzutasten, wird die Belegung einmal auf
 * der feinsten Skala gebildet und danach paarweise verodert. Das kostet
 * O(S^2) einmal statt O(S^2) je Skala und ist der Grund, warum das bei 30 fps
 * ueberhaupt geht.
 */
export function boxCount(
  frame: Frame,
  options: BoxCountingOptions = DEFAULT_OPTIONS,
): BoxCountingRaw {
  const { minBox, maxBox, thresholdFloor } = options;
  const side = floorPow2(Math.min(frame.width, frame.height));

  // Mittiger quadratischer Ausschnitt. Bei 512x512 vom Rechenpfad ist das
  // der Normalfall und kostet nichts.
  let mag: Uint8Array;
  if (side === frame.width && side === frame.height) {
    mag = frame.edges;
  } else {
    const ox = (frame.width - side) >> 1;
    const oy = (frame.height - side) >> 1;
    mag = new Uint8Array(side * side);
    for (let y = 0; y < side; y++) {
      mag.set(frame.edges.subarray((oy + y) * frame.width + ox, (oy + y) * frame.width + ox + side), y * side);
    }
  }

  const { threshold, density, meanMagnitude, peakMagnitude } = chooseThreshold(mag, thresholdFloor);

  // Binaerbild auf Pixelebene. Von hier aus wird nur noch verodert.
  let grid: Uint8Array = new Uint8Array(side * side);
  for (let i = 0; i < grid.length; i++) grid[i] = mag[i]! >= threshold ? 1 : 0;

  const scales: number[] = [];
  const counts: number[] = [];
  let dim = side;
  let box = 1;

  while (box < maxBox) {
    const parent = grid;
    const parentDim = dim;
    box *= 2;
    dim = parentDim >> 1;

    // Die Kaestchenzahl ist als kleinste Ueberdeckung der Menge definiert, nicht
    // als die eines beliebig gelegten Gitters. Ohne diese Minimierung haengt der
    // Messwert davon ab, wo das Raster gerade steht: bei einem rasterparallelen
    // Motiv wandert die Dimension um 0,13, sobald die Hand um ein Pixel abweicht.
    // Weitergereicht wird die Lage, die gewonnen hat -- so bleibt das Gitter auch
    // ueber die groberen Ebenen an der Struktur ausgerichtet.
    let bestX: 0 | 1 = 0;
    let bestY: 0 | 1 = 0;
    let bestCount = Infinity;
    for (const [ox, oy] of OFFSETS) {
      const count = countCoarse(parent, parentDim, ox, oy);
      if (count < bestCount) {
        bestCount = count;
        bestX = ox;
        bestY = oy;
      }
    }
    grid = buildCoarse(parent, parentDim, bestX, bestY);

    if (box >= minBox) {
      scales.push(box);
      counts.push(bestCount);
    }
  }

  // Leere Skalen tragen nichts bei; log(0) ist kein Messwert.
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < scales.length; i++) {
    if (counts[i]! > 0) {
      xs.push(-Math.log(scales[i]!));
      ys.push(Math.log(counts[i]!));
    }
  }
  const fit = leastSquares(xs, ys);

  const finestBoxes = (side / minBox) * (side / minBox);
  const saturated = counts.length > 0 && counts[0]! >= finestBoxes;

  return {
    scales,
    counts,
    slope: fit.slope,
    r2: fit.r2,
    threshold,
    density,
    meanMagnitude,
    peakMagnitude,
    side,
    saturated,
  };
}

/**
 * Drei Wörter zur Zahl. Die Grenzen stammen aus der Kalibriertabelle: gerade
 * Linie 1,0, Backsteinwand 1,2 bis 1,5, Baum 1,6 bis 1,8, Rauschen 1,92.
 */
function einordnung(d: number): string {
  if (d <= 0) return '';
  if (d < 1.1) return 'fast glatt';
  if (d < 1.35) return 'schwach gegliedert';
  if (d < 1.6) return 'deutlich verzweigt';
  if (d < 1.85) return 'stark verzweigt';
  return 'flächenfüllend';
}

export function createBoxCountingMetric(options: BoxCountingOptions = DEFAULT_OPTIONS): Metric {
  return {
    id: 'box-counting',
    label: 'Fraktale Dimension',
    skala: { min: 1, max: 2, links: 'Linie', rechts: 'Fläche' },

    phaenomen: [
      "Manche Formen werden nicht einfacher, wenn man näher herangeht. Eine Küstenlinie ist aus zehn Kilometern Höhe zerklüftet und aus zehn Metern auch. Ein Farnwedel besteht aus Fiedern, die aussehen wie kleine Farnwedel.",
      "Für solche Formen reicht die gewohnte Vorstellung von Dimension nicht. Ein Strich ist eindimensional, eine Fläche zweidimensional — aber ein Farnwedel liegt dazwischen: Er ist mehr als ein Strich und weniger als eine Fläche. Diese Zwischenzahl heißt fraktale Dimension. Je höher sie ist, desto dichter füllt die Form den Raum aus, in dem sie liegt.",
      "Eine gerade Linie ergibt 1,0. Eine Backsteinwand etwa 1,2. Ein Farnwedel ungefähr 1,7, eine kahle Baumkrone im Winter 1,8. Bei 2,0 ist nichts mehr zu erkennen — dann füllt die Struktur die Fläche vollständig, und das ist meistens Rauschen und keine Ordnung.",
    ],

    verfahren: [
      "Die App sucht zuerst die Kanten im Bild: alle Stellen, an denen die Helligkeit springt. Über diese Kanten legt sie ein Gitter und zählt, in wie vielen Kästchen überhaupt eine Kante liegt. Dann halbiert sie die Kästchenbreite und zählt noch einmal — fünfmal hintereinander.",
      "Bei einer glatten Linie verdoppelt sich die Zahl mit jeder Halbierung. Bei einer vollen Fläche vervierfacht sie sich. Alles dazwischen ergibt die Zwischenzahl.",
      "Was dabei gezählt wurde, macht der Knopf „Kanten zeigen“ sichtbar: Die grün eingezeichneten Punkte sind genau die, die in die Zählung eingegangen sind.",
    ],

    run(frame: Frame): Result {
      const raw = boxCount(frame, options);
      const usable = raw.counts.filter((c) => c > 0).length;
      const caveats: string[] = [];

      if (raw.density === 0) {
        caveats.push('keine Kanten gefunden');
      } else {
        if (raw.density < 0.01) caveats.push('zu wenig Kontrast');
        if (raw.peakMagnitude < 25) caveats.push('Motiv unscharf – Abstand ändern');
        if (raw.saturated) caveats.push('Kantenbild gesättigt – zu nah oder zu unruhig');
        if (raw.density > 0.3) caveats.push('sehr viele Kanten – vermutlich Rauschen');
        if (raw.r2 < 0.98) caveats.push('Skalen folgen keiner Geraden');
        if (usable < 5) caveats.push('zu wenige nutzbare Skalen');
      }

      const detail: Record<string, number> = {
        r2: raw.r2,
        density: raw.density,
        threshold: raw.threshold,
        meanMagnitude: raw.meanMagnitude,
        peakMagnitude: raw.peakMagnitude,
        scales: usable,
        side: raw.side,
      };
      for (let i = 0; i < raw.scales.length; i++) detail[`boxes${raw.scales[i]}`] = raw.counts[i]!;

      const wert = raw.density === 0 ? 0 : raw.slope;
      return { value: wert, deutung: einordnung(wert), detail, caveats };
    },

    confidence(r: Result): number {
      const density = r.detail['density'] ?? 0;
      if (density === 0) return 0;
      // Ausserhalb dieses Bandes ist kein Bildinhalt denkbar, der den Wert
      // erklaert. Dann liegt es am Verfahren, nicht am Motiv.
      if (r.value < 0.5 || r.value > 2.15) return 0;

      const cDensity = ramp(0.004, 0.02, density);
      const cOver = 1 - ramp(0.3, 0.55, density);
      const cSharp = ramp(15, 40, r.detail['peakMagnitude'] ?? 0);
      const cFit = ramp(0.97, 0.995, r.detail['r2'] ?? 0);
      const cScales = clamp01((r.detail['scales'] ?? 0) / 5);

      return clamp01(cDensity * cOver * cSharp * cFit * cScales);
    },

    explain(r: Result): string {
      const d = r.value;
      let band: string;
      if (d < 1.1) band = 'nahezu glatte Linien, kaum Verästelung';
      else if (d < 1.35) band = 'schwach gegliedert, etwa Mauerwerk oder Blattadern';
      else if (d < 1.6) band = 'deutlich verzweigt';
      else if (d < 1.85) band = 'stark verzweigt, typisch für Farn und Baumkronen';
      else band = 'flächenfüllend – oft Rauschen, nicht Struktur';

      return (
        'Box-Counting: Über das Kantenbild wird ein Gitter gelegt und gezählt, ' +
        'in wie vielen Kästchen eine Kante liegt. Das wiederholt sich mit ' +
        'halbierter Kästchenbreite. Wächst die Zahl mit jeder Halbierung um den ' +
        'Faktor 2^D, ist D die fraktale Dimension. Sie liegt zwischen 1 (Linie) ' +
        `und 2 (Fläche). Gemessen: ${d.toFixed(2)} – ${band}. ` +
        'Der Wert beschreibt eine Tendenz des Ausschnitts, keine Eigenschaft der Pflanze.'
      );
    },
  };
}

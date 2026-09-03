export interface ThresholdChoice {
  /** Pixel ab diesem Wert gelten als Kante. */
  threshold: number;
  /** Anteil der Pixel, die als Kante gelten, 0..1. */
  density: number;
  /** Mittlerer Kantenbetrag ueber das ganze Bild. */
  meanMagnitude: number;
  /**
   * 99,5-Perzentil des Kantenbetrags: wie scharf die schaerfste Kante im Bild
   * ist. Der Mittelwert taugt dafuer nicht -- ein Ast vor hellem Himmel hat
   * gestochen scharfe Kanten und trotzdem einen winzigen Mittelwert, weil fast
   * das ganze Bild leer ist. Ein unscharfes Bild dagegen hat nirgends einen
   * steilen Sprung.
   */
  peakMagnitude: number;
}

/**
 * Schwellwert nach Otsu, mit einer festen Untergrenze.
 *
 * Quelle: N. Otsu, "A Threshold Selection Method from Gray-Level Histograms",
 * IEEE Trans. Syst. Man Cybern. 9(1), 1979. Das Verfahren sucht den Schnitt,
 * der die Varianz zwischen den beiden entstehenden Klassen maximiert.
 *
 * Warum nicht einfach ein festes Perzentil, das waere stabiler? Weil die
 * Kantendichte selbst Information traegt. Haelt man sie fest, misst jedes Motiv
 * dieselbe Anordnung von acht Prozent der Pixel, und Backsteinwand, Farn und
 * Rauschen ruecken auf denselben Wert zusammen. Otsu laesst die Dichte mit dem
 * Motiv wandern und trennt trotzdem Kante von Flaeche.
 *
 * Die Untergrenze `floor` faengt den Fall ab, den Otsu von sich aus falsch
 * loest: auf einer glatten weissen Wand gibt es keine zwei Klassen, und das
 * Verfahren wuerde Sensorrauschen zu Kanten befoerdern. Unterhalb der Grenze
 * bleibt das Bild leer, die Konfidenz faellt auf null.
 */
export function chooseThreshold(magnitude: Uint8Array, floor: number): ThresholdChoice {
  const total = magnitude.length;
  if (total === 0) return { threshold: 255, density: 0, meanMagnitude: 0, peakMagnitude: 0 };

  const hist = new Uint32Array(256);
  let sum = 0;
  for (let i = 0; i < total; i++) {
    const v = magnitude[i]!;
    hist[v] = hist[v]! + 1;
    sum += v;
  }

  // Otsu: einmal durch die Bins, dabei Klassengewicht und -mittel fortschreiben.
  let wB = 0;
  let sumB = 0;
  let bestLo = 0;
  let bestHi = 0;
  let bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    // Bei einem streng zweigipfligen Histogramm -- etwa einer binaeren
    // Vorlage -- ist die Trennguete zwischen den Gipfeln ueberall gleich gut.
    // Dann liegt der Schnitt in der Mitte des Plateaus und nicht an dessen
    // Rand, wo er den unteren Gipfel streifen wuerde.
    if (between > bestVar) {
      bestVar = between;
      bestLo = t;
      bestHi = t;
    } else if (between === bestVar) {
      bestHi = t;
    }
  }

  // Otsu liefert den letzten Bin der unteren Klasse; Kante beginnt darueber.
  const threshold = Math.max(Math.floor((bestLo + bestHi) / 2) + 1, floor, 1);

  let count = 0;
  for (let b = threshold; b <= 255; b++) count += hist[b]!;

  const rank = total * 0.995;
  let seen = 0;
  let peak = 0;
  for (let b = 0; b < 256; b++) {
    seen += hist[b]!;
    if (seen >= rank) {
      peak = b;
      break;
    }
  }

  return { threshold, density: count / total, meanMagnitude: sum / total, peakMagnitude: peak };
}

/**
 * Schnelle Fouriertransformation, Radix 2, an Ort und Stelle.
 *
 * Quelle: Cooley/Tukey, "An Algorithm for the Machine Calculation of Complex
 * Fourier Series", Math. Comp. 19 (1965). Umgesetzt als iterative Fassung mit
 * Bitumkehr, wie in Press et al., Numerical Recipes, Kap. 12.2.
 *
 * Eigene Umsetzung statt Bibliothek: eine FFT sind achtzig Zeilen, und M2 wie
 * M4 brauchen sie beide. Eine Abhängigkeit dafür wäre nicht zu begründen.
 */

/** Wirft, wenn n keine Zweierpotenz ist. */
function pruefeLaenge(n: number): void {
  if (n < 2 || (n & (n - 1)) !== 0) {
    throw new Error(`FFT braucht eine Zweierpotenz, bekam ${n}.`);
  }
}

/**
 * Transformiert `re`/`im` an Ort und Stelle. `invers` teilt zusätzlich durch n,
 * sodass fft(fft(x, false), true) wieder x ergibt.
 */
export function fft(re: Float64Array, im: Float64Array, invers = false): void {
  const n = re.length;
  pruefeLaenge(n);
  if (im.length !== n) throw new Error('Real- und Imaginärteil verschieden lang.');

  // Bitumkehr: die Eingabe in die Reihenfolge bringen, in der die Schmetterlinge
  // ohne Zwischenspeicher arbeiten können.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }

  const vorzeichen = invers ? 1 : -1;
  for (let laenge = 2; laenge <= n; laenge <<= 1) {
    const winkel = (vorzeichen * 2 * Math.PI) / laenge;
    const wr = Math.cos(winkel);
    const wi = Math.sin(winkel);
    for (let i = 0; i < n; i += laenge) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < laenge / 2; j++) {
        const a = i + j;
        const b = a + laenge / 2;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }

  if (invers) {
    for (let i = 0; i < n; i++) {
      re[i] = re[i]! / n;
      im[i] = im[i]! / n;
    }
  }
}

export interface Spektrum2D {
  re: Float64Array;
  im: Float64Array;
  breite: number;
  hoehe: number;
}

/**
 * Zweidimensionale FFT: erst alle Zeilen, dann alle Spalten. Beide Kanten
 * müssen Zweierpotenzen sein.
 *
 * `daten` liegt zeilenweise (Index = y * breite + x) und wird nicht verändert.
 */
export function fft2(daten: Float64Array, breite: number, hoehe: number): Spektrum2D {
  pruefeLaenge(breite);
  pruefeLaenge(hoehe);
  if (daten.length !== breite * hoehe) throw new Error('Datenlänge passt nicht zu Breite × Höhe.');

  const re = Float64Array.from(daten);
  const im = new Float64Array(breite * hoehe);

  const zeileRe = new Float64Array(breite);
  const zeileIm = new Float64Array(breite);
  for (let y = 0; y < hoehe; y++) {
    const start = y * breite;
    zeileRe.set(re.subarray(start, start + breite));
    zeileIm.set(im.subarray(start, start + breite));
    fft(zeileRe, zeileIm);
    re.set(zeileRe, start);
    im.set(zeileIm, start);
  }

  const spalteRe = new Float64Array(hoehe);
  const spalteIm = new Float64Array(hoehe);
  for (let x = 0; x < breite; x++) {
    for (let y = 0; y < hoehe; y++) {
      spalteRe[y] = re[y * breite + x]!;
      spalteIm[y] = im[y * breite + x]!;
    }
    fft(spalteRe, spalteIm);
    for (let y = 0; y < hoehe; y++) {
      re[y * breite + x] = spalteRe[y]!;
      im[y * breite + x] = spalteIm[y]!;
    }
  }

  return { re, im, breite, hoehe };
}

/** Betrag eines Koeffizienten. Negative Indizes zählen vom Ende her. */
export function betrag(s: Spektrum2D, kx: number, ky: number): number {
  const x = ((kx % s.breite) + s.breite) % s.breite;
  const y = ((ky % s.hoehe) + s.hoehe) % s.hoehe;
  const i = y * s.breite + x;
  return Math.hypot(s.re[i]!, s.im[i]!);
}

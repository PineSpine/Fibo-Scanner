/**
 * Referenzbilder mit bekannten Sollwerten. Sie werden erzeugt statt als PNG
 * eingecheckt: so ist der Sollwert nicht nur behauptet, sondern aus der
 * Konstruktion ablesbar, und es gibt keine JPEG-Artefakte in der Kalibrierung.
 * `npm run fixtures` schreibt sie zum Ansehen als PNG nach test/fixtures/.
 */

export interface GrayImage {
  data: Uint8Array;
  width: number;
  height: number;
}

function blank(size: number): GrayImage {
  return { data: new Uint8Array(size * size), width: size, height: size };
}

/**
 * Diskretes Sierpinski-Dreieck ueber (x AND y) === 0 -- das ist das Pascalsche
 * Dreieck modulo 2. Bei Seitenlaenge 2^n hat die Menge genau 3^n Punkte, und
 * ein Kaestchen der Kantenlaenge 2^k ist genau dann belegt, wenn seine
 * Gitterkoordinaten dieselbe Bedingung erfuellen. Die Kaestchenzahl ist damit
 * exakt 3^(n-k), die Dimension exakt log3/log2 = 1,58496 -- ohne Rasterfehler.
 */
export function sierpinski(size = 512): GrayImage {
  const img = blank(size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x & y) === 0) img.data[y * size + x] = 255;
    }
  }
  return img;
}

function line(img: GrayImage, x0: number, y0: number, x1: number, y1: number): void {
  // Bresenham. Bei den kurzen Segmenten der Koch-Kurve reicht Rundung.
  let x = Math.round(x0);
  let y = Math.round(y0);
  const ex = Math.round(x1);
  const ey = Math.round(y1);
  const dx = Math.abs(ex - x);
  const dy = -Math.abs(ey - y);
  const sx = x < ex ? 1 : -1;
  const sy = y < ey ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (x >= 0 && x < img.width && y >= 0 && y < img.height) img.data[y * img.width + x] = 255;
    if (x === ex && y === ey) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function kochSegment(
  img: GrayImage,
  ax: number, ay: number, bx: number, by: number,
  depth: number,
): void {
  if (depth === 0) {
    line(img, ax, ay, bx, by);
    return;
  }
  const dx = (bx - ax) / 3;
  const dy = (by - ay) / 3;
  const px = ax + dx;
  const py = ay + dy;
  const qx = bx - dx;
  const qy = by - dy;
  // Spitze des aufgesetzten gleichseitigen Dreiecks: Mitte zwischen p und q,
  // senkrecht um die halbe Hoehe versetzt (Hoehe = Seite * sqrt(3)/2).
  const mx = (px + qx) / 2;
  const my = (py + qy) / 2;
  const tx = mx + dy * (Math.sqrt(3) / 2);
  const ty = my - dx * (Math.sqrt(3) / 2);
  kochSegment(img, ax, ay, px, py, depth - 1);
  kochSegment(img, px, py, tx, ty, depth - 1);
  kochSegment(img, tx, ty, qx, qy, depth - 1);
  kochSegment(img, qx, qy, bx, by, depth - 1);
}

/**
 * Koch-Schneeflocke, drei Kurven ueber den Seiten eines gleichseitigen
 * Dreiecks. Dimension log4/log3 = 1,26186. Anders als beim Sierpinski-Bild
 * passt die Dreiteilung nicht ins Zweierraster des Zaehlgitters, der Messwert
 * bleibt daher etwas unter dem theoretischen -- genau darum steht die Kurve
 * hier: sie prueft den Normalfall, nicht den Sonderfall.
 */
export function koch(size = 512, depth = 6): GrayImage {
  const img = blank(size);
  const r = size * 0.46;
  const cx = size / 2;
  const cy = size / 2;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  for (let i = 0; i < 3; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[(i + 1) % 3]!;
    kochSegment(img, ax, ay, bx, by, depth);
  }
  return img;
}

/** Deterministischer PRNG, damit der Testwert nicht je Lauf wandert. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Weisses Rauschen als binaeres Bild mit halber Dichte. Der Traeger fuellt die
 * Flaeche, die Dimension geht gegen 2. Auf der feinsten Skala bleibt ein Rest:
 * ein Kaestchen von 2x2 Pixeln ist mit 6,25 Prozent Wahrscheinlichkeit leer.
 * Deshalb misst das Verfahren 1,99 statt 2,00 -- das ist richtig so.
 */
export function whiteNoise(size = 512, seed = 20260902): GrayImage {
  const img = blank(size);
  const rnd = mulberry32(seed);
  for (let i = 0; i < img.data.length; i++) img.data[i] = rnd() < 0.5 ? 255 : 0;
  return img;
}

/** Leere Flaeche. Kein Kantenpixel, kein Messwert, Konfidenz 0. */
export function emptyPlane(size = 512): GrayImage {
  return blank(size);
}

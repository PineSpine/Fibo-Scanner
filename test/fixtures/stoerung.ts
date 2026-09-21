import type { GrayImage } from './images.ts';

/**
 * Störungen, wie sie ein gerechnetes Bild draußen erleidet.
 *
 * Ein gerechneter Blütenstand ist genau zentriert und rauschfrei. Ein
 * fotografierter ist beides nie -- und genau daran ist die Spiralenzählung
 * gescheitert: Getestet wurde nur der Idealfall, draußen trat er nie ein.
 */

/**
 * Verschiebt den Bildinhalt um (dx, dy) Pixel. Die frei werdende Fläche wird
 * mit dem mittleren Grauwert gefüllt -- ein harter schwarzer Rand wäre selbst
 * eine Struktur, die das Verfahren sehen würde.
 */
export function verschoben(bild: GrayImage, dx: number, dy: number): GrayImage {
  const { width: w, height: h, data } = bild;
  let summe = 0;
  for (const v of data) summe += v;
  const raus = new Uint8Array(data.length).fill(Math.round(summe / data.length));
  for (let y = 0; y < h; y++) {
    const sy = y - dy;
    if (sy < 0 || sy >= h) continue;
    for (let x = 0; x < w; x++) {
      const sx = x - dx;
      if (sx >= 0 && sx < w) raus[y * w + x] = data[sy * w + sx]!;
    }
  }
  return { data: raus, width: w, height: h };
}

/**
 * Gleichverteiltes Rauschen von ±`staerke` Graustufen, reproduzierbar über die
 * Saat. 25 Graustufen entsprechen grob einem Telefonsensor bei trübem Licht.
 */
export function verrauscht(bild: GrayImage, staerke = 25, saat = 7): GrayImage {
  let a = saat;
  const raus = new Uint8Array(bild.data.length);
  for (let i = 0; i < raus.length; i++) {
    a = (a * 1103515245 + 12345) & 0x7fffffff;
    const r = ((a % 2001) / 1000 - 1) * staerke;
    raus[i] = Math.max(0, Math.min(255, Math.round(bild.data[i]! + r)));
  }
  return { data: raus, width: bild.width, height: bild.height };
}

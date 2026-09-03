import type { GrayImage } from './images.ts';

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
 * Fraktionale Brownsche Flaeche ueber Diamond-Square.
 *
 * `hurst` steuert die Rauigkeit: 1 ergibt weiche Wolken, 0 eine zerklueftete
 * Flaeche. Natuerliche Szenen liegen meist bei etwa 0,5 -- das entspricht dem
 * Leistungsspektrum mit Abfall beta ungefaehr 2, das in M2 gemessen wird.
 *
 * Quelle des Verfahrens: Fournier, Fussell, Carpenter, "Computer Rendering of
 * Stochastic Models", CACM 25(6), 1982.
 */
export function fractalSurface(size = 512, hurst = 0.5, seed = 1): GrayImage {
  const n = size; // Zweierpotenz erwartet
  const h = new Float32Array((n + 1) * (n + 1));
  const rnd = mulberry32(seed);
  const idx = (x: number, y: number) => y * (n + 1) + x;
  const jitter = (amp: number) => (rnd() * 2 - 1) * amp;

  h[idx(0, 0)] = jitter(1);
  h[idx(n, 0)] = jitter(1);
  h[idx(0, n)] = jitter(1);
  h[idx(n, n)] = jitter(1);

  let step = n;
  let amp = 1;
  while (step > 1) {
    const half = step >> 1;
    for (let y = half; y < n; y += step) {
      for (let x = half; x < n; x += step) {
        const a = h[idx(x - half, y - half)]!;
        const b = h[idx(x + half, y - half)]!;
        const c = h[idx(x - half, y + half)]!;
        const d = h[idx(x + half, y + half)]!;
        h[idx(x, y)] = (a + b + c + d) / 4 + jitter(amp);
      }
    }
    for (let y = 0; y <= n; y += half) {
      for (let x = (y / half) % 2 === 0 ? half : 0; x <= n; x += step) {
        let sum = 0;
        let cnt = 0;
        if (x >= half) { sum += h[idx(x - half, y)]!; cnt++; }
        if (x + half <= n) { sum += h[idx(x + half, y)]!; cnt++; }
        if (y >= half) { sum += h[idx(x, y - half)]!; cnt++; }
        if (y + half <= n) { sum += h[idx(x, y + half)]!; cnt++; }
        h[idx(x, y)] = sum / cnt + jitter(amp);
      }
    }
    step = half;
    amp *= Math.pow(2, -hurst);
  }

  let lo = Infinity;
  let hi = -Infinity;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = h[idx(x, y)]!;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  const span = hi - lo || 1;
  const data = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      data[y * n + x] = Math.round(((h[idx(x, y)]! - lo) / span) * 255);
    }
  }
  return { data, width: n, height: n };
}

/** Backsteinwand im Halbverband: gerade Fugen, sonst nichts. */
export function brickWall(size = 512, courseHeight = 32, brickWidth = 72): GrayImage {
  const data = new Uint8Array(size * size).fill(190);
  for (let y = 0; y < size; y++) {
    const course = Math.floor(y / courseHeight);
    const offset = (course % 2) * (brickWidth / 2);
    const inJoint = y % courseHeight < 1;
    for (let x = 0; x < size; x++) {
      const u = (x + offset) % brickWidth;
      if (inJoint || u < 1) data[y * size + x] = 90;
    }
  }
  return { data, width: size, height: size };
}

/** Glatte Flaeche mit sanftem Helligkeitsverlauf. Kein Motiv, nur Wand. */
export function flatWall(size = 512): GrayImage {
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      data[y * size + x] = Math.round(150 + 40 * (x / size) + 20 * (y / size));
    }
  }
  return { data, width: size, height: size };
}

/**
 * Rekursiver Verzweigungsbaum als Strichzeichnung.
 *
 * Das ist das brauchbarste synthetische Gegenstueck zu Farnwedel und
 * Winterkrone: eine duenne, sich selbst wiederholende Verzweigung statt einer
 * flaechigen Rauschstruktur. Bei Verzweigungsverhaeltnis r und zwei Aesten je
 * Gabel liegt die Dimension der Astspitzen bei log2/log(1/r); der gezeichnete
 * Baum liegt darueber, weil die Aeste selbst mitzaehlen.
 */
export function branchingTree(
  size = 512,
  depth = 11,
  ratio = 0.72,
  spread = 0.42,
): GrayImage {
  const data = new Uint8Array(size * size).fill(235);

  const plot = (x: number, y: number, v: number): void => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || xi >= size || yi < 0 || yi >= size) return;
    const i = yi * size + xi;
    if (v < data[i]!) data[i] = v;
  };

  const stroke = (x0: number, y0: number, x1: number, y1: number, ink: number): void => {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      plot(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, ink);
    }
  };

  const grow = (x: number, y: number, angle: number, len: number, d: number): void => {
    const nx = x + Math.cos(angle) * len;
    const ny = y + Math.sin(angle) * len;
    stroke(x, y, nx, ny, 40);
    if (d === 0) return;
    grow(nx, ny, angle - spread, len * ratio, d - 1);
    grow(nx, ny, angle + spread, len * ratio, d - 1);
  };

  grow(size / 2, size * 0.98, -Math.PI / 2, size * 0.2, depth);
  return { data, width: size, height: size };
}

/** Weichzeichner 3x3, ersetzt naeherungsweise die Unschaerfe der Optik. */
export function blur(img: GrayImage): GrayImage {
  const { data, width, height } = img;
  const out = new Uint8Array(data.length);
  const at = (x: number, y: number) =>
    data[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))]!;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += at(x + dx, y + dy);
      out[y * width + x] = Math.round(s / 9);
    }
  }
  return { data: out, width, height };
}

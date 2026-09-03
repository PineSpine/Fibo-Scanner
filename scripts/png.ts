/**
 * Kleiner PNG-Leser und -Schreiber.
 *
 * Nur so viel, wie das Projekt braucht: Lesen von Farbtyp 6 (RGBA) und 0
 * (Graustufen), Schreiben von Farbtyp 0, 4 und 6 -- jeweils Bittiefe 8, ohne
 * Interlacing. Eine Bildbibliothek für Zuschneiden und Kanaltausch wäre
 * unverhältnismäßig; zlib bringt Node schon mit.
 */
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, payload: Uint8Array): Buffer {
  const kopf = Buffer.alloc(4);
  kopf.writeUInt32BE(payload.length, 0);
  const koerper = Buffer.concat([Buffer.from(type, 'latin1'), Buffer.from(payload)]);
  const pruef = Buffer.alloc(4);
  pruef.writeUInt32BE(crc32(koerper), 0);
  return Buffer.concat([kopf, koerper, pruef]);
}

/** Paeth-Vorhersage nach PNG-Spezifikation, Abschnitt 9.4. */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

export interface Bild {
  breite: number;
  hoehe: number;
  /** Immer vier Kanäle, auch wenn die Datei weniger hatte. */
  daten: Uint8Array;
}

/** Liest ein PNG mit Bittiefe 8, Farbtyp 0, 4 oder 6, ohne Interlacing. */
export function lesePng(datei: string): Bild {
  const b = readFileSync(datei);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${datei} ist kein PNG.`);

  let breite = 0;
  let hoehe = 0;
  let farbtyp = 6;
  const idat: Buffer[] = [];
  let i = 8;
  while (i < b.length) {
    const laenge = b.readUInt32BE(i);
    const typ = b.toString('latin1', i + 4, i + 8);
    const nutz = b.subarray(i + 8, i + 8 + laenge);
    if (typ === 'IHDR') {
      breite = nutz.readUInt32BE(0);
      hoehe = nutz.readUInt32BE(4);
      farbtyp = nutz[9]!;
      if (nutz[8] !== 8 || nutz[12] !== 0) throw new Error('Erwartet Bittiefe 8 ohne Interlacing.');
      if (![0, 4, 6].includes(farbtyp)) throw new Error(`Farbtyp ${farbtyp} wird nicht gelesen.`);
    } else if (typ === 'IDAT') {
      idat.push(Buffer.from(nutz));
    } else if (typ === 'IEND') {
      break;
    }
    i += 12 + laenge;
  }

  const kanaele = farbtyp === 6 ? 4 : farbtyp === 4 ? 2 : 1;
  const roh = inflateSync(Buffer.concat(idat));
  const zeile = breite * kanaele;
  const flach = new Uint8Array(hoehe * zeile);

  for (let y = 0; y < hoehe; y++) {
    const filter = roh[y * (zeile + 1)]!;
    const quelle = y * (zeile + 1) + 1;
    const ziel = y * zeile;
    const oben = ziel - zeile;
    for (let x = 0; x < zeile; x++) {
      const wert = roh[quelle + x]!;
      const a = x >= kanaele ? flach[ziel + x - kanaele]! : 0;
      const o = y > 0 ? flach[oben + x]! : 0;
      const ol = y > 0 && x >= kanaele ? flach[oben + x - kanaele]! : 0;
      let vorhersage = 0;
      if (filter === 1) vorhersage = a;
      else if (filter === 2) vorhersage = o;
      else if (filter === 3) vorhersage = (a + o) >> 1;
      else if (filter === 4) vorhersage = paeth(a, o, ol);
      else if (filter !== 0) throw new Error(`Unbekannter Zeilenfilter ${filter}.`);
      flach[ziel + x] = (wert + vorhersage) & 0xff;
    }
  }

  // Auf vier Kanäle bringen, damit der Rest sich nicht um Farbtypen kümmern muss.
  const daten = new Uint8Array(breite * hoehe * 4);
  for (let p = 0; p < breite * hoehe; p++) {
    if (kanaele === 4) {
      daten.set(flach.subarray(p * 4, p * 4 + 4), p * 4);
    } else if (kanaele === 2) {
      const g = flach[p * 2]!;
      daten.set([g, g, g, flach[p * 2 + 1]!], p * 4);
    } else {
      const g = flach[p]!;
      daten.set([g, g, g, 255], p * 4);
    }
  }
  return { breite, hoehe, daten };
}

/**
 * Schreibt ein PNG. `kanaele` bestimmt den Farbtyp: 1 Graustufen, 2 Graustufen
 * mit Alpha, 3 RGB, 4 RGBA.
 *
 * Je Zeile werden mehrere Filter probiert und der genommen, dessen Ergebnis die
 * kleinste Summe absoluter Abweichungen hat -- die übliche Heuristik, weil
 * kleine Zahlen sich besser packen lassen.
 */
export function schreibePng(datei: string, bild: Bild, kanaele: 1 | 2 | 3 | 4): number {
  const { breite, hoehe, daten } = bild;
  const zeile = breite * kanaele;
  const roh = Buffer.alloc(hoehe * (zeile + 1));
  const bild8 = new Uint8Array(hoehe * zeile);

  for (let p = 0; p < breite * hoehe; p++) {
    const r = daten[p * 4]!;
    const g = daten[p * 4 + 1]!;
    const b = daten[p * 4 + 2]!;
    const a = daten[p * 4 + 3]!;
    if (kanaele === 1) bild8[p] = r;
    else if (kanaele === 2) bild8.set([r, a], p * 2);
    else if (kanaele === 3) bild8.set([r, g, b], p * 3);
    else bild8.set([r, g, b, a], p * 4);
  }

  const versuch = new Uint8Array(zeile);
  for (let y = 0; y < hoehe; y++) {
    let besterFilter = 0;
    let besteSumme = Infinity;
    let beste: Uint8Array = new Uint8Array(zeile);
    for (const filter of [0, 1, 2, 3, 4]) {
      let summe = 0;
      for (let x = 0; x < zeile; x++) {
        const wert = bild8[y * zeile + x]!;
        const a = x >= kanaele ? bild8[y * zeile + x - kanaele]! : 0;
        const o = y > 0 ? bild8[(y - 1) * zeile + x]! : 0;
        const ol = y > 0 && x >= kanaele ? bild8[(y - 1) * zeile + x - kanaele]! : 0;
        let vorhersage = 0;
        if (filter === 1) vorhersage = a;
        else if (filter === 2) vorhersage = o;
        else if (filter === 3) vorhersage = (a + o) >> 1;
        else if (filter === 4) vorhersage = paeth(a, o, ol);
        const rest = (wert - vorhersage) & 0xff;
        versuch[x] = rest;
        summe += rest < 128 ? rest : 256 - rest;
      }
      if (summe < besteSumme) {
        besteSumme = summe;
        besterFilter = filter;
        beste = versuch.slice();
      }
    }
    roh[y * (zeile + 1)] = besterFilter;
    roh.set(beste, y * (zeile + 1) + 1);
  }

  const farbtyp = kanaele === 1 ? 0 : kanaele === 2 ? 4 : kanaele === 3 ? 2 : 6;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(breite, 0);
  ihdr.writeUInt32BE(hoehe, 4);
  ihdr[8] = 8;
  ihdr[9] = farbtyp;

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(roh, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
  writeFileSync(datei, png);
  return png.length;
}

/** Schneidet ein Rechteck heraus. */
export function schneide(bild: Bild, x0: number, y0: number, breite: number, hoehe: number): Bild {
  const daten = new Uint8Array(breite * hoehe * 4);
  for (let y = 0; y < hoehe; y++) {
    const quelle = ((y0 + y) * bild.breite + x0) * 4;
    daten.set(bild.daten.subarray(quelle, quelle + breite * 4), y * breite * 4);
  }
  return { breite, hoehe, daten };
}

/** Verkleinert durch Mittelung über Kästchen. Für Verkleinerungen genau genug. */
export function verkleinere(bild: Bild, kante: number): Bild {
  const daten = new Uint8Array(kante * kante * 4);
  const sx = bild.breite / kante;
  const sy = bild.hoehe / kante;
  for (let y = 0; y < kante; y++) {
    for (let x = 0; x < kante; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      const y0 = Math.floor(y * sy);
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
      const summe = [0, 0, 0, 0];
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * bild.breite + xx) * 4;
          for (let k = 0; k < 4; k++) summe[k]! += bild.daten[i + k]!;
          n++;
        }
      }
      const ziel = (y * kante + x) * 4;
      for (let k = 0; k < 4; k++) daten[ziel + k] = Math.round(summe[k]! / n);
    }
  }
  return { breite: kante, hoehe: kante, daten };
}

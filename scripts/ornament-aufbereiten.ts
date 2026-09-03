/**
 * Macht aus der freigestellten Federzeichnung die Maske, die die App lädt.
 *
 * Die Vorlage in docs/ ist ein RGBA-Bild: drei Farbkanäle plus Deckung. Im
 * Stylesheet dient sie aber nur als `mask-image` über einer Tintenfläche --
 * die Farbkanäle sieht nie jemand, allein der Alphakanal entscheidet, wo Tinte
 * steht. Drei Viertel der übertragenen Daten sind damit unsichtbar.
 *
 * Dieses Skript wirft sie weg und schreibt ein Graustufenbild mit Alphakanal
 * (PNG-Farbtyp 4), dessen Grauwert überall null ist. Das Ergebnis sieht exakt
 * gleich aus -- es ist keine verlustbehaftete Kompression, sondern das
 * Weglassen von Kanälen, die niemand liest.
 *
 * Aufruf: npm run ornament
 */
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

interface Rgba {
  breite: number;
  hoehe: number;
  daten: Uint8Array;
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

/** Liest ein PNG mit Farbtyp 6, Bittiefe 8, ohne Interlacing. Mehr braucht es nicht. */
function readPng(datei: string): Rgba {
  const b = readFileSync(datei);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${datei} ist kein PNG.`);

  let breite = 0;
  let hoehe = 0;
  const idat: Buffer[] = [];
  let i = 8;
  while (i < b.length) {
    const laenge = b.readUInt32BE(i);
    const typ = b.toString('latin1', i + 4, i + 8);
    const nutz = b.subarray(i + 8, i + 8 + laenge);
    if (typ === 'IHDR') {
      breite = nutz.readUInt32BE(0);
      hoehe = nutz.readUInt32BE(4);
      if (nutz[8] !== 8 || nutz[9] !== 6 || nutz[12] !== 0) {
        throw new Error(`Erwartet Bittiefe 8, Farbtyp 6, kein Interlacing — gefunden ${nutz[8]}/${nutz[9]}/${nutz[12]}.`);
      }
    } else if (typ === 'IDAT') {
      idat.push(Buffer.from(nutz));
    } else if (typ === 'IEND') {
      break;
    }
    i += 12 + laenge;
  }

  const roh = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const zeile = breite * bpp;
  const daten = new Uint8Array(hoehe * zeile);

  // Filter zurücknehmen, PNG-Spezifikation Abschnitt 9.2.
  for (let y = 0; y < hoehe; y++) {
    const filter = roh[y * (zeile + 1)]!;
    const quelle = y * (zeile + 1) + 1;
    const ziel = y * zeile;
    const oben = ziel - zeile;
    for (let x = 0; x < zeile; x++) {
      const wert = roh[quelle + x]!;
      const a = x >= bpp ? daten[ziel + x - bpp]! : 0;
      const o = y > 0 ? daten[oben + x]! : 0;
      const ol = y > 0 && x >= bpp ? daten[oben + x - bpp]! : 0;
      let vorhersage = 0;
      if (filter === 1) vorhersage = a;
      else if (filter === 2) vorhersage = o;
      else if (filter === 3) vorhersage = (a + o) >> 1;
      else if (filter === 4) vorhersage = paeth(a, o, ol);
      else if (filter !== 0) throw new Error(`Unbekannter Zeilenfilter ${filter}.`);
      daten[ziel + x] = (wert + vorhersage) & 0xff;
    }
  }

  return { breite, hoehe, daten };
}

/**
 * Schreibt Farbtyp 4 (Graustufen mit Alpha), Grauwert überall null.
 *
 * Je Zeile werden mehrere Filter probiert und der genommen, dessen Ergebnis die
 * kleinste Summe absoluter Abweichungen hat -- die übliche Heuristik, weil
 * kleine Zahlen sich besser packen lassen.
 */
function writeGrayAlpha(datei: string, breite: number, hoehe: number, alpha: Uint8Array): number {
  const bpp = 2;
  const zeile = breite * bpp;
  const bild = new Uint8Array(hoehe * zeile);
  for (let i = 0; i < breite * hoehe; i++) {
    bild[i * 2] = 0; // Grau: unbenutzt, die Tinte kommt aus dem Stylesheet
    bild[i * 2 + 1] = alpha[i]!;
  }

  const roh = Buffer.alloc(hoehe * (zeile + 1));
  const versuch = new Uint8Array(zeile);
  for (let y = 0; y < hoehe; y++) {
    let besterFilter = 0;
    let besteSumme = Infinity;
    let beste: Uint8Array = new Uint8Array(zeile);

    for (const filter of [0, 1, 2, 3, 4]) {
      let summe = 0;
      for (let x = 0; x < zeile; x++) {
        const wert = bild[y * zeile + x]!;
        const a = x >= bpp ? bild[y * zeile + x - bpp]! : 0;
        const o = y > 0 ? bild[(y - 1) * zeile + x]! : 0;
        const ol = y > 0 && x >= bpp ? bild[(y - 1) * zeile + x - bpp]! : 0;
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

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(breite, 0);
  ihdr.writeUInt32BE(hoehe, 4);
  ihdr[8] = 8; // Bittiefe
  ihdr[9] = 4; // Farbtyp: Graustufen mit Alpha

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(roh, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
  writeFileSync(datei, png);
  return png.length;
}

const hier = dirname(fileURLToPath(import.meta.url));
const quelle = join(hier, '..', 'docs', 'michaelendething_skizze', 'michaelendething-alpha.png');
const ziel = join(hier, '..', 'public', 'ornament.png');

const bild = readPng(quelle);
const alpha = new Uint8Array(bild.breite * bild.hoehe);
for (let i = 0; i < alpha.length; i++) alpha[i] = bild.daten[i * 4 + 3]!;

const vorher = readFileSync(quelle).length;
const nachher = writeGrayAlpha(ziel, bild.breite, bild.hoehe, alpha);

const kb = (n: number): string => (n / 1024).toFixed(1) + ' KB';
console.log(`Vorlage   ${bild.breite} x ${bild.hoehe}, RGBA   ${kb(vorher)}`);
console.log(`Maske     ${bild.breite} x ${bild.hoehe}, Grau+A  ${kb(nachher)}`);
console.log(`Gespart   ${kb(vorher - nachher)}  (${(100 - (nachher / vorher) * 100).toFixed(0)} %)`);

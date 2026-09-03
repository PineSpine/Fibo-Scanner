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
import { statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lesePng, schreibePng } from './png.ts';

const hier = dirname(fileURLToPath(import.meta.url));
const quelle = join(hier, '..', 'docs', 'michaelendething_skizze', 'michaelendething-alpha.png');
const ziel = join(hier, '..', 'public', 'ornament.png');

const bild = lesePng(quelle);

// Grau auf null setzen, Alpha behalten. schreibePng nimmt bei zwei Kanälen den
// roten Kanal als Grauwert -- also genügt es, ihn zu leeren.
for (let i = 0; i < bild.breite * bild.hoehe; i++) {
  bild.daten[i * 4] = 0;
  bild.daten[i * 4 + 1] = 0;
  bild.daten[i * 4 + 2] = 0;
}

const vorher = statSync(quelle).size;
const nachher = schreibePng(ziel, bild, 2);

const kb = (n: number): string => (n / 1024).toFixed(1) + ' KB';
console.log(`Vorlage   ${bild.breite} x ${bild.hoehe}, RGBA   ${kb(vorher)}`);
console.log(`Maske     ${bild.breite} x ${bild.hoehe}, Grau+A  ${kb(nachher)}`);
console.log(`Gespart   ${kb(vorher - nachher)}  (${(100 - (nachher / vorher) * 100).toFixed(0)} %)`);

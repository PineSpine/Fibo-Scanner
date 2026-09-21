/**
 * Kettenzählung auf allen Motiven, mit Ringen und Rechenzeit.
 *
 * Drei Gruppen:
 *   - gerechnete Blütenstände, verrauscht und versetzt -- müssen exakt sein
 *   - Fremdmotive -- dürfen nichts melden
 *   - echte Blütenstände aus test/test_messungen/3/zuschnitt/, falls vorhanden
 *
 * Die dritte Gruppe liegt NICHT im Repository und darf nie hinein: Es sind
 * Bilder aus dem Netz, teils von Stockseiten, und das Repository ist
 * öffentlich. Der Ordner steht in der .gitignore; dieses Skript liest nur,
 * was lokal da ist, und schreibt nichts.
 *
 * Aufruf: node scripts/ketten-probe.ts [lang]
 */
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lesePng } from './png.ts';
import type { Frame } from '../src/metrics/types.ts';
import { createKettenMetric, entscheide, ketten, kettenErgebnis, kettenStimmen, type Stimmen } from '../src/metrics/ketten.ts';
import { sucheMitte } from '../src/metrics/parastichen.ts';
import { bluetenstand } from '../test/fixtures/phyllotaxis.ts';
import { blur, branchingTree, brickWall, flatWall, fractalSurface } from '../test/fixtures/scenes.ts';
import { whiteNoise, type GrayImage } from '../test/fixtures/images.ts';
import { verrauscht, verschoben } from '../test/fixtures/stoerung.ts';

const lang = process.argv[2] === 'lang';
const metrik = createKettenMetric();

function alsFrame(bild: GrayImage): Frame {
  return { gray: bild.data, edges: new Uint8Array(bild.data.length), width: bild.width, height: bild.height, timestamp: 0 };
}

function pngFrame(pfad: string): Frame {
  const b = lesePng(pfad);
  const gray = new Uint8Array(b.breite * b.hoehe);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = Math.round(0.2126 * b.daten[4 * i]! + 0.7152 * b.daten[4 * i + 1]! + 0.0722 * b.daten[4 * i + 2]!);
  }
  return { gray, edges: new Uint8Array(gray.length), width: b.breite, height: b.hoehe, timestamp: 0 };
}

/**
 * Drei Handaufnahmen desselben Motivs, wie sie eine Messreihe liefert: um ein
 * paar Pixel verschoben und mit Sensorrauschen. Gezählt wird gemeinsam.
 */
function reihe(frame: Frame): ReturnType<typeof entscheide> {
  const bild: GrayImage = { data: frame.gray, width: frame.width, height: frame.height };
  const stimmen: Stimmen[] = [];
  let start: { x: number; y: number } | undefined;
  for (const [dx, dy, saat] of [[0, 0, 11], [3, -2, 12], [-2, 3, 13]] as const) {
    const b = verrauscht(verschoben(bild, dx, dy), 8, saat);
    const f: Frame = { ...frame, gray: b.data };
    const m = sucheMitte(f, undefined, start).mitte;
    start = m;
    stimmen.push(kettenStimmen(f, m.x, m.y));
  }
  return entscheide(stimmen);
}

let alsReihe = false;

function zeile(name: string, frame: Frame): void {
  const t0 = performance.now();
  const roh = alsReihe ? reihe(frame) : ketten(frame);
  const ms = performance.now() - t0;
  const r = kettenErgebnis(roh);
  const vertrauen = Math.round(metrik.confidence(r) * 100);
  console.log(
    `${name.padEnd(30)} ${(r.label || '—').padStart(9)}  ${String(vertrauen).padStart(3)} %  Stütze ${String(roh.stuetze).padStart(3)}  ${ms.toFixed(0).padStart(5)} ms  ${r.caveats[0] ?? ''}`,
  );
  if (lang) {
    const ringe = roh.ringe
      .filter((x) => x.gitter >= 3)
      .map((x) => `${Math.round(x.radius)}:${x.klein}/${x.gross}·${x.gitter}·${Math.round(x.einig * 100)}%`);
    console.log('    ' + ringe.join('  '));
  }
}

console.log('\nGerechnete Blütenstände, verrauscht und versetzt — müssen exakt sein');
for (const [anzahl, dx, dy] of [[400, 20, -10], [700, 13, -7], [1200, -8, 15], [2000, -20, 12]] as const) {
  zeile(`${anzahl} Blütchen (${dx},${dy})`, alsFrame(verschoben(verrauscht(blur(bluetenstand({ anzahl }).bild)), dx, dy)));
}

console.log('\nFremdmotive — dürfen nichts melden');
const fremd: Array<[string, GrayImage]> = [
  ['Backsteinwand', blur(brickWall())],
  ['glatte Wand', blur(flatWall())],
  ['Baum r=0,72', blur(branchingTree(512, 11, 0.72))],
  ['fraktale Fläche', blur(fractalSurface(512, 0.5, 3))],
  ['Bildrauschen', blur(whiteNoise())],
];
for (const [name, bild] of fremd) zeile(name, alsFrame(bild));
for (const name of ['dahlie', 'zinnie']) {
  const b = lesePng(fileURLToPath(new URL(`../test/fotos/${name}.png`, import.meta.url)));
  const gray = new Uint8Array(b.breite * b.hoehe);
  for (let i = 0; i < gray.length; i++) gray[i] = b.daten[4 * i]!;
  zeile(`Foto ${name}`, { gray, edges: new Uint8Array(gray.length), width: b.breite, height: b.hoehe, timestamp: 0 });
}

const lokal = fileURLToPath(new URL('../test/test_messungen/3/zuschnitt/', import.meta.url));
if (existsSync(lokal)) {
  const dateien = readdirSync(lokal).filter((d) => d.endsWith('.png')).sort();
  console.log('\nEchte Blütenstände (nur lokal, nicht im Repository) — ein Bild');
  for (const datei of dateien) zeile(datei.replace('.png', ''), pngFrame(lokal + datei));
  console.log('\nDieselben, als Reihe aus drei Handaufnahmen');
  alsReihe = true;
  for (const datei of dateien) zeile(datei.replace('.png', ''), pngFrame(lokal + datei));
  zeile('gerechnet 700 (Reihe)', alsFrame(blur(bluetenstand({ anzahl: 700 }).bild)));
  for (const [name, bild] of fremd) zeile(`${name} (Reihe)`, alsFrame(bild));
  alsReihe = false;
} else {
  console.log('\n(keine lokalen Originalbilder — test/test_messungen/3/zuschnitt/ fehlt)');
}

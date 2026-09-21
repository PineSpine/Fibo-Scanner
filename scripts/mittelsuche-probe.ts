/**
 * Mittelsuche auf allen Motiven: Was findet die Suche auf Blütenständen, und
 * was holt sie aus Motiven heraus, die keine sind?
 *
 * Die zweite Frage ist die wichtigere. Wer achtzig Mittelpunkte ausprobiert,
 * findet auch im Rauschen den besten von achtzig -- die Schwelle für gesuchte
 * Befunde muss über dem liegen, was Fremdmotive nach der Suche erreichen.
 *
 * Aufruf: node scripts/mittelsuche-probe.ts
 */
import { fileURLToPath } from 'node:url';
import { lesePng } from './png.ts';
import type { Frame } from '../src/metrics/types.ts';
import {
  createParastichenMetric,
  parastichen,
  parastichenErgebnis,
  sucheMitte,
  type ParastichenRoh,
} from '../src/metrics/parastichen.ts';
import { bluetenstand, bluetenstandOhneFibonacci } from '../test/fixtures/phyllotaxis.ts';
import { blur, branchingTree, brickWall, flatWall, fractalSurface } from '../test/fixtures/scenes.ts';
import { whiteNoise, type GrayImage } from '../test/fixtures/images.ts';
import { verrauscht, verschoben } from '../test/fixtures/stoerung.ts';

const metrik = createParastichenMetric();

function alsFrame(bild: GrayImage): Frame {
  return {
    gray: bild.data,
    edges: new Uint8Array(bild.data.length),
    width: bild.width,
    height: bild.height,
    timestamp: 0,
  };
}

function foto(name: string): GrayImage {
  const b = lesePng(fileURLToPath(new URL(`../test/fotos/${name}`, import.meta.url)));
  const data = new Uint8Array(b.breite * b.hoehe);
  for (let i = 0; i < data.length; i++) data[i] = b.daten[4 * i]!;
  return { data, width: b.breite, height: b.hoehe };
}

function zeile(name: string, roh: ParastichenRoh, ms?: number): string {
  const r = parastichenErgebnis(roh);
  const g = Math.min(roh.schaerfeLinks, roh.schaerfeRechts);
  const versatz = `${Math.round(roh.mitte.x - 256)},${Math.round(roh.mitte.y - 256)}`;
  return [
    name.padEnd(30),
    String(r.label).padStart(7),
    String(Math.round(metrik.confidence(r) * 100)).padStart(4) + ' %',
    g.toFixed(1).padStart(7),
    roh.streuung.toFixed(1).padStart(6),
    versatz.padStart(9),
    ms === undefined ? '' : `${ms.toFixed(0).padStart(5)} ms`,
  ].join('  ');
}

console.log('\nMotiv                              Paar  Vertr.   Gipfel  Strukt.  Mitte');

const faelle: Array<[string, GrayImage]> = [
  ['Blütenstand 400', bluetenstand({ anzahl: 400 }).bild],
  ['Blütenstand 700', bluetenstand({ anzahl: 700 }).bild],
  ['Blütenstand 1200', bluetenstand({ anzahl: 1200 }).bild],
  ['Blütenstand 3000', bluetenstand({ anzahl: 3000 }).bild],
  ['700, verrauscht, (13,-7)', verschoben(verrauscht(blur(bluetenstand({ anzahl: 700 }).bild)), 13, -7)],
  ['2000, verrauscht, (-30,22)', verschoben(verrauscht(blur(bluetenstand({ anzahl: 2000 }).bild)), -30, 22)],
  ['400, verrauscht, (45,38)', verschoben(verrauscht(blur(bluetenstand({ anzahl: 400 }).bild)), 45, 38)],
  ['100 Grad statt Goldwinkel', bluetenstandOhneFibonacci({ anzahl: 1200 }).bild],
  ['Backsteinwand', blur(brickWall())],
  ['glatte Wand', blur(flatWall())],
  ['Baum r=0,60', blur(branchingTree(512, 11, 0.6))],
  ['Baum r=0,72', blur(branchingTree(512, 11, 0.72))],
  ['Baum r=0,76', blur(branchingTree(512, 11, 0.76))],
  ['fraktale Fläche', blur(fractalSurface(512, 0.5, 3))],
  ['fraktale Fläche, andere Saat', blur(fractalSurface(512, 0.5, 11))],
  ['Bildrauschen', blur(whiteNoise())],
  ['Foto Dahlie', foto('dahlie.png')],
  ['Foto Zinnie', foto('zinnie.png')],
];

for (const [name, bild] of faelle) {
  const frame = alsFrame(bild);
  console.log(zeile(name + ' · Mitte', parastichen(frame)));
  const t0 = performance.now();
  const gesucht = sucheMitte(frame);
  console.log(zeile(name + ' · gesucht', gesucht, performance.now() - t0));
}

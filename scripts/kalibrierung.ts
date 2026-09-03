/**
 * Druckt die Kalibriertabelle: was die Rechenkette auf bekannten Motiven misst.
 * Kein Test, sondern das Werkzeug, mit dem sich Schwellwert, Skalenbereich und
 * Konfidenzgrenzen begruenden lassen.
 *
 * Aufruf: npm run kalibrierung
 */
import { fractalSurface, brickWall, flatWall, branchingTree, blur } from '../test/fixtures/scenes.ts';
import {
  sierpinski,
  koch,
  whiteNoise,
  emptyPlane,
  type GrayImage,
} from '../test/fixtures/images.ts';
import { sobelMagnitude } from '../src/metrics/sobel.ts';
import { createBoxCountingMetric, boxCount } from '../src/metrics/boxCounting.ts';
import type { Frame } from '../src/metrics/types.ts';

const metrik = createBoxCountingMetric();

/** Referenzbild: liegt bereits als Kantenbild vor, der Sobel entfaellt. */
const alsKante = (img: GrayImage): Frame => ({
  gray: img.data,
  edges: img.data,
  width: img.width,
  height: img.height,
  timestamp: 0,
});

/** Szene: die ganze Kette, wie sie im Betrieb laeuft. */
function alsSzene(img: GrayImage): Frame {
  const weich = blur(img); // die Optik zeichnet nie pixelscharf
  return {
    gray: weich.data,
    edges: sobelMagnitude(weich.data, weich.width, weich.height),
    width: weich.width,
    height: weich.height,
    timestamp: 0,
  };
}

function zeile(name: string, frame: Frame, soll: number | null): void {
  const roh = boxCount(frame);
  const ergebnis = metrik.run(frame);
  const abweichung = soll === null ? '' : (ergebnis.value - soll).toFixed(3).padStart(8);
  console.log(
    name.padEnd(22) +
      ergebnis.value.toFixed(3).padStart(6) +
      (soll === null ? '       —' : soll.toFixed(3).padStart(8)) +
      abweichung.padStart(soll === null ? 8 : 0) +
      String(roh.threshold).padStart(7) +
      ((roh.density * 100).toFixed(1) + ' %').padStart(9) +
      roh.r2.toFixed(4).padStart(8) +
      metrik.confidence(ergebnis).toFixed(2).padStart(7) +
      (ergebnis.caveats.length ? '  · ' + ergebnis.caveats.join(', ') : ''),
  );
}

const kopf =
  'Motiv'.padEnd(22) +
  'D'.padStart(6) +
  'Soll'.padStart(8) +
  'Δ'.padStart(8) +
  'Schw.'.padStart(7) +
  'Dichte'.padStart(9) +
  'r²'.padStart(8) +
  'Vertr.'.padStart(7);

console.log('\nReferenzbilder — als Kantenbild eingespeist, prüft allein die Zählung\n');
console.log(kopf);
zeile('Sierpinski-Dreieck', alsKante(sierpinski()), Math.log(3) / Math.log(2));
zeile('Koch-Schneeflocke', alsKante(koch()), Math.log(4) / Math.log(3));
zeile('Weißes Rauschen', alsKante(whiteNoise()), 2);
zeile('Leere Fläche', alsKante(emptyPlane()), 0);

console.log('\nSzenen — ganze Kette: Graubild, Sobel, Otsu, Zählung\n');
console.log(kopf);
zeile('glatte Wand', alsSzene(flatWall()), null);
zeile('Backsteinwand', alsSzene(brickWall()), null);
zeile('fBm H=0,9 weich', alsSzene(fractalSurface(512, 0.9, 3)), null);
zeile('fBm H=0,5 natürlich', alsSzene(fractalSurface(512, 0.5, 3)), null);
zeile('Baum r=0,60', alsSzene(branchingTree(512, 11, 0.6)), null);
zeile('Baum r=0,68', alsSzene(branchingTree(512, 11, 0.68)), null);
zeile('Baum r=0,72', alsSzene(branchingTree(512, 11, 0.72)), null);
zeile('Baum r=0,76', alsSzene(branchingTree(512, 12, 0.76)), null);
zeile('Bildrauschen', alsSzene(whiteNoise()), null);
console.log('');

/**
 * Prüft, ob beide Verfahren nebeneinander laufen können:
 * Was kosten sie, und melden sie auf fremden Motiven Unsinn?
 *
 * Aufruf: node scripts/gemeinsam-probe.ts
 */
import { createBoxCountingMetric } from '../src/metrics/boxCounting.ts';
import { createParastichenMetric } from '../src/metrics/parastichen.ts';
import { sobelMagnitude } from '../src/metrics/sobel.ts';
import type { Frame, Metric } from '../src/metrics/types.ts';
import { bluetenstand } from '../test/fixtures/phyllotaxis.ts';
import { branchingTree, brickWall, flatWall, fractalSurface, blur } from '../test/fixtures/scenes.ts';
import { whiteNoise, type GrayImage } from '../test/fixtures/images.ts';

const flaeche = createBoxCountingMetric();
const spirale = createParastichenMetric();

function alsFrame(img: GrayImage): Frame {
  const weich = blur(img);
  return {
    gray: weich.data,
    edges: sobelMagnitude(weich.data, weich.width, weich.height),
    width: weich.width,
    height: weich.height,
    timestamp: 0,
  };
}

const szenen: Array<[string, GrayImage]> = [
  ['Sonnenblume 1200', bluetenstand({ anzahl: 1200 }).bild],
  ['Sonnenblume 2000', bluetenstand({ anzahl: 2000 }).bild],
  ['Baum r=0,72', branchingTree(512, 11, 0.72)],
  ['Backsteinwand', brickWall()],
  ['fBm H=0,5', fractalSurface(512, 0.5, 3)],
  ['Bildrauschen', whiteNoise()],
  ['glatte Wand', flatWall()],
];

console.log('\nBeide Verfahren auf jedem Motiv — meldet eines Unsinn?\n');
console.log(
  'Motiv'.padEnd(19) +
    'Fläche'.padStart(9) +
    'Vertr.'.padStart(8) +
    '   ' +
    'Spirale'.padStart(9) +
    'Vertr.'.padStart(8) +
    '  Vorbehalt der Spirale',
);

for (const [name, img] of szenen) {
  const f = alsFrame(img);
  const a = flaeche.run(f);
  const b = spirale.run(f);
  console.log(
    name.padEnd(19) +
      a.value.toFixed(2).padStart(9) +
      flaeche.confidence(a).toFixed(2).padStart(8) +
      '   ' +
      (b.label ?? '—').padStart(9) +
      spirale.confidence(b).toFixed(2).padStart(8) +
      '  ' +
      (b.caveats[0] ?? ''),
  );
}

console.log('\nRechenzeit je Bild (512 × 512), Mittel aus 30 Durchgängen\n');
const messbild = alsFrame(bluetenstand({ anzahl: 1200 }).bild);
for (const [name, m] of [
  ['Box-Counting', flaeche],
  ['Parastichen', spirale],
] as Array<[string, Metric]>) {
  m.run(messbild); // aufwärmen
  const start = performance.now();
  for (let i = 0; i < 30; i++) m.run(messbild);
  const je = (performance.now() - start) / 30;
  console.log(`  ${name.padEnd(15)} ${je.toFixed(2).padStart(7)} ms   →  ${(1000 / je).toFixed(0)} Bilder/s allein`);
}
console.log('');

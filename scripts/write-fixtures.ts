/**
 * Schreibt die Referenzbilder als PNG nach test/fixtures/, damit man sie
 * ansehen kann. Die Tests brauchen sie nicht -- dort werden sie erzeugt, nicht
 * gelesen. Ein eingechecktes Bild könnte von seinem Sollwert abweichen, ohne
 * dass es jemand merkt; ein erzeugtes kann das nicht.
 *
 * Aufruf: npm run fixtures
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { schreibePng, type Bild } from './png.ts';
import { emptyPlane, koch, sierpinski, whiteNoise, type GrayImage } from '../test/fixtures/images.ts';
import { branchingTree, brickWall, flatWall, fractalSurface } from '../test/fixtures/scenes.ts';
import { bluetenstand, bluetenstandOhneFibonacci } from '../test/fixtures/phyllotaxis.ts';

/** Graustufen auf vier Kanäle bringen; schreibePng nimmt den roten als Grau. */
function alsBild(g: GrayImage): Bild {
  const daten = new Uint8Array(g.width * g.height * 4);
  for (let i = 0; i < g.data.length; i++) {
    const v = g.data[i]!;
    daten.set([v, v, v, 255], i * 4);
  }
  return { breite: g.width, hoehe: g.height, daten };
}

const hier = dirname(fileURLToPath(import.meta.url));
const ziel = join(hier, '..', 'test', 'fixtures');
mkdirSync(ziel, { recursive: true });

const bilder: Array<[string, GrayImage]> = [
  ['sierpinski', sierpinski()],
  ['koch', koch()],
  ['weisses-rauschen', whiteNoise()],
  ['leere-flaeche', emptyPlane()],
  ['backsteinwand', brickWall()],
  ['glatte-wand', flatWall()],
  ['baum-r072', branchingTree(512, 11, 0.72)],
  ['fbm-h05', fractalSurface(512, 0.5, 3)],
  ['bluetenstand-1200', bluetenstand({ anzahl: 1200 }).bild],
  ['bluetenstand-ohne-fibonacci', bluetenstandOhneFibonacci({ anzahl: 1200 }).bild],
];

for (const [name, img] of bilder) {
  const groesse = schreibePng(join(ziel, `${name}.png`), alsBild(img), 1);
  console.log(`${name}.png`.padEnd(34) + `${img.width}x${img.height}   ${(groesse / 1024).toFixed(1)} KB`);
}

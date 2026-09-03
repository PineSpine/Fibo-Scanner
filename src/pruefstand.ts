/**
 * Nur fuer die Entwicklung. Wird nicht mitgebaut -- Vite nimmt allein
 * index.html als Einstieg, pruefstand.html liegt daneben und wird nur vom
 * Entwicklungsserver ausgeliefert.
 */
import { createPipeline } from './gpu/pipeline.ts';
import { sobelMagnitude } from './metrics/sobel.ts';
import { boxCount } from './metrics/boxCounting.ts';
import type { Frame } from './metrics/types.ts';
import { sierpinski, koch, whiteNoise, emptyPlane, type GrayImage } from '../test/fixtures/images.ts';
import { branchingTree, brickWall, fractalSurface } from '../test/fixtures/scenes.ts';

const quelle = document.querySelector<HTMLCanvasElement>('#quelle')!;
const rechen = document.querySelector<HTMLCanvasElement>('#rechen')!;
const koerper = document.querySelector<HTMLTableSectionElement>('#tafel tbody')!;

const kontext = quelle.getContext('2d', { willReadFrequently: false })!;
const pipeline = createPipeline(rechen, 512);

function zeichne(img: GrayImage): void {
  const bild = kontext.createImageData(img.width, img.height);
  for (let i = 0; i < img.data.length; i++) {
    const v = img.data[i]!;
    bild.data[i * 4] = v;
    bild.data[i * 4 + 1] = v;
    bild.data[i * 4 + 2] = v;
    bild.data[i * 4 + 3] = 255;
  }
  kontext.putImageData(bild, 0, 0);
}

function warteAufFrame(): Promise<Frame> {
  return new Promise((erfuellen, ablehnen) => {
    let versuche = 0;
    const schauen = (): void => {
      const frame = pipeline.poll();
      if (frame) {
        erfuellen(frame);
        return;
      }
      if (++versuche > 120) {
        ablehnen(new Error('Die Grafikkarte hat nichts zurückgegeben.'));
        return;
      }
      requestAnimationFrame(schauen);
    };
    requestAnimationFrame(schauen);
  });
}

function zelle(text: string, klasse = ''): HTMLTableCellElement {
  const td = document.createElement('td');
  td.textContent = text;
  if (klasse) td.className = klasse;
  return td;
}

const zahl = (v: number, n: number): string =>
  v.toLocaleString('de-DE', { minimumFractionDigits: n, maximumFractionDigits: n });

const bilder: Array<[string, GrayImage]> = [
  ['Sierpinski', sierpinski()],
  ['Koch', koch()],
  ['Weißes Rauschen', whiteNoise()],
  ['Leere Fläche', emptyPlane()],
  ['Backsteinwand', brickWall()],
  ['Baum r=0,72', branchingTree(512, 11, 0.72)],
  ['fBm H=0,5', fractalSurface(512, 0.5, 3)],
];

async function pruefen(): Promise<void> {
  for (const [name, img] of bilder) {
    zeichne(img);
    // Am Ende jedes Durchlaufs ist der Ring leer, also gehoert das naechste
    // Ergebnis eindeutig zu diesem Bild.
    pipeline.submit(quelle, performance.now());
    const frame = await warteAufFrame();

    // Der Vergleich laeuft gegen den CPU-Sobel desselben Graubilds, das die
    // Grafikkarte zurueckgibt. Damit wird der Sobel-Durchgang geprueft und
    // nicht das Verkleinern, das notwendig anders rundet.
    const referenz = sobelMagnitude(frame.gray, frame.width, frame.height);

    let summe = 0;
    let groesste = 0;
    let nah = 0;
    for (let i = 0; i < referenz.length; i++) {
      const d = Math.abs(referenz[i]! - frame.edges[i]!);
      summe += d;
      if (d > groesste) groesste = d;
      if (d <= 1) nah++;
    }
    const anteilNah = nah / referenz.length;

    const dGpu = boxCount(frame).slope;
    const dCpu = boxCount({ ...frame, edges: referenz }).slope;

    const zeile = document.createElement('tr');
    const kopf = document.createElement('th');
    kopf.scope = 'row';
    kopf.textContent = name;
    zeile.append(
      kopf,
      zelle(zahl(summe / referenz.length, 3)),
      zelle(String(groesste)),
      zelle(zahl(anteilNah * 100, 2) + ' %', anteilNah >= 0.99 ? 'ja' : 'nein'),
      zelle(zahl(dGpu, 4)),
      zelle(zahl(dCpu, 4)),
      zelle(zahl(Math.abs(dGpu - dCpu), 4), Math.abs(dGpu - dCpu) < 0.01 ? 'ja' : 'nein'),
    );
    koerper.append(zeile);
  }
}

void pruefen().catch((error: unknown) => {
  const zeile = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 7;
  td.textContent = error instanceof Error ? error.message : String(error);
  zeile.append(td);
  koerper.append(zeile);
});

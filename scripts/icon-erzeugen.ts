/**
 * Schneidet das App-Zeichen aus der Federzeichnung.
 *
 * Genommen wird die gezeichnete Spirale am rechten Rand -- sie ist das einzige
 * Motiv der Vorlage, das für sich allein steht, und für einen Scanner, der
 * Spiralen zählt, ist sie das richtige Zeichen. Aus der eigenen Zeichnung,
 * nicht aus einem Symbolsatz.
 *
 * Warum überhaupt: Ohne eigenes Zeichen holt sich der Browser die
 * favicon.ico aus der Wurzel der Domain -- und dort liegt auf
 * pinespine.github.io eine andere App. Im Reiter stand deren Zeichen.
 *
 * Aufruf: npm run icon
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lesePng, schneide, schreibePng, verkleinere, type Bild } from './png.ts';

/** Ausschnitt in der Vorlage (1080 × 1350), Quadrat. */
const AUSSCHNITT = { x: 818, y: 842, kante: 172 };

/** Tinte und Papier aus dem Styleguide. */
const TINTE = [0x24, 0x1e, 0x1a];
const PAPIER = [0xe6, 0xe1, 0xce];

/** Wie viel Luft um die Zeichnung bleibt, als Anteil der Kante. */
const RAND = 0.1;

/**
 * Android schneidet Startbildschirm-Zeichen auf eine eigene Form zu und darf
 * dabei bis zu einem Fuenftel am Rand wegnehmen. Die maskierbare Fassung
 * bekommt deshalb mehr Luft, sonst faellt die Spirale halb heraus.
 */
const RAND_MASKIERBAR = 0.24;

const hier = dirname(fileURLToPath(import.meta.url));
const quelle = join(hier, '..', 'docs', 'michaelendething_skizze', 'michaelendething-alpha.png');
const ziel = (name: string): string => join(hier, '..', 'public', name);

const vorlage = lesePng(quelle);
const roh = schneide(vorlage, AUSSCHNITT.x, AUSSCHNITT.y, AUSSCHNITT.kante, AUSSCHNITT.kante);

/**
 * Legt die Tinte auf Papier. Die Vorlage ist freigestellt: die Zeichnung steckt
 * im Alphakanal, die Farbkanäle sind bedeutungslos.
 */
function aufPapier(bild: Bild, kante: number, rand = RAND): Bild {
  const innen = Math.round(kante * (1 - 2 * rand));
  const klein = verkleinere(bild, innen);
  const daten = new Uint8Array(kante * kante * 4);
  const versatz = Math.round((kante - innen) / 2);

  for (let i = 0; i < kante * kante; i++) {
    daten.set([PAPIER[0]!, PAPIER[1]!, PAPIER[2]!, 255], i * 4);
  }
  for (let y = 0; y < innen; y++) {
    for (let x = 0; x < innen; x++) {
      const a = klein.daten[(y * innen + x) * 4 + 3]! / 255;
      if (a <= 0) continue;
      const ziel = ((y + versatz) * kante + (x + versatz)) * 4;
      for (let k = 0; k < 3; k++) {
        daten[ziel + k] = Math.round(PAPIER[k]! * (1 - a) + TINTE[k]! * a);
      }
    }
  }
  return { breite: kante, hoehe: kante, daten };
}

for (const kante of [512, 192, 64, 32]) {
  const groesse = schreibePng(ziel(`icon-${kante}.png`), aufPapier(roh, kante), 3);
  console.log(`icon-${kante}.png`.padEnd(24) + `${(groesse / 1024).toFixed(1)} KB`);
}

const maskiert = schreibePng(
  ziel('icon-512-maskierbar.png'),
  aufPapier(roh, 512, RAND_MASKIERBAR),
  3,
);
console.log('icon-512-maskierbar.png'.padEnd(24) + `${(maskiert / 1024).toFixed(1)} KB`);

/**
 * Schreibt die Referenzbilder als PNG nach test/fixtures/, damit man sie
 * ansehen kann. Die Tests brauchen sie nicht -- dort werden sie erzeugt, nicht
 * gelesen. Ein eingechecktes Bild koennte von seinem Sollwert abweichen, ohne
 * dass es jemand merkt; ein erzeugtes kann das nicht.
 *
 * Aufruf: npm run fixtures
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyPlane, koch, sierpinski, whiteNoise, type GrayImage } from '../test/fixtures/images.ts';
import { branchingTree, brickWall, flatWall, fractalSurface } from '../test/fixtures/scenes.ts';

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

/** Graustufen-PNG, 8 Bit, ohne Vorhersagefilter. */
function encodePng(img: GrayImage): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8; // Bittiefe
  ihdr[9] = 0; // Farbtyp: Graustufen
  const roh = Buffer.alloc((img.width + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    roh[y * (img.width + 1)] = 0; // Filtertyp 0
    Buffer.from(img.data.subarray(y * img.width, (y + 1) * img.width)).copy(
      roh,
      y * (img.width + 1) + 1,
    );
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(roh, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
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
];

for (const [name, img] of bilder) {
  const pfad = join(ziel, `${name}.png`);
  writeFileSync(pfad, encodePng(img));
  console.log(`${name}.png  ${img.width}x${img.height}`);
}

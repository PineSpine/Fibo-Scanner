/**
 * Zeigt, wie das Log-Polar-Spektrum bei verschiedenen Motiven aussieht.
 * Grundlage für ein ehrliches Vertrauensmaß der Spiralenzählung.
 *
 * Aufruf: node scripts/spektrum-probe.ts
 */
import { betrag, fft2 } from '../src/metrics/fft.ts';
import { LOGPOLAR_STANDARD, logPolar } from '../src/metrics/logPolar.ts';
import { blur, branchingTree, brickWall, flatWall, fractalSurface } from '../test/fixtures/scenes.ts';
import { bluetenstand } from '../test/fixtures/phyllotaxis.ts';
import { whiteNoise, type GrayImage } from '../test/fixtures/images.ts';

const szenen: Array<[string, GrayImage]> = [
  ['Sonnenblume 1200', bluetenstand({ anzahl: 1200 }).bild],
  ['Sonnenblume 700', bluetenstand({ anzahl: 700 }).bild],
  ['Baum r=0,72', branchingTree(512, 11, 0.72)],
  ['Backsteinwand', brickWall()],
  ['fBm H=0,5', fractalSurface(512, 0.5, 3)],
  ['Bildrauschen', whiteNoise()],
  ['glatte Wand', flatWall()],
];

for (const [name, img] of szenen) {
  const weich = blur(img);
  const lp = logPolar(weich.data, weich.width, weich.height, weich.width / 2, weich.height / 2);

  // Wie viel Struktur steckt überhaupt drin? Standardabweichung der
  // ringbereinigten Daten, in Graustufen.
  let summe = 0;
  for (const v of lp.daten) summe += v * v;
  const streuung = Math.sqrt(summe / lp.daten.length);

  const s = fft2(lp.daten, lp.nWinkel, lp.nRadius);
  const maxS = lp.nRadius / 2 - 1;

  const gipfel: Array<{ m: number; a: number; vz: number }> = [];
  let gesamt = 0;
  let n = 0;
  for (let m = 5; m <= 120; m++) {
    let plus = 0;
    let minus = 0;
    for (let k = 1; k <= maxS; k++) {
      const a = betrag(s, m, k);
      const b = betrag(s, m, -k);
      if (a > plus) plus = a;
      if (b > minus) minus = b;
      gesamt += a + b;
      n += 2;
    }
    gipfel.push({ m, a: plus, vz: +1 }, { m, a: minus, vz: -1 });
  }
  const untergrund = gesamt / n;
  gipfel.sort((x, y) => y.a - x.a);

  const oben = gipfel.slice(0, 6).map((g) => `${g.m}${g.vz > 0 ? '+' : '-'}:${(g.a / untergrund).toFixed(0)}`);
  console.log(
    name.padEnd(19) +
      ` Streuung ${streuung.toFixed(1).padStart(6)}   ` +
      `Untergrund ${untergrund.toFixed(0).padStart(6)}   ` +
      oben.join('  '),
  );
}
console.log('\n(m+ / m- ist die Armzahl je Drehrichtung, die Zahl dahinter der Gipfel im Verhältnis zum Untergrund)');
console.log('Suchbereich:', JSON.stringify(LOGPOLAR_STANDARD), '\n');

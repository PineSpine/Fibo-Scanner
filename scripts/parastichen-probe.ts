/**
 * Misst die Spiralenzahlen an synthetischen Blütenständen und zeigt, welche
 * Fibonacci-Paare bei welcher Blütchenzahl herauskommen sollten.
 *
 * Aufruf: node scripts/parastichen-probe.ts
 */
import { bluetenstand, bluetenstandOhneFibonacci } from '../test/fixtures/phyllotaxis.ts';
import { createParastichenMetric, parastichen, PARASTICHEN_STANDARD } from '../src/metrics/parastichen.ts';
import type { Frame } from '../src/metrics/types.ts';

const metrik = createParastichenMetric();

function alsFrame(bild: { data: Uint8Array; width: number; height: number }): Frame {
  return {
    gray: bild.data,
    edges: bild.data,
    width: bild.width,
    height: bild.height,
    timestamp: 0,
  };
}

console.log('\nBlütenstände nach Vogel, Goldener Winkel\n');
console.log(
  'Blütchen'.padStart(9) +
    'links'.padStart(7) +
    'rechts'.padStart(8) +
    'Treffer'.padStart(9) +
    'schärfe l'.padStart(11) +
    'schärfe r'.padStart(11) +
    'Vertr.'.padStart(8),
);

for (const anzahl of [200, 400, 700, 1200, 2000, 3000]) {
  const b = bluetenstand({ anzahl });
  const f = alsFrame(b.bild);
  const roh = parastichen(f);
  const r = metrik.run(f);
  console.log(
    String(anzahl).padStart(9) +
      String(roh.links).padStart(7) +
      String(roh.rechts).padStart(8) +
      (roh.treffer ? 'ja' : 'nein').padStart(9) +
      roh.schaerfeLinks.toFixed(1).padStart(11) +
      roh.schaerfeRechts.toFixed(1).padStart(11) +
      metrik.confidence(r).toFixed(2).padStart(8) +
      (r.caveats.length ? '   · ' + r.caveats[0] : ''),
  );
}

console.log('\nGegenprobe: 100 Grad statt Goldener Winkel — darf kein Fibonacci ergeben\n');
for (const anzahl of [700, 1200, 2000]) {
  const b = bluetenstandOhneFibonacci({ anzahl });
  const f = alsFrame(b.bild);
  const roh = parastichen(f);
  const r = metrik.run(f);
  console.log(
    String(anzahl).padStart(9) +
      String(roh.links).padStart(7) +
      String(roh.rechts).padStart(8) +
      (roh.treffer ? 'JA (falsch!)' : 'nein').padStart(9) +
      roh.schaerfeLinks.toFixed(1).padStart(11) +
      roh.schaerfeRechts.toFixed(1).padStart(11) +
      metrik.confidence(r).toFixed(2).padStart(8),
  );
}

console.log('\nGegenprobe: gleichmäßiges Rauschen — darf gar nichts finden\n');
{
  const groesse = 512;
  const daten = new Uint8Array(groesse * groesse);
  let a = 12345;
  for (let i = 0; i < daten.length; i++) {
    a = (a * 1103515245 + 12345) & 0x7fffffff;
    daten[i] = a % 256;
  }
  const f = alsFrame({ data: daten, width: groesse, height: groesse });
  const roh = parastichen(f);
  const r = metrik.run(f);
  console.log(
    '  Rauschen'.padStart(9) +
      String(roh.links).padStart(7) +
      String(roh.rechts).padStart(8) +
      (roh.treffer ? 'JA (falsch!)' : 'nein').padStart(9) +
      roh.schaerfeLinks.toFixed(1).padStart(11) +
      roh.schaerfeRechts.toFixed(1).padStart(11) +
      metrik.confidence(r).toFixed(2).padStart(8),
  );
}

console.log('\nSuchbereich: ' + JSON.stringify(PARASTICHEN_STANDARD.logPolar) + '\n');

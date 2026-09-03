import type { Frame, Metric, Result } from './types.ts';
import { betrag, fft2, winkel } from './fft.ts';
import { LOGPOLAR_STANDARD, logPolar, type LogPolarOptionen } from './logPolar.ts';

export interface ParastichenOptionen {
  logPolar: LogPolarOptionen;
  /** Kleinste Spiralenzahl, die als Familie zählt. */
  minArme: number;
  /** Größte. Wird zusätzlich auf nWinkel/4 begrenzt, sonst wird die Abtastung zu grob. */
  maxArme: number;
}

export const PARASTICHEN_STANDARD: ParastichenOptionen = {
  logPolar: LOGPOLAR_STANDARD,
  minArme: 5,
  maxArme: 120,
};

/** Fibonacci-Folge, soweit sie an Blütenständen vorkommt. */
export const FIBONACCI: readonly number[] = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144];

/** Sind die beiden Zahlen in der Fibonacci-Folge benachbart? */
export function benachbarteFibonacci(a: number, b: number): boolean {
  const klein = Math.min(a, b);
  const gross = Math.max(a, b);
  for (let i = 0; i + 1 < FIBONACCI.length; i++) {
    if (FIBONACCI[i] === klein && FIBONACCI[i + 1] === gross) return true;
  }
  return false;
}

/** Nächste Fibonacci-Zahl zu n, für die Beurteilung knapper Fehlschläge. */
export function naechsteFibonacci(n: number): number {
  let beste = FIBONACCI[0]!;
  for (const f of FIBONACCI) if (Math.abs(f - n) < Math.abs(beste - n)) beste = f;
  return beste;
}

export interface ParastichenRoh {
  /** Spiralenzahl der einen Drehrichtung. */
  links: number;
  /** Spiralenzahl der anderen. */
  rechts: number;
  /** Gipfelhöhe im Verhältnis zum Untergrund. Über 3 ist deutlich. */
  schaerfeLinks: number;
  schaerfeRechts: number;
  /** Beide Familien vollständig, zum Nachzeichnen im Bild. */
  familien: readonly [Spiralfamilie, Spiralfamilie];
  /** Beide Zahlen sind in der Fibonacci-Folge benachbart. */
  treffer: boolean;
  /** Mittlere Amplitude im Suchbereich, als Bezugsgröße. */
  untergrund: number;
  /**
   * Wie viel Struktur überhaupt im abgerollten Ring steckt, in Graustufen.
   * Auf einer leeren Wand geht das gegen null, und dann ist jedes Verhältnis
   * von Gipfel zu Untergrund bedeutungslos -- man teilt Rauschen durch Rauschen.
   */
  streuung: number;
}

/**
 * Ab wann ein Bild ueberhaupt genug Struktur hat, um darin nach Spiralen zu
 * suchen. Gemessen an den Vergleichsmotiven: leere Wand 6,1 und Backsteinwand
 * 6,5 gegen 36 bis 40 bei einem Bluetenstand.
 */
const STRUKTUR_MINDEST = 10;

/**
 * Ab welcher Gipfelhoehe -- im Verhaeltnis zum Untergrund -- eine Spiralfamilie
 * als gefunden gilt. Gemessen: Backsteinwand 8, leere Wand 7, Rauschen 4,
 * Baum und fraktale Flaeche 30 bis 93 (dort aber in beiden Drehrichtungen
 * dieselbe Zahl, was ohnehin ausschliesst). Ein Bluetenstand erreicht 174 bis
 * 277. Die Schwelle liegt mit Absicht deutlich unter dem Bluetenstand: ein
 * fotografierter Zapfen ist unordentlicher als ein gerechneter.
 */
const GIPFEL_MINDEST = 30;

/**
 * Eine gefundene Spiralfamilie, so vollständig, dass sie sich nachzeichnen
 * lässt.
 *
 * In Log-Polar-Koordinaten liegt die Familie auf den Linien konstanter Phase
 * von `arme · Winkel + radiusFrequenz · Radiusanteil`. Wer `phase` kennt, kann
 * die Spiralen genau dort ins Kamerabild legen, wo sie gemessen wurden -- und
 * nicht bloß irgendwo hin.
 */
export interface Spiralfamilie {
  /** Zahl der Arme. Zugleich die Winkelfrequenz im Spektrum. */
  arme: number;
  /** Frequenz über den Logarithmus des Radius. Ihr Vorzeichen ist die Drehrichtung. */
  radiusFrequenz: number;
  /** Lage der Arme, aus dem Argument des Fourierkoeffizienten. */
  phase: number;
  /** Gipfelhöhe im Verhältnis zum Untergrund. */
  schaerfe: number;
}

/**
 * Zählt die Spiralarme eines Blütenstandes.
 *
 * Verfahren: Das Bild wird um seine Mitte in Log-Polar-Koordinaten gelegt und
 * fouriertransformiert. Eine Spiralanordnung ist selbstähnlich unter Drehung
 * und Streckung; in diesen Koordinaten wird daraus eine reine Verschiebung,
 * das Muster also periodisch. Die Winkelfrequenz eines Spektralgipfels ist
 * dann unmittelbar die Zahl der Spiralarme -- m Arme kreuzen jeden Kreis
 * genau m-mal. Ganzzahlig von Natur aus, es muss nichts gerundet werden.
 *
 * Das Vorzeichen der Radiusfrequenz trennt die beiden Drehrichtungen: die
 * links- und die rechtsdrehende Familie liegen im Spektrum auf verschiedenen
 * Seiten. Deshalb genügt ein Durchgang für beide Zahlen.
 *
 * Ausgewertet wird ein Kreisring, nicht die ganze Scheibe. Die Blütchen
 * bleiben gleich groß, der Umfang wächst nach außen -- die sichtbare
 * Spiralenzahl hängt also vom Radius ab. Über die ganze Scheibe gemittelt
 * verschmiert sie.
 */
export function parastichen(
  frame: Frame,
  optionen: ParastichenOptionen = PARASTICHEN_STANDARD,
): ParastichenRoh {
  const bild = logPolar(
    frame.gray,
    frame.width,
    frame.height,
    frame.width / 2,
    frame.height / 2,
    optionen.logPolar,
  );

  let quadratsumme = 0;
  for (const v of bild.daten) quadratsumme += v * v;
  const streuung = Math.sqrt(quadratsumme / bild.daten.length);

  const spektrum = fft2(bild.daten, bild.nWinkel, bild.nRadius);
  const maxRadiusFrequenz = bild.nRadius / 2 - 1;
  const obergrenze = Math.min(optionen.maxArme, Math.floor(bild.nWinkel / 4));

  let summe = 0;
  let anzahl = 0;
  const leer = (): Spiralfamilie => ({ arme: 0, radiusFrequenz: 0, phase: 0, schaerfe: 0 });
  let besterPlus = leer();
  let besterMinus = leer();
  let staerkePlus = 0;
  let staerkeMinus = 0;

  for (let m = optionen.minArme; m <= obergrenze; m++) {
    let plus = 0;
    let minus = 0;
    let plusS = 0;
    let minusS = 0;
    // Die Radiusfrequenz null bleibt außen vor: sie beschreibt Speichen, die
    // gerade nach außen laufen, also gar keine Spirale.
    for (let k = 1; k <= maxRadiusFrequenz; k++) {
      const a = betrag(spektrum, m, k);
      const b = betrag(spektrum, m, -k);
      if (a > plus) {
        plus = a;
        plusS = k;
      }
      if (b > minus) {
        minus = b;
        minusS = -k;
      }
      summe += a + b;
      anzahl += 2;
    }
    if (plus > staerkePlus) {
      staerkePlus = plus;
      besterPlus = { arme: m, radiusFrequenz: plusS, phase: winkel(spektrum, m, plusS), schaerfe: 0 };
    }
    if (minus > staerkeMinus) {
      staerkeMinus = minus;
      besterMinus = { arme: m, radiusFrequenz: minusS, phase: winkel(spektrum, m, minusS), schaerfe: 0 };
    }
  }

  const untergrund = anzahl > 0 ? summe / anzahl : 0;
  const teile = (x: number): number => (untergrund > 0 ? x / untergrund : 0);
  besterPlus.schaerfe = teile(staerkePlus);
  besterMinus.schaerfe = teile(staerkeMinus);

  return {
    links: besterPlus.arme,
    rechts: besterMinus.arme,
    schaerfeLinks: besterPlus.schaerfe,
    schaerfeRechts: besterMinus.schaerfe,
    familien: [besterPlus, besterMinus],
    treffer:
      besterPlus.arme !== besterMinus.arme &&
      benachbarteFibonacci(besterPlus.arme, besterMinus.arme),
    untergrund,
    streuung,
  };
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function ramp(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

export function createParastichenMetric(
  optionen: ParastichenOptionen = PARASTICHEN_STANDARD,
): Metric {
  return {
    id: 'parastichen',
    // "Parastichen" heisst niemandem etwas, der es nicht schon weiss. Der
    // Fachbegriff steht im Erklaertext, in der Anzeige steht, worum es geht.
    label: 'Fibonacci-Spiralen',

    phaenomen: [
      "Auf einer Sonnenblume, einem Kiefernzapfen oder einem Romanesco sieht man Spiralen — und zwar in zwei Richtungen zugleich, nach links und nach rechts gedreht. Zählt man beide, kommen fast immer benachbarte Zahlen aus derselben Reihe heraus: 21 und 34, oder 34 und 55, oder 55 und 89.",
      "Diese Reihe heißt Fibonacci-Folge. Jede Zahl darin ist die Summe der beiden davor: 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89.",
      "Der Grund dafür ist keine Zahlenmagie, sondern Platzmangel. Eine Pflanze setzt ein Blütchen nach dem anderen an und dreht sich dabei jedes Mal um denselben Winkel weiter. Wäre dieser Winkel ein glatter Bruchteil des Vollkreises — ein Drittel etwa —, säße jedes dritte Blütchen genau über dem ersten und nähme ihm das Licht. Der Winkel, bei dem sich am wenigsten überdeckt, liegt bei rund 137,5 Grad. Aus ihm entstehen die Spiralen von selbst, und ihre Anzahlen sind genau die Fibonacci-Zahlen.",
      "In der Fachsprache heißen die Spiralarme Parastichen.",
    ],

    verfahren: [
      "Die App rollt das Bild um seine Mitte ab: waagerecht der Winkel, senkrecht der Abstand zur Mitte. In dieser Darstellung wird aus jeder Spirale eine schräge Gerade — und wie oft ein solches Muster den Kreis umrundet, lässt sich abzählen. Genau das ist die Zahl der Spiralarme.",
      "Findet die App zwei Familien, legt sie sie als Linien ins Kamerabild, dorthin, wo sie gemessen wurden. Sind die beiden Zahlen in der Fibonacci-Folge benachbart, färben sie sich ockergolden.",
      "Das gelingt nur, wenn der Blütenstand frontal und formatfüllend im Rahmen steht. Von schräg gesehen verzerren sich die Spiralen, und die Zählung stimmt nicht mehr. Findet die App nichts, zeichnet sie auch nichts — eine Linie ohne Befund wäre eine Behauptung.",
    ],

    run(frame: Frame): Result {
      const roh = parastichen(frame, optionen);
      const caveats: string[] = [];

      const klein = Math.min(roh.links, roh.rechts);
      const gross = Math.max(roh.links, roh.rechts);
      const schwaechere = Math.min(roh.schaerfeLinks, roh.schaerfeRechts);

      if (roh.streuung < STRUKTUR_MINDEST) caveats.push('zu wenig Struktur – kein Blütenstand im Bild');
      else if (schwaechere < GIPFEL_MINDEST) caveats.push('keine deutlichen Spiralen – frontal und formatfüllend halten');
      else if (roh.links === roh.rechts) caveats.push('nur eine Spiralfamilie erkennbar');
      else if (!roh.treffer) caveats.push('Spiralen gezählt, aber kein Fibonacci-Paar');

      return {
        value: gross,
        label: `${klein}/${gross}`,
        detail: {
          streuung: roh.streuung,
          links: roh.links,
          rechts: roh.rechts,
          schaerfeLinks: roh.schaerfeLinks,
          schaerfeRechts: roh.schaerfeRechts,
          treffer: roh.treffer ? 1 : 0,
        },
        caveats,
      };
    },

    confidence(r: Result): number {
      const links = r.detail['links'] ?? 0;
      const rechts = r.detail['rechts'] ?? 0;
      if (links === 0 || rechts === 0) return 0;
      // Zwei gleiche Zahlen heißen: es wurde zweimal dieselbe Familie gefunden,
      // nicht zwei. Dann ist die Aussage keine.
      if (links === rechts) return 0;

      const schwaechere = Math.min(r.detail['schaerfeLinks'] ?? 0, r.detail['schaerfeRechts'] ?? 0);
      const streuung = r.detail['streuung'] ?? 0;
      // Zwei Tore, und beide müssen offen sein.
      return clamp01(ramp(10, 22, streuung) * ramp(GIPFEL_MINDEST, 90, schwaechere));
    },

    explain(r: Result): string {
      const links = r.detail['links'] ?? 0;
      const rechts = r.detail['rechts'] ?? 0;
      const treffer = (r.detail['treffer'] ?? 0) === 1;
      const klein = Math.min(links, rechts);
      const gross = Math.max(links, rechts);

      const urteil = treffer
        ? `${klein} und ${gross} sind in der Fibonacci-Folge benachbart – der Blütenstand ` +
          'ist nach dem Goldenen Winkel gebaut.'
        : `${klein} und ${gross} sind in der Fibonacci-Folge nicht benachbart. Das kann am ` +
          'Motiv liegen oder daran, dass die Kamera schräg steht.';

      return (
        'Die Spiralarme in einem Blütenstand heißen Parastichen. ' +
        'Das Bild wird um seine Mitte abgerollt: waagerecht der Winkel, senkrecht der ' +
        'Logarithmus des Abstands zur Mitte. In dieser Darstellung wird aus jeder Spirale ' +
        'eine Gerade, und die Fouriertransformation zählt, wie oft sie den Kreis umrundet. ' +
        `Gefunden: ${klein} Arme in der einen Drehrichtung, ${gross} in der anderen. ${urteil}`
      );
    },
  };
}

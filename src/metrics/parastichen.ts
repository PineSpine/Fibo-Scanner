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
  /** Um welchen Punkt abgerollt wurde, in Pixeln des Frames. */
  mitte: { x: number; y: number };
  /**
   * Abstand dieses Punkts von der Bildmitte, in Pixeln. Groß heißt: das
   * Zielen war ungenau, und die Suche hat es ausgeglichen.
   */
  versatz: number;
  /**
   * Ob die Mitte gesucht wurde. Wer sucht, findet auch im Rauschen den besten
   * von achtzig Versuchen -- dafür gilt eine strengere Schwelle.
   */
  gesucht: boolean;
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
 * Ab hier sind beide Tore voll offen. Dazwischen steigt das Vertrauen weich an.
 *
 * Was dazwischen liegt, ist nicht "ein bisschen Blütenstand", sondern meistens
 * etwas anderes. Die ersten echten Fotos -- Dahlie und Zinnie, jeweils die
 * ganze Blüte im Bild -- lagen bei Gipfelhöhe 33 bis 51, also genau in dem
 * Bereich, in dem auch Baum und fraktale Fläche liegen. Gezählt wurden dort
 * die Blütenblätter, nicht die Blütchen: 12 bis 14 bei der Dahlie. Ein
 * gerechneter Blütenstand erreicht 90 bis 277.
 */
const GIPFEL_VOLL = 90;
const STRUKTUR_VOLL = 22;

/**
 * Untere Schwelle, wenn die Mitte gesucht wurde.
 *
 * Wer achtzig Mittelpunkte ausprobiert, nimmt den besten -- auch dort, wo es
 * nichts zu finden gibt. Gemessen nach der Suche (scripts/mittelsuche-probe.ts):
 * Fremdmotive mit zwei verschiedenen Spiralzahlen höchstens 53,6 (Foto Zinnie),
 * Dahlie 47,3, Rauschen 4,5. Fraktale Fläche erreicht 85, aber in beiden
 * Richtungen dieselbe Zahl, was ohnehin ausschließt. Blütenstände, auch
 * verrauscht und um bis zu 45 Pixel versetzt: 90,6 bis 157.
 */
const GIPFEL_MINDEST_GESUCHT = 60;

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
  return parastichenUm(frame, frame.width / 2, frame.height / 2, optionen);
}

/**
 * Wie `parastichen`, aber um einen frei gewählten Mittelpunkt.
 *
 * Die Bildmitte ist fast nie die Blütenmitte. Und die Toleranz ist winzig:
 * Verschiebt man die Mitte um δ, verrutscht jede der m Spiralen am inneren
 * Messring (Radius r) um etwa m·δ/r im Winkel. Ab etwa einer Einheit ist das
 * Muster zerstört. Bei r ≈ 100 Pixeln und 89 Spiralen heißt das: gut ein
 * Pixel. Gemessen an gerechneten, verrauschten Blütenständen: Bei 4 Pixeln
 * Versatz fällt 55/89 von 100 % Vertrauen auf null.
 */
export function parastichenUm(
  frame: Frame,
  cx: number,
  cy: number,
  optionen: ParastichenOptionen = PARASTICHEN_STANDARD,
): ParastichenRoh {
  const bild = logPolar(frame.gray, frame.width, frame.height, cx, cy, optionen.logPolar);

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
    mitte: { x: cx, y: cy },
    versatz: Math.hypot(cx - frame.width / 2, cy - frame.height / 2),
    gesucht: false,
  };
}

/** Wie gut ein Mittelpunkt ist: die schwächere der beiden Gipfelschärfen. */
function guete(roh: ParastichenRoh): number {
  return Math.min(roh.schaerfeLinks, roh.schaerfeRechts);
}

/**
 * Wie weit die gesuchte Mitte höchstens von der Bildmitte abrücken darf, als
 * Anteil der Bildkante. Weiter draußen läuft der äußere Messring aus dem Bild,
 * und was dann gezählt wird, ist zur Hälfte leerer Rand.
 */
const VERSATZ_HOECHSTENS = 0.15;

/** Nachbarn beim Bergsteigen: die acht Richtungen. */
const RICHTUNGEN: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/**
 * Sucht die Blütenmitte im Bild selbst, statt sie in der Bildmitte anzunehmen.
 *
 * Verfahren: Bergsteigen auf der Gipfelschärfe. Von einem Startpunkt aus
 * werden die acht Nachbarn im Abstand `schritt` gemessen; ist einer besser,
 * geht es dorthin, sonst wird der Schritt halbiert -- bis auf einen Pixel.
 * Die Schärfe fällt zur echten Mitte hin gleichmäßig an (gemessen: 118 bei
 * 0 Pixeln, 44 bei 2, 29 bei 4, 20 bei 8, 14 bei 16), deshalb findet der
 * Aufstieg den Gipfel, obwohl er schmal ist.
 *
 * Ohne `start` wird vorher ein grobes Raster von 5 × 5 Punkten im Abstand 16
 * um die Bildmitte gelegt und vom besten aus gestiegen. Ein einzelner
 * Aufstieg von der Bildmitte blieb bei großem Versatz einmal an einem
 * Nebengipfel hängen; das Raster fängt das ab. Mit `start` -- der Mitte aus
 * dem vorigen Bild einer Reihe -- genügt der Aufstieg allein, denn die Hand
 * bewegt sich zwischen zwei Bildern nur um wenige Pixel.
 *
 * Kosten: 60 bis 90 Messungen um je einen Punkt, 0,2 bis 0,6 Sekunden auf dem
 * Entwicklungsrechner. Für die laufende Anzeige zu teuer, für eine
 * festgehaltene Messung angemessen.
 */
export function sucheMitte(
  frame: Frame,
  optionen: ParastichenOptionen = PARASTICHEN_STANDARD,
  start?: { x: number; y: number },
): ParastichenRoh {
  const mx = frame.width / 2;
  const my = frame.height / 2;
  const grenze = VERSATZ_HOECHSTENS * Math.min(frame.width, frame.height);
  const erlaubt = (x: number, y: number): boolean =>
    Math.abs(x - mx) <= grenze && Math.abs(y - my) <= grenze;

  let beste: ParastichenRoh;
  let schritt: number;

  if (start && erlaubt(start.x, start.y)) {
    beste = parastichenUm(frame, start.x, start.y, optionen);
    schritt = 4;
  } else {
    beste = parastichenUm(frame, mx, my, optionen);
    for (let j = -2; j <= 2; j++) {
      for (let i = -2; i <= 2; i++) {
        if (i === 0 && j === 0) continue;
        const kandidat = parastichenUm(frame, mx + i * 16, my + j * 16, optionen);
        if (guete(kandidat) > guete(beste)) beste = kandidat;
      }
    }
    schritt = 8;
  }

  // Obergrenze nur als Sicherung -- auf den Prüfbildern endet der Aufstieg
  // nach höchstens gut zehn Zügen.
  for (let zuege = 0; schritt >= 1 && zuege < 60; zuege++) {
    let besser: ParastichenRoh | null = null;
    for (const [dx, dy] of RICHTUNGEN) {
      const x = beste.mitte.x + dx * schritt;
      const y = beste.mitte.y + dy * schritt;
      if (!erlaubt(x, y)) continue;
      const kandidat = parastichenUm(frame, x, y, optionen);
      if (guete(kandidat) > guete(besser ?? beste)) besser = kandidat;
    }
    if (besser) beste = besser;
    else schritt /= 2;
  }

  return { ...beste, gesucht: true };
}

/**
 * Macht aus der Rohmessung das Ergebnis, das die Anzeige bekommt.
 *
 * Getrennt von `run`, weil die Schleife beides braucht: das Ergebnis fuer die
 * Zahl und die Rohmessung fuer die Nachzeichnung. Vorher rief sie `run` und
 * `parastichen` nacheinander auf und liess dieselbe Fouriertransformation
 * zweimal rechnen -- 10,6 statt 5,3 Millisekunden je Bild, und das genau bei
 * dem Verfahren, das die meisten Einzelmessungen braucht, um verlaesslich zu
 * werden.
 */
export function parastichenErgebnis(roh: ParastichenRoh): Result {
  const caveats: string[] = [];

  const klein = Math.min(roh.links, roh.rechts);
  const gross = Math.max(roh.links, roh.rechts);
  const schwaechere = Math.min(roh.schaerfeLinks, roh.schaerfeRechts);
  const mindest = roh.gesucht ? GIPFEL_MINDEST_GESUCHT : GIPFEL_MINDEST;

  if (roh.streuung < STRUKTUR_MINDEST) caveats.push('zu wenig Struktur – kein Blütenstand im Bild');
  else if (schwaechere < mindest) caveats.push('keine deutlichen Spiralen – frontal und formatfüllend halten');
  else if (roh.links === roh.rechts) caveats.push('nur eine Spiralfamilie erkennbar');
  // Die Tore sind offen, aber nicht weit: Das Vertrauen bleibt gering, und
  // ohne diesen Satz stünde in der Anzeige kein Grund dafür. Der Rat ist
  // konkret, weil der häufigste Fehler konkret ist -- die ganze Blüte im Bild
  // statt ihrer Mitte.
  else if (schwaechere < GIPFEL_VOLL || roh.streuung < STRUKTUR_VOLL)
    caveats.push('Spiralen nur angedeutet – Blütenmitte formatfüllend halten');
  else if (!roh.treffer) caveats.push('Spiralen gezählt, aber kein Fibonacci-Paar');

  return {
    value: gross,
    label: `${klein}/${gross}`,
    deutung: roh.treffer
      ? 'benachbarte Fibonacci-Zahlen'
      : klein > 0
        ? 'Spiralen gezählt, kein Fibonacci-Paar'
        : '',
    detail: {
      streuung: roh.streuung,
      links: roh.links,
      rechts: roh.rechts,
      schaerfeLinks: roh.schaerfeLinks,
      schaerfeRechts: roh.schaerfeRechts,
      treffer: roh.treffer ? 1 : 0,
      gesucht: roh.gesucht ? 1 : 0,
      versatz: roh.versatz,
    },
    caveats,
  };
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function ramp(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/**
 * Was Fibonacci-Spiralen sind -- unabhaengig davon, wie die App sie zaehlt.
 * Beide Zaehlverfahren (Fourier hier, Nachbarketten in ketten.ts) teilen ihn.
 */
export const SPIRALEN_PHAENOMEN: readonly string[] = [
  "Auf einer Sonnenblume, einem Kiefernzapfen oder einem Romanesco sieht man Spiralen — und zwar in zwei Richtungen zugleich, nach links und nach rechts gedreht. Zählt man beide, kommen fast immer benachbarte Zahlen aus derselben Reihe heraus: 21 und 34, oder 34 und 55, oder 55 und 89.",
  "Diese Reihe heißt Fibonacci-Folge. Jede Zahl darin ist die Summe der beiden davor: 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89.",
  "Der Grund dafür ist keine Zahlenmagie, sondern Platzmangel. Eine Pflanze setzt ein Blütchen nach dem anderen an und dreht sich dabei jedes Mal um denselben Winkel weiter. Wäre dieser Winkel ein glatter Bruchteil des Vollkreises — ein Drittel etwa —, säße jedes dritte Blütchen genau über dem ersten und nähme ihm das Licht. Der Winkel, bei dem sich am wenigsten überdeckt, liegt bei rund 137,5 Grad. Aus ihm entstehen die Spiralen von selbst, und ihre Anzahlen sind genau die Fibonacci-Zahlen.",
  "In der Fachsprache heißen die Spiralarme Parastichen.",
  "Die bekannte Spirale aus ineinandergesetzten Quadraten, das Bild vom Goldenen Schnitt, ist etwas anderes. Sie ist eine einzige Spirale, die mit jeder Vierteldrehung um den Faktor 1,618 wächst — und sie kommt in einer Sonnenblume nicht vor. Dort liegen viele flachere Spiralen in zwei Scharen nebeneinander. Mit dem Goldenen Schnitt hat der Blütenstand trotzdem zu tun: über den Winkel von 137,5 Grad, der den Vollkreis im Goldenen Schnitt teilt, nicht über die Form einer Spirale.",
];

export function createParastichenMetric(
  optionen: ParastichenOptionen = PARASTICHEN_STANDARD,
): Metric {
  return {
    id: 'parastichen',
    // "Parastichen" heisst niemandem etwas, der es nicht schon weiss. Der
    // Fachbegriff steht im Erklaertext, in der Anzeige steht, worum es geht.
    label: 'Fibonacci-Spiralen',

    phaenomen: SPIRALEN_PHAENOMEN,

    verfahren: [
      "Die App rollt das Bild um seine Mitte ab: waagerecht der Winkel, senkrecht der Abstand zur Mitte. In dieser Darstellung wird aus jeder Spirale eine schräge Gerade — und wie oft ein solches Muster den Kreis umrundet, lässt sich abzählen. Genau das ist die Zahl der Spiralarme.",
      "Dafür muss sie die Blütenmitte auf etwa einen Bildpunkt genau kennen. Schon wenige Punkte daneben verrutschen die Spiralen beim Abrollen so weit, dass nichts mehr zu zählen ist — so genau zielt keine Hand. Die App sucht die Mitte deshalb selbst: Sie probiert Punkte in der Umgebung aus und geht dorthin, wo die Spiralen am deutlichsten werden. Das dauert ein bis zwei Sekunden und geschieht darum erst, wenn man die Messung festhält.",
      "Der Ring mit dem Kreuz über dem Kamerabild zeigt, wo gemessen wird. Die Blütenmitte gehört ungefähr ins Kreuz, der Blütenstand soll den Ring füllen. Ungefähr genügt — den Rest findet die Suche.",
      "Findet die App zwei Familien, legt sie sie als Linien ins Bild, um die gefundene Mitte, dorthin, wo sie gemessen wurden. Die Linien laufen zwischen den Reihen der Blütchen entlang, in den Gassen. Folgen sie den Reihen, stimmt die Zählung; kreuzen sie sie, stimmt sie nicht. Das kann jeder mit eigenen Augen prüfen. Sind die beiden Zahlen in der Fibonacci-Folge benachbart, färben sie sich ockergolden.",
      "Das gelingt nur, wenn der Blütenstand frontal im Rahmen steht. Von schräg gesehen wird der Kreis zur Ellipse, und die Zählung stimmt nicht mehr. Findet die App nichts, zeichnet sie auch nichts — eine Linie ohne Befund wäre eine Behauptung.",
    ],

    run(frame: Frame): Result {
      return parastichenErgebnis(parastichen(frame, optionen));
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
      // Nach einer Suche gilt die strengere Untergrenze -- sonst wird der beste
      // von achtzig Zufallstreffern als Befund verkauft.
      const mindest = (r.detail['gesucht'] ?? 0) === 1 ? GIPFEL_MINDEST_GESUCHT : GIPFEL_MINDEST;
      return clamp01(
        ramp(STRUKTUR_MINDEST, STRUKTUR_VOLL, streuung) * ramp(mindest, GIPFEL_VOLL, schwaechere),
      );
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

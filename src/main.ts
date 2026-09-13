import './styles.css';
import { CameraError, startCamera, type CameraHandle } from './camera/camera.ts';
import { createBelichtungswaechter } from './camera/belichtung.ts';
import { createWachhalter } from './camera/wakeLock.ts';
import { createPipeline, type Pipeline } from './gpu/pipeline.ts';
import { GpuError } from './gpu/context.ts';
import { createBoxCountingMetric } from './metrics/boxCounting.ts';
import { createParastichenMetric, parastichen, parastichenErgebnis } from './metrics/parastichen.ts';
import type { Metric, Result } from './metrics/types.ts';
import {
  createSmoother,
  createStabilityTracker,
  type Smoother,
  type StabilityReport,
} from './calibration/stability.ts';
import {
  EINIGKEIT_MINDEST,
  fasseDiskret,
  fasseStetig,
  type Probe,
  type Reihenbefund,
} from './calibration/messreihe.ts';
import { createUnruhewaechter } from './calibration/bewegung.ts';
import { createAnzeige, erklaerungenAufbauen, type Befund } from './ui/anzeige.ts';
import { createNachzeichner } from './ui/nachzeichnung.ts';
import { LOGPOLAR_STANDARD } from './metrics/logPolar.ts';
import type { ParastichenRoh } from './metrics/parastichen.ts';

function frag<T extends Element>(wahl: string): T {
  const element = document.querySelector<T>(wahl);
  if (!element) throw new Error(`Element fehlt: ${wahl}`);
  return element;
}

const ansichtStart = frag<HTMLElement>('#ansicht-start');
const ansichtMess = frag<HTMLElement>('#ansicht-mess');
const startFehler = frag<HTMLElement>('#start-fehler');
const video = frag<HTMLVideoElement>('#video');
const kanten = frag<HTMLCanvasElement>('#kanten');
const standbild = frag<HTMLCanvasElement>('#standbild');
const messTitel = frag<HTMLElement>('.mess-titel');

/**
 * Alle Verfahren laufen nebeneinander. Nichts wird umgeschaltet -- die App
 * soll sagen, was im Bild steckt, nicht fragen, wonach man suchen will.
 *
 * `jedesNte` staffelt die teureren: Box-Counting kostet 4,4 ms, die
 * Spiralenzählung 5,3 ms auf dem Entwicklungsrechner. Beides bei jedem Bild
 * wäre auf einem Telefon zu viel; die Spiralen ändern sich ohnehin langsamer
 * als die Hand zittert.
 *
 * `stetig` sagt, ob der Wert geglättet werden darf. Eine Spiralenzahl ist
 * ganzzahlig -- ein Mittel aus 34 und 55 wäre 44,5 und damit eine Zahl, die es
 * nicht gibt.
 */
interface Verfahren {
  metrik: Metric;
  stetig: boolean;
  /**
   * Ob das Verfahren nur auf bestimmte Motive passt.
   *
   * Box-Counting hat zu jedem Bild etwas zu sagen -- eine Hauswand hat eine
   * fraktale Dimension, ein Teller Suppe auch. Die Spiralenzählung schweigt
   * fast immer und meldet sich nur beim Blütenstand. Wenn sie sich meldet,
   * ist das die interessantere Auskunft, auch wenn das Dauerverfahren nominell
   * ein Prozent sicherer ist. Sonst verdeckt das Häufige das Seltene.
   */
  spezifisch: boolean;
  jedesNte: number;
  glaetter: Smoother;
  ergebnis: Result | null;
  konfidenz: number;
  wert: string | null;
  hinweis: string;
  /** Nur bei der Spiralenzählung: die Familien zum Nachzeichnen. */
  roh?: ParastichenRoh | undefined;
  /** Einzelmessungen der laufenden Messreihe. Leer, solange keine läuft. */
  proben: Reihenprobe[];
  /** Was die abgeschlossene Reihe ergeben hat. Null im laufenden Betrieb. */
  fest: Festbefund | null;
}

/**
 * Eine Einzelmessung samt allem, was an ihrem Bild hängt. Die Zusammenfassung
 * zeigt am Ende auf eine davon zurück -- und dann sollen Zwischenwerte,
 * Schwellwert und Nachzeichnung von genau diesem Bild stammen und nicht von
 * irgendeinem anderen.
 */
interface Reihenprobe {
  probe: Probe;
  ergebnis: Result;
  roh?: ParastichenRoh | undefined;
}

/** Der festgehaltene Befund eines Verfahrens. */
interface Festbefund {
  /** Fertig formatiert, oder null, wenn die Reihe nichts hergab. */
  wert: string | null;
  zahl: number;
  deutung: string;
  treffer: boolean;
  reihe: { proben: number; traeger: number; spanne: number };
}

const verfahren: Verfahren[] = [
  {
    metrik: createBoxCountingMetric(),
    stetig: true,
    spezifisch: false,
    jedesNte: 1,
    glaetter: createSmoother(),
    ergebnis: null,
    konfidenz: 0,
    wert: null,
    hinweis: '',
    proben: [],
    fest: null,
  },
  {
    metrik: createParastichenMetric(),
    stetig: false,
    spezifisch: true,
    jedesNte: 3,
    glaetter: createSmoother(),
    ergebnis: null,
    konfidenz: 0,
    wert: null,
    hinweis: '',
    proben: [],
    fest: null,
  },
];

/** Das Verfahren, das gerade groß dasteht. */
let hauptId = verfahren[0]!.metrik.id;

/**
 * Wie viel besser ein anderes Verfahren sein muss, um den Hauptplatz zu
 * übernehmen. Ohne diesen Abstand wechselt die Überschrift bei jedem Bild,
 * sobald zwei Verfahren ähnlich sicher sind.
 */
const WECHSELVORSPRUNG = 0.15;

/**
 * Ab diesem Vertrauen bekommt ein spezifisches Verfahren den Hauptplatz, auch
 * wenn ein Dauerverfahren höher steht. Nicht tiefer ansetzen -- sonst drängt
 * sich eine Vermutung vor eine Messung.
 */
const SONDERBEFUND_AB = 0.6;

let bildzaehler = 0;

/**
 * Was die App gerade tut.
 *
 *   live   → es wird fortlaufend gemessen und angezeigt
 *   reihe  → eine Messreihe läuft, es wird gesammelt
 *   fest   → Standbild, der Befund der Reihe steht
 *
 * Der Grund für die Reihe: Eine Einzelmessung aus der Hand ist eine
 * Zufallsgröße. Der Ausschnitt wandert um Pixel, der Autofokus regelt nach,
 * der Otsu-Schnitt springt um eine Graustufe -- und angezeigt wurde davon
 * bisher immer das jüngste Bild, also der Zufall selbst. Eine Reihe misst
 * stattdessen viele Bilder und hält fest, worauf sie sich geeinigt haben.
 */
type Messzustand = 'live' | 'reihe' | 'fest';
let messzustand: Messzustand = 'live';

/**
 * Wie lange eine Messreihe sammelt.
 *
 * Zweieinhalb Sekunden sind ein Kompromiss: lang genug, dass Handzittern und
 * Sensorrauschen sich herausmitteln, kurz genug, dass man den Arm ruhig hält.
 * Das Zehn-Sekunden-Fenster der Abnahmebedingung bleibt davon unberührt -- es
 * beantwortet eine andere Frage, nämlich ob das Gerät überhaupt ruhig messen
 * kann.
 */
const REIHE_DAUER = 2500;
/** Unter so vielen Einzelmessungen ist eine Abstimmung keine. */
const REIHE_MINDESTPROBEN = 10;
/** Nach dieser Zeit endet die Reihe auch mit zu wenigen Messungen. */
const REIHE_HOECHSTDAUER = 6000;

let reiheSeit = 0;
/** Wie lange die festgehaltene Reihe wirklich gedauert hat, in Sekunden. */
let reiheDauer = 0;

const stabilitaet = createStabilityTracker();
const unruhe = createUnruhewaechter();
const anzeige = createAnzeige();
const wachhalter = createWachhalter();
const belichtung = createBelichtungswaechter();
const nachzeichner = createNachzeichner(frag<SVGSVGElement>('#nachzeichnung'));

// Die Erklaerungen stehen in den Verfahren selbst; die Anzeige kennt keines.
erklaerungenAufbauen(
  frag<HTMLElement>('#erklaerungen'),
  verfahren.map((v) => v.metrik),
);

let kamera: CameraHandle | null = null;
let pipeline: Pipeline | null = null;
let laeuft = false;
/** Verhindert, dass ein zweiter Tippen den Start doppelt anstoesst. */
let startetGerade = false;
let zeigeKanten = false;

/**
 * Zustand der Belichtung.
 *
 *   pendelt  → die Automatik regelt noch, es wird nicht gemessen
 *   sperrt   → Sperrbefehl unterwegs
 *   prueft   → gesperrt, aber noch unter Beobachtung
 *   fertig   → gesperrt und für gut befunden, oder Automatik
 *
 * Die Prüfphase gibt es, weil applyConstraints Erfolg meldet, auch wenn der
 * Treiber etwas anderes tut. Auf dem Testgerät wurde das Bild im Moment der
 * Sperre schlagartig dunkel. Fällt die Helligkeit ab, wird die Sperre wieder
 * aufgehoben -- ein nachregelndes Bild ist unangenehm, ein schwarzes unbrauchbar.
 */
type Belichtungszustand = 'pendelt' | 'sperrt' | 'prueft' | 'fertig';
let belichtungszustand: Belichtungszustand = 'pendelt';
let belichtungstext = 'pendelt sich ein';
let helligkeitVorSperre = 0;
let pruefungBis = 0;
let nichtMehrSperren = false;
let zuDunkel = false;

/** Ab welchem Helligkeitsverlust die Sperre als misslungen gilt. */
const SPERRE_VERLUSTGRENZE = 0.65;
/** Wie lange nach der Sperre auf einen Einbruch gewartet wird, in Millisekunden. */
const SPERRE_PRUEFDAUER = 1500;

/**
 * Gleitender Mittelwert der Messrate. Gezählt werden ausgewertete Bilder, nicht
 * Bildschirmtakte: M1 verlangt dreißig Messungen je Sekunde, und die Schleife
 * kann beliebig oft laufen, ohne dass eine einzige Messung fertig wird.
 */
let messrate = 0;
let letzteMessung = 0;
/** Damit das Standbild dieselbe Helligkeit ausweist wie das letzte Messbild. */
let letzteHelligkeit = 0;

function fehlerZeigen(text: string, hinweis = ''): void {
  startFehler.textContent = hinweis ? `${text} ${hinweis}` : text;
  startFehler.hidden = false;
}

async function messungStarten(): Promise<void> {
  if (startetGerade || laeuft) return;
  startetGerade = true;
  try {
    await starteWirklich();
  } finally {
    startetGerade = false;
  }
}

async function starteWirklich(): Promise<void> {
  startFehler.hidden = true;
  try {
    kamera = await startCamera(video);
  } catch (error) {
    if (error instanceof CameraError) fehlerZeigen(error.message, error.hint);
    else fehlerZeigen('Die Kamera lässt sich nicht öffnen.');
    return;
  }

  try {
    pipeline = createPipeline(kanten, 512);
  } catch (error) {
    kamera.stop();
    kamera = null;
    fehlerZeigen(
      error instanceof GpuError
        ? error.message
        : 'Die Grafikeinheit steht nicht zur Verfügung.',
      'Ohne WebGL2 lässt sich das Kantenbild nicht berechnen.',
    );
    return;
  }

  // Die Belichtung wird NICHT hier gesperrt. Die Automatik des Telefons
  // beginnt dunkel und braucht ein bis zwei Sekunden, bis sie den Raum
  // gefunden hat; wer vorher sperrt, friert das schwarze Anfangsbild ein.
  // Gesperrt wird erst, wenn der Wächter meldet, dass das Bild steht.

  // Zehn Sekunden ruhig halten heisst zehn Sekunden nicht tippen. Ohne diese
  // Sperre dimmt das Telefon mitten in der Messung.
  void wachhalter.anfordern();

  ansichtStart.hidden = true;
  ansichtMess.hidden = false;
  for (const v of verfahren) {
    v.glaetter.reset();
    v.ergebnis = null;
    v.konfidenz = 0;
    v.wert = null;
    v.hinweis = '';
    v.proben.length = 0;
    v.fest = null;
    v.roh = undefined;
  }
  hauptId = verfahren[0]!.metrik.id;
  bildzaehler = 0;
  weitermessen();
  stabilitaet.reset();
  unruhe.reset();
  belichtung.reset();
  belichtungszustand = 'pendelt';
  belichtungstext = 'pendelt sich ein';
  helligkeitVorSperre = 0;
  pruefungBis = 0;
  nichtMehrSperren = false;
  zuDunkel = false;
  letzteMessung = 0;
  messrate = 0;
  laeuft = true;
  requestAnimationFrame(schleife);
}

function messungBeenden(): void {
  laeuft = false;
  wachhalter.freigeben();
  pipeline?.dispose();
  pipeline = null;
  kamera?.stop();
  kamera = null;
  ansichtMess.hidden = true;
  ansichtStart.hidden = false;
}

function schleife(jetzt: number): void {
  if (!laeuft || !pipeline) return;
  requestAnimationFrame(schleife);

  if (messzustand === 'fest') {
    // Am Standbild wird nicht gemessen. Die Kette wird trotzdem leergeräumt,
    // damit beim Weitermessen kein Bild von vorhin als neuestes durchgeht.
    while (pipeline.poll() !== null) {
      /* verwerfen */
    }
    return;
  }

  pipeline.submit(video, jetzt);

  // Alles abholen, was fertig ist; ausgewertet wird nur das jüngste Bild.
  // Ältere Frames wegzuwerfen ist richtig: sie zeigen eine Kameralage, die es
  // nicht mehr gibt.
  let neuestes = pipeline.poll();
  for (;;) {
    const weiteres = pipeline.poll();
    if (!weiteres) break;
    neuestes = weiteres;
  }

  if (neuestes) {
    if (letzteMessung > 0) {
      const dt = jetzt - letzteMessung;
      if (dt > 0) messrate = messrate === 0 ? 1000 / dt : messrate * 0.85 + (1000 / dt) * 0.15;
    }
    letzteMessung = jetzt;

    const licht = belichtung.beobachte(neuestes.gray, neuestes.timestamp);
    zuDunkel = licht.zuDunkel;
    letzteHelligkeit = licht.helligkeit;
    unruhe.beobachte(neuestes.gray);

    belichtungPflegen(licht.eingependelt, licht.helligkeit, neuestes.timestamp);

    // Während die Automatik noch regelt, wandert das Kantenbild mit der
    // Helligkeit statt mit dem Motiv. Solche Bilder gehören weder in die
    // Glättung noch in die Schwankungsrechnung -- sonst misst das
    // Zehn-Sekunden-Fenster die Einpendelphase mit.
    const zaehlt = licht.eingependelt;
    bildzaehler++;

    let bericht = stabilitaet.report;

    for (const v of verfahren) {
      // Während einer Reihe rechnet jedes Verfahren bei jedem Bild. Die
      // Staffelung spart Rechenzeit im Dauerbetrieb; in den zweieinhalb
      // Sekunden einer Reihe ist jede Einzelmessung eine Stimme, und auf die
      // kommt es hier an.
      if (messzustand !== 'reihe' && bildzaehler % v.jedesNte !== 0 && v.ergebnis !== null) continue;

      // Die Rohmessung wird gebraucht, das Ergebnis auch -- aber beides aus
      // einer Rechnung. Vorher lief die Fouriertransformation zweimal.
      let ergebnis: Result;
      if (v.spezifisch) {
        const roh = parastichen(neuestes);
        v.roh = roh;
        ergebnis = parastichenErgebnis(roh);
      } else {
        ergebnis = v.metrik.run(neuestes);
      }
      const konfidenz = v.metrik.confidence(ergebnis);
      v.ergebnis = ergebnis;
      v.konfidenz = zaehlt ? konfidenz : 0;
      v.hinweis = ergebnis.caveats[0] ?? '';

      if (v.stetig) {
        const geglaettet = zaehlt ? v.glaetter.push(ergebnis.value, konfidenz) : v.glaetter.value;
        v.wert = zaehlt && v.glaetter.settled ? wertText({ ...ergebnis, value: geglaettet }) : null;
        // Die Schwankungsmessung gehört zur fraktalen Dimension -- das ist die
        // Größe, für die die Abnahmebedingung von M1 gilt.
        if (zaehlt && v.glaetter.settled) {
          bericht = stabilitaet.push(geglaettet, neuestes.timestamp);
        }
      } else {
        // Ohne Vertrauen keine Zahl. Ein Verfahren, das nichts gefunden hat,
        // soll das sagen und nicht raten.
        v.wert = zaehlt && konfidenz > 0 ? wertText(ergebnis) : null;
      }

      // Eine Stimme für die laufende Reihe. Bilder aus der Einpendelphase
      // stimmen nicht mit ab -- sie zeigen die Belichtung, nicht das Motiv.
      if (messzustand === 'reihe' && zaehlt) {
        v.proben.push({
          probe: {
            wert: ergebnis.value,
            marke: konfidenz > 0 ? wertText(ergebnis) : null,
            konfidenz,
          },
          ergebnis,
          roh: v.roh,
        });
      }
    }

    if (messzustand === 'reihe') reihePruefen(neuestes.timestamp);

    nachzeichnungPflegen();
    befundeZeigen(zustandText(licht.eingependelt, neuestes.timestamp), licht.helligkeit, bericht);
  }

  if (zeigeKanten) {
    const kante = Math.min(kanten.clientWidth, kanten.clientHeight) || 512;
    // Dieselbe Schwelle, mit der gezaehlt wurde -- der Shader rechnet in
    // Anteilen von eins, die Metrik in Graustufen.
    const schwelle = (verfahren[0]?.ergebnis?.detail['threshold'] ?? 20) / 255;
    pipeline.present(kante, kante, schwelle);
  }
}

/** Nachgezeichnet wird nur, was auch gefunden wurde. */
function nachzeichnungPflegen(): void {
  const spirale = verfahren.find((v) => !v.stetig);
  if (spirale && spirale.konfidenz >= 0.6 && spirale.roh) {
    nachzeichner.spiralen(
      spirale.roh.familien,
      (spirale.ergebnis?.detail['treffer'] ?? 0) === 1,
      LOGPOLAR_STANDARD,
    );
  } else {
    nachzeichner.loeschen();
  }
}

function befundeZeigen(zustand: string, helligkeit: number, bericht: StabilityReport): void {
  const haupt = hauptWaehlen();
  // Das aussagekräftigste zuerst, dann die übrigen -- alle in einer Liste.
  const sortiert = [haupt, ...verfahren.filter((v) => v !== haupt)];

  anzeige.zeige({
    befunde: sortiert.map((v) => alsBefund(v)),
    zustand,
    stabil: bericht.stable,
    schwankung: bericht.samples > 1 ? bericht.span : null,
    sekunden: bericht.seconds,
    detail: haupt.ergebnis?.detail ?? {},
    helligkeit,
    unruhe: unruhe.wert,
    messrate,
    belichtung: belichtungstext,
    stand: __BAUZEIT__,
  });
}

/**
 * Prüft, ob die laufende Messreihe lang genug ist.
 *
 * Zwei Bedingungen, und die Zeit allein genügt nicht: Auf einem langsamen
 * Gerät kämen in zweieinhalb Sekunden womöglich fünf Einzelmessungen zustande,
 * und aus fünf Stimmen wird keine Abstimmung. Deshalb läuft die Reihe
 * notfalls länger -- aber nicht unbegrenzt, sonst hält niemand still.
 */
function reihePruefen(jetzt: number): void {
  const verstrichen = jetzt - reiheSeit;
  const proben = verfahren[0]?.proben.length ?? 0;
  const genug = proben >= REIHE_MINDESTPROBEN;
  if ((verstrichen >= REIHE_DAUER && genug) || verstrichen >= REIHE_HOECHSTDAUER) {
    reiheAbschliessen(verstrichen);
  }
}

/** Startet eine Messreihe. */
function reiheStarten(jetzt: number): void {
  for (const v of verfahren) {
    v.proben.length = 0;
    v.fest = null;
  }
  unruhe.gipfelZuruecksetzen();
  reiheSeit = jetzt;
  reiheDauer = 0;
  messzustand = 'reihe';
  knopfBeschriften();
}

/**
 * Schließt die Reihe ab: Aus vielen Einzelmessungen wird ein Befund, und aus
 * dem laufenden Bild ein Standbild.
 */
function reiheAbschliessen(dauer: number): void {
  reiheDauer = dauer / 1000;

  for (const v of verfahren) {
    const proben = v.proben.map((p) => p.probe);
    // Stetig oder ganzzahlig -- dieselbe Unterscheidung wie bei der Glättung,
    // und aus demselben Grund: Ein Mittel aus 34 und 55 wäre 44,5.
    const befund: Reihenbefund = v.stetig ? fasseStetig(proben) : fasseDiskret(proben);
    const vertreter = befund.vertreter >= 0 ? v.proben[befund.vertreter] : undefined;

    if (vertreter) {
      v.ergebnis = vertreter.ergebnis;
      v.roh = vertreter.roh;
    }

    v.fest = festbefundBauen(v, befund, vertreter?.ergebnis);
    v.konfidenz = v.fest.wert === null ? 0 : befund.konfidenz;
    v.wert = v.fest.wert;
    v.hinweis = festhinweis(befund, vertreter?.ergebnis);
    // Die Einzelmessungen haben ihren Dienst getan; der Befund steht.
    v.proben.length = 0;
  }

  standbildZeichnen();
  // Das Kantenbild einmal einfrieren, mit der Schwelle des vertretenden
  // Bildes. Danach wird nicht mehr gezeichnet, und der Knopf "Kanten zeigen"
  // blendet das stehende Bild nur noch ein und aus.
  if (pipeline) {
    const kante = Math.min(kanten.clientWidth, kanten.clientHeight) || 512;
    pipeline.present(kante, kante, (verfahren[0]?.ergebnis?.detail['threshold'] ?? 20) / 255);
  }

  messzustand = 'fest';
  knopfBeschriften();
  nachzeichnungPflegen();
  befundeZeigen(zustandText(true, 0), letzteHelligkeit, stabilitaet.report);
}

/**
 * Macht aus der Zusammenfassung das, was dasteht.
 *
 * Die Hürde `EINIGKEIT_MINDEST` ist der Kern: Ein Wert, über den sich die
 * Reihe nicht einig war, wird nicht angezeigt. Eine Zahl, die aus sechs von
 * achtundfünfzig Bildern stammt, ist keine Messung, sondern eine Behauptung --
 * und die aufzustellen ist der gefährlichere Fehler.
 */
function festbefundBauen(
  v: Verfahren,
  befund: Reihenbefund,
  ergebnis: Result | undefined,
): Festbefund {
  const reihe = { proben: befund.proben, traeger: befund.traeger, spanne: befund.spanne };
  const tragfaehig =
    befund.marke !== null && ergebnis !== undefined && befund.einigkeit >= EINIGKEIT_MINDEST;

  if (!tragfaehig) {
    return { wert: null, zahl: 0, deutung: '', treffer: false, reihe };
  }

  // Beim stetigen Verfahren ist der Median der Befund, nicht der Wert des
  // vertretenden Bildes -- das Bild steht nur für die Zwischenwerte.
  const wert = v.stetig ? wertText({ ...ergebnis, value: befund.wert }) : befund.marke;

  return {
    wert,
    zahl: befund.wert,
    deutung: ergebnis.deutung ?? '',
    treffer: (ergebnis.detail['treffer'] ?? 0) === 1,
    reihe,
  };
}

/** Warum ein festgehaltener Befund unsicher ist -- oder gar keiner wurde. */
function festhinweis(befund: Reihenbefund, ergebnis: Result | undefined): string {
  if (befund.proben === 0) return 'keine Messung zustande gekommen – Belichtung war unruhig';
  if (befund.marke === null) return ergebnis?.caveats[0] ?? 'in dieser Reihe nichts gefunden';
  if (befund.einigkeit < EINIGKEIT_MINDEST) {
    return `die Messungen widersprechen einander – ${befund.traeger} von ${befund.proben}`;
  }
  return ergebnis?.caveats[0] ?? '';
}

/** Zurück in den laufenden Betrieb. */
function weitermessen(): void {
  messzustand = 'live';
  reiheDauer = 0;
  standbild.hidden = true;
  for (const v of verfahren) {
    v.fest = null;
    v.proben.length = 0;
  }
  // Das Zehn-Sekunden-Fenster hat ein Loch, solange das Standbild stand.
  // Ein Fenster mit Loch misst nicht mehr, was es zu messen vorgibt.
  stabilitaet.reset();
  knopfBeschriften();
}

/**
 * Zeichnet das laufende Bild als Standbild.
 *
 * Genommen wird derselbe mittige quadratische Ausschnitt, den auch die Messung
 * sieht -- ein Standbild, das mehr zeigt als gemessen wurde, wäre irreführend.
 * Es ist das Bild vom Ende der Reihe, nicht das eine vertretende Bild: Bei
 * ruhiger Hand ist das dasselbe Motiv, und ein Graustufenbild aus dem
 * Rechenpfad wäre schlechter zu erkennen als das Kamerabild.
 */
function standbildZeichnen(): void {
  const breite = video.videoWidth;
  const hoehe = video.videoHeight;
  if (breite === 0 || hoehe === 0) return;
  const kante = Math.min(breite, hoehe);
  const seite = Math.min(kante, 1024);
  standbild.width = seite;
  standbild.height = seite;
  const ctx = standbild.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(video, (breite - kante) / 2, (hoehe - kante) / 2, kante, kante, 0, 0, seite, seite);
  standbild.hidden = false;
}

function knopfBeschriften(): void {
  messTitel.textContent = messzustand === 'fest' ? 'Festgehalten' : 'Befund';
  festhaltenKnopf.disabled = messzustand === 'reihe';
  festhaltenKnopf.textContent =
    messzustand === 'fest'
      ? 'Weiter messen'
      : messzustand === 'reihe'
        ? 'Messreihe läuft …'
        : 'Messung festhalten';
}

/**
 * Wählt, welches Verfahren groß dasteht: das mit dem höchsten Vertrauen.
 * Der Wechsel braucht einen Vorsprung, sonst springt die Überschrift hin und
 * her, sobald zwei Verfahren gleich sicher sind.
 */
function hauptWaehlen(): Verfahren {
  const bisher = verfahren.find((v) => v.metrik.id === hauptId) ?? verfahren[0]!;

  // Ein spezifisches Verfahren, das etwas gefunden hat, geht vor. Es meldet
  // sich selten; wenn doch, ist es der Grund, warum jemand die App aufmacht.
  const sonder = verfahren
    .filter((v) => v.spezifisch && v.konfidenz >= SONDERBEFUND_AB)
    .sort((a, b) => b.konfidenz - a.konfidenz)[0];
  if (sonder) {
    hauptId = sonder.metrik.id;
    return sonder;
  }

  let beste = bisher;
  for (const v of verfahren) {
    if (v === bisher) continue;
    if (v.konfidenz > beste.konfidenz + (beste === bisher ? WECHSELVORSPRUNG : 0)) beste = v;
  }
  hauptId = beste.metrik.id;
  return beste;
}

function alsBefund(v: Verfahren): Befund {
  const skala = v.metrik.skala;
  const fest = v.fest;
  const wertZahl = fest ? fest.zahl : v.stetig ? v.glaetter.value : (v.ergebnis?.value ?? 0);
  return {
    id: v.metrik.id,
    name: v.metrik.label,
    wert: v.wert,
    konfidenz: v.konfidenz,
    treffer: v.wert !== null && (fest ? fest.treffer : (v.ergebnis?.detail['treffer'] ?? 0) === 1),
    hinweis: v.hinweis,
    deutung: fest ? fest.deutung : (v.ergebnis?.deutung ?? ''),
    reihe: fest && fest.wert !== null ? fest.reihe : undefined,
    skala: skala
      ? {
          ...skala,
          anteil: Math.max(0, Math.min(1, (wertZahl - skala.min) / (skala.max - skala.min))),
        }
      : undefined,
  };
}

/**
 * Über dem Bild steht nur, was mit dem Bild selbst nicht stimmt. Alles andere
 * gehört zu einem bestimmten Verfahren und steht in dessen Zeile.
 */
function zustandText(eingependelt: boolean, jetzt: number): string {
  // Das Standbild ist ein Zustand des Bildes und gehört deshalb hierher --
  // und es muss dastehen, sonst hält man ein eingefrorenes Bild für ein
  // stehengebliebenes.
  if (messzustand === 'fest') {
    return `Standbild – Messreihe über ${reiheDauer.toLocaleString('de-DE', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} s`;
  }
  if (messzustand === 'reihe') {
    const verstrichen = Math.max(0, (jetzt - reiheSeit) / 1000);
    return `Messreihe läuft – ruhig halten (${verstrichen.toLocaleString('de-DE', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} s)`;
  }
  if (!eingependelt) return 'Belichtung pendelt sich ein …';
  if (zuDunkel) return 'Zu dunkel – mehr Licht';
  return '';
}

function wertText(ergebnis: Result): string {
  // Zwei Spiralenzahlen passen in keine einzelne Zahl -- dafuer gibt es label.
  return (
    ergebnis.label ??
    ergebnis.value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

/**
 * Sperrt die Belichtung, sobald das Bild steht -- und nimmt die Sperre zurück,
 * wenn das Bild dadurch dunkel geworden ist.
 */
function belichtungPflegen(eingependelt: boolean, helligkeit: number, jetzt: number): void {
  if (!kamera) return;

  if (belichtungszustand === 'pendelt') {
    if (!eingependelt) return;
    if (nichtMehrSperren) {
      belichtungszustand = 'fertig';
      return;
    }
    belichtungszustand = 'sperrt';
    helligkeitVorSperre = helligkeit;
    const beim = kamera;
    void beim.lockExposure().then((erfolg) => {
      if (kamera !== beim) return;
      if (!erfolg.exposure) {
        belichtungszustand = 'fertig';
        belichtungstext = 'Automatik';
        return;
      }
      belichtungszustand = 'prueft';
      belichtungstext = 'gesperrt, wird geprüft';
      pruefungBis = jetzt + SPERRE_PRUEFDAUER;
    });
    return;
  }

  if (belichtungszustand === 'prueft') {
    const eingebrochen =
      helligkeitVorSperre > 0 && helligkeit < helligkeitVorSperre * SPERRE_VERLUSTGRENZE;
    if (eingebrochen) {
      // Der Treiber ist beim Umschalten nicht stehengeblieben. Zurück zur
      // Automatik und nicht noch einmal versuchen.
      nichtMehrSperren = true;
      belichtungszustand = 'pendelt';
      belichtungstext = 'Automatik – Sperre verworfen';
      const beim = kamera;
      void beim.unlockExposure();
      // Das Bild ändert sich jetzt wieder; der bisherige Verlauf gehört zu
      // einer Belichtung, die es nicht mehr gibt.
      belichtung.reset();
      for (const v of verfahren) v.glaetter.reset();
      stabilitaet.reset();
      return;
    }
    if (jetzt >= pruefungBis) {
      belichtungszustand = 'fertig';
      belichtungstext = 'gesperrt';
    }
  }
}


frag<HTMLButtonElement>('#knopf-start').addEventListener('click', () => {
  void messungStarten();
});

frag<HTMLButtonElement>('#knopf-zurueck').addEventListener('click', messungBeenden);

const festhaltenKnopf = frag<HTMLButtonElement>('#knopf-festhalten');
festhaltenKnopf.addEventListener('click', () => {
  if (messzustand === 'fest') weitermessen();
  else if (messzustand === 'live') reiheStarten(performance.now());
});

const kantenKnopf = frag<HTMLButtonElement>('#knopf-kanten');
kantenKnopf.addEventListener('click', () => {
  zeigeKanten = !zeigeKanten;
  kantenKnopf.setAttribute('aria-pressed', String(zeigeKanten));
  kantenKnopf.textContent = zeigeKanten ? 'Kanten verbergen' : 'Kanten zeigen';
  kanten.hidden = !zeigeKanten;
});

// Kamera und Grafikkontext freigeben, wenn die App in den Hintergrund geht.
// Sonst leuchtet die Kameraanzeige des Telefons weiter.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && laeuft) messungBeenden();
});

/**
 * Der Dienstarbeiter macht die App im Wald ohne Empfang benutzbar. Er meldet
 * sich nur im gebauten Stand an -- beim Entwickeln wäre ein Zwischenspeicher,
 * der ungefragt alte Dateien ausliefert, das Gegenteil von hilfreich.
 *
 * Der Pfad hängt an BASE_URL, damit es auch unter einem Unterverzeichnis
 * stimmt (GitHub Pages). Schlägt die Anmeldung fehl, läuft die App trotzdem,
 * nur eben nicht offline -- das ist kein Grund, den Start abzubrechen.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const basis = import.meta.env.BASE_URL;
    void navigator.serviceWorker
      .register(`${basis}sw.js`, { scope: basis })
      .catch((error: unknown) => {
        console.warn('Ohne Dienstarbeiter kein Offlinebetrieb:', error);
      });
  });
}

import './styles.css';
import { CameraError, startCamera, type CameraHandle } from './camera/camera.ts';
import { createBelichtungswaechter } from './camera/belichtung.ts';
import { createWachhalter } from './camera/wakeLock.ts';
import { createPipeline, type Pipeline } from './gpu/pipeline.ts';
import { GpuError } from './gpu/context.ts';
import { createBoxCountingMetric } from './metrics/boxCounting.ts';
import { createParastichenMetric } from './metrics/parastichen.ts';
import type { Metric, Result } from './metrics/types.ts';
import { createSmoother, createStabilityTracker } from './calibration/stability.ts';
import { createAnzeige } from './ui/anzeige.ts';

function frag<T extends Element>(wahl: string): T {
  const element = document.querySelector<T>(wahl);
  if (!element) throw new Error(`Element fehlt: ${wahl}`);
  return element;
}

const ansichtStart = frag<HTMLElement>('#ansicht-start');
const ansichtMess = frag<HTMLElement>('#ansicht-mess');
const blatt = frag<HTMLElement>('#blatt');
const blattText = frag<HTMLElement>('#blatt-text');
const startFehler = frag<HTMLElement>('#start-fehler');
const video = frag<HTMLVideoElement>('#video');
const kanten = frag<HTMLCanvasElement>('#kanten');

/**
 * Die Verfahren. Beide erfuellen dieselbe Schnittstelle, die Anzeige muss
 * keines von beiden kennen.
 *
 * Box-Counting laeuft auf jedem Motiv. Parastichen brauchen einen Bluetenstand,
 * frontal und formatfuellend -- deshalb ein eigener Modus und keine
 * Dauermessung nebenher.
 */
const VERFAHREN: Record<'flaeche' | 'spirale', Metric> = {
  flaeche: createBoxCountingMetric(),
  spirale: createParastichenMetric(),
};
type Modus = keyof typeof VERFAHREN;
let modus: Modus = 'flaeche';
let metrik: Metric = VERFAHREN.flaeche;
const glaetter = createSmoother();
const stabilitaet = createStabilityTracker();
const anzeige = createAnzeige();
const wachhalter = createWachhalter();
const belichtung = createBelichtungswaechter();

let kamera: CameraHandle | null = null;
let pipeline: Pipeline | null = null;
let laeuft = false;
/** Verhindert, dass ein zweiter Tippen den Start doppelt anstoesst. */
let startetGerade = false;
let zeigeKanten = false;

/** 'pendelt' → 'gesperrt' oder 'Automatik', siehe camera/belichtung.ts. */
let belichtungstext = 'pendelt sich ein';
let sperreLaeuft = false;
let gesperrt = false;
let zuDunkel = false;

/**
 * Gleitender Mittelwert der Messrate. Gezählt werden ausgewertete Bilder, nicht
 * Bildschirmtakte: M1 verlangt dreißig Messungen je Sekunde, und die Schleife
 * kann beliebig oft laufen, ohne dass eine einzige Messung fertig wird.
 */
let messrate = 0;
let letzteMessung = 0;

/** Letztes Ergebnis, damit die Anzeige zwischen zwei Messungen nicht leer wird. */
let letztesErgebnis: Result | null = null;

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
  glaetter.reset();
  stabilitaet.reset();
  belichtung.reset();
  belichtungstext = 'pendelt sich ein';
  sperreLaeuft = false;
  gesperrt = false;
  zuDunkel = false;
  letztesErgebnis = null;
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

    // Erst wenn das Bild steht, wird die Belichtung festgehalten. Genau einmal.
    if (licht.eingependelt && !gesperrt && !sperreLaeuft && kamera) {
      sperreLaeuft = true;
      void kamera.lockExposure().then((erfolg) => {
        gesperrt = true;
        belichtungstext = erfolg.exposure ? 'gesperrt' : 'Automatik';
      });
    }

    const ergebnis = metrik.run(neuestes);
    const konfidenz = metrik.confidence(ergebnis);
    letztesErgebnis = ergebnis;

    // Während die Automatik noch regelt, wandert das Kantenbild mit der
    // Helligkeit statt mit dem Motiv. Solche Bilder gehören weder in die
    // Glättung noch in die Schwankungsrechnung -- sonst misst das
    // Zehn-Sekunden-Fenster die Einpendelphase mit.
    const zaehlt = licht.eingependelt;
    // Geglaettet wird nur, wo eine stetige Groesse gemessen wird. Eine
    // Spiralenzahl ist ganzzahlig; ein Mittelwert aus 34 und 55 waere 44,5 und
    // damit eine Zahl, die es nicht gibt.
    const stetig = ergebnis.label === undefined;
    const geglaettet = zaehlt ? glaetter.push(ergebnis.value, konfidenz) : glaetter.value;
    const bericht =
      zaehlt && stetig && glaetter.settled
        ? stabilitaet.push(geglaettet, neuestes.timestamp)
        : stabilitaet.report;

    const zeigeWert = zaehlt && (stetig ? glaetter.settled : konfidenz > 0);

    anzeige.zeige({
      verfahren: metrik.label,
      wert: zeigeWert
        ? stetig
          ? wertText({ ...ergebnis, value: geglaettet })
          : wertText(ergebnis)
        : null,
      konfidenz: zaehlt ? konfidenz : 0,
      stabil: bericht.stable,
      treffer: zeigeWert && (ergebnis.detail['treffer'] ?? 0) === 1,
      hinweis: hinweisText(ergebnis, konfidenz, bericht.stable, licht.eingependelt),
      schwankung: stetig && bericht.samples > 1 ? bericht.span : null,
      sekunden: bericht.seconds,
      detail: ergebnis.detail,
      helligkeit: licht.helligkeit,
      messrate,
      belichtung: belichtungstext,
    });
  }

  if (zeigeKanten) {
    const kante = Math.min(kanten.clientWidth, kanten.clientHeight) || 512;
    pipeline.present(kante, kante);
  }
}

function wertText(ergebnis: Result): string {
  // Zwei Spiralenzahlen passen in keine einzelne Zahl -- dafuer gibt es label.
  return (
    ergebnis.label ??
    ergebnis.value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

function hinweisText(
  ergebnis: Result,
  konfidenz: number,
  stabil: boolean,
  eingependelt: boolean,
): string {
  // Die Reihenfolge ist die Rangfolge: was der Nutzer zuerst beheben kann,
  // steht zuerst. Eine noch laufende Belichtungsautomatik erklärt jeden
  // anderen Vorbehalt gleich mit.
  if (!eingependelt) return 'Belichtung pendelt sich ein …';
  if (zuDunkel) return 'zu dunkel – mehr Licht oder heller belichten';
  if (ergebnis.caveats.length > 0) return ergebnis.caveats[0]!;
  if (konfidenz < 0.6) return 'Messung noch unsicher';
  if (stabil) return 'Wert steht ruhig';
  return 'ruhig halten';
}

frag<HTMLButtonElement>('#knopf-start').addEventListener('click', () => {
  void messungStarten();
});

frag<HTMLButtonElement>('#knopf-zurueck').addEventListener('click', messungBeenden);

const halteanweisung = frag<HTMLElement>('#halteanweisung');
const modusKnoepfe: Array<[Modus, HTMLButtonElement]> = [
  ['flaeche', frag<HTMLButtonElement>('#modus-flaeche')],
  ['spirale', frag<HTMLButtonElement>('#modus-spirale')],
];

function modusWaehlen(neu: Modus): void {
  if (neu === modus) return;
  modus = neu;
  metrik = VERFAHREN[neu];
  // Der alte Verlauf gehoert zum alten Verfahren. Ihn stehenzulassen hiesse,
  // die Schwankung einer Groesse zu zeigen, die gar nicht mehr gemessen wird.
  glaetter.reset();
  stabilitaet.reset();
  letztesErgebnis = null;
  halteanweisung.hidden = neu !== 'spirale';
  for (const [name, knopf] of modusKnoepfe) {
    knopf.setAttribute('aria-pressed', String(name === neu));
  }
}

for (const [name, knopf] of modusKnoepfe) {
  knopf.addEventListener('click', () => modusWaehlen(name));
}

frag<HTMLButtonElement>('#knopf-erklaeren').addEventListener('click', () => {
  blattText.textContent = letztesErgebnis
    ? metrik.explain(letztesErgebnis)
    : 'Noch kein Messwert. Die Erklärung füllt sich, sobald etwas gemessen wurde.';
  blatt.hidden = false;
});

frag<HTMLButtonElement>('#knopf-blatt-zu').addEventListener('click', () => {
  blatt.hidden = true;
});

const kantenKnopf = frag<HTMLButtonElement>('#knopf-kanten');
kantenKnopf.addEventListener('click', () => {
  zeigeKanten = !zeigeKanten;
  kantenKnopf.setAttribute('aria-pressed', String(zeigeKanten));
  kantenKnopf.textContent = zeigeKanten ? 'Kamerabild zeigen' : 'Kantenbild zeigen';
  kanten.hidden = !zeigeKanten;
  video.style.visibility = zeigeKanten ? 'hidden' : 'visible';
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

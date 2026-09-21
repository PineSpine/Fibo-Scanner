import type { Frame, Metric, Result } from './types.ts';
import { SPIRALEN_PHAENOMEN, benachbarteFibonacci, sucheMitte } from './parastichen.ts';

/**
 * Spiralen zählen wie ein Botaniker: Blütchen finden, Nachbarn verbinden,
 * Ketten zählen.
 *
 * Warum nicht mehr über die Fouriertransformation (parastichen.ts): Sie zählt
 * indirekt, über ein Spektrum des ganzen Rings. An gerechneten Blütenständen
 * gelingt das, an echten Fotos nicht -- die Gipfel blieben dort bei 13 bis 40,
 * weit unter jeder brauchbaren Schwelle, und lagen oft um eins bis vier neben
 * der richtigen Zahl. Auch an den Originalbildern, nicht nur an Bildschirm-
 * fotos. Echte Blütenstände sind unregelmäßig: Spiralen enden, spalten sich,
 * wechseln ihre Zahl mit dem Radius. Ein globales Spektrum verschmiert das.
 *
 * Dieses Verfahren arbeitet lokal:
 *
 *   1. Blütchen finden -- runde Flecken, hell oder dunkel, in jeder Größe.
 *      Jede Fleckgröße und Helligkeit ergibt ein eigenes Gitter.
 *   2. Jedes Blütchen mit seinem nächsten Nachbarn weiter außen verbinden,
 *      einmal linksdrehend, einmal rechtsdrehend. Das sind die beiden Scharen.
 *   3. Für einen Kreis zählen, wie viele Verbindungen einer Schar ihn kreuzen.
 *      Jede Spirale kreuzt jeden Kreis genau einmal -- die Zahl der
 *      Kreuzungen ist die Zahl der Spiralen, von Natur aus ganzzahlig.
 *   4. Fehlende und doppelt erkannte Blütchen an der Lückengröße erkennen und
 *      ausgleichen, und nur Gitter zählen lassen, deren Kreuzungen gleichmäßig
 *      liegen.
 *
 * Gemessen (scripts/ketten-probe.ts): gerechnete Blütenstände, verrauscht und
 * versetzt, exakt -- samt der Abfolge 13/21 → 21/34 → 34/55 → 55/89 nach
 * außen. Echte Fotos: in der richtigen Gegend, oft genau, aber nicht
 * verlässlich genau; typisch eins bis vier daneben. Deshalb unterscheidet das
 * Ergebnis zwischen exakt und ungefähr, und nur exakt darf ein Urteil tragen.
 */

export interface Fleck {
  x: number;
  y: number;
}

/** Ein Blütchengitter: Flecken einer Größe und ihre Verbindungen nach außen. */
export interface Gitter {
  sigma: number;
  hell: boolean;
  flecken: readonly Fleck[];
  /** Index des linksdrehenden Nachbarn weiter außen, sonst -1. */
  links: Int32Array;
  /** Index des rechtsdrehenden Nachbarn weiter außen, sonst -1. */
  rechts: Int32Array;
}

/** Was an einem Ring gezählt wurde, zusammengefasst über alle Gitter. */
export interface Ringzaehlung {
  radius: number;
  klein: number;
  gross: number;
  /** Wie viele Gitter an diesem Ring sauber gezählt haben. */
  gitter: number;
  /** Anteil dieser Gitter, die genau das Paar (klein, gross) gezählt haben. */
  einig: number;
}

/** Eine gezeichnete Verbindung, in Pixeln des Frames. */
export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 0: linksdrehende Schar, 1: rechtsdrehende. */
  schar: 0 | 1;
}

export interface KettenRoh {
  mitte: { x: number; y: number };
  ringe: readonly Ringzaehlung[];
  /** Das Paar [klein, gross], oder null, wenn nichts zählbar war. */
  paar: readonly [number, number] | null;
  /**
   * Exakt heißt: Mindestens zwei benachbarte Ringe zählen genau dasselbe
   * Paar, und in jedem ist sich die Mehrheit der Gitter einig. Nur dann darf
   * das Ergebnis ein Fibonacci-Urteil tragen.
   */
  exakt: boolean;
  /** Um wie viel die Zählung schwankt, als ± in Spiralen. */
  genauigkeit: number;
  /** Wie viele Gitter über die tragenden Ringe zusammen gezählt haben. */
  stuetze: number;
  /** Aus wie vielen Bildern die Stimmen stammen. */
  bilder: number;
  treffer: boolean;
  /** Die gezählten Verbindungen im tragenden Bereich, zum Nachzeichnen. */
  segmente: readonly Segment[];
}

// ---------------------------------------------------------------- Weichzeichnen

/**
 * Drei Kastenfilter hintereinander nähern eine Gaußglocke.
 * Quelle: P. Kovesi, "Fast Almost-Gaussian Filtering", DICTA 2010.
 * Kostet je Pixel gleich viel, egal wie breit -- der Grund, warum sechzehn
 * Größenstufen überhaupt in einer Sekunde gehen.
 */
function kastenBreiten(sigma: number): number[] {
  const n = 3;
  const ideal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let unten = Math.floor(ideal);
  if (unten % 2 === 0) unten--;
  const oben = unten + 2;
  const m = Math.round((12 * sigma * sigma - n * unten * unten - 4 * n * unten - 3 * n) / (-4 * unten - 4));
  return Array.from({ length: n }, (_, i) => (i < m ? unten : oben));
}

function kasten(
  quelle: Float32Array,
  ziel: Float32Array,
  r: number,
  schritt: number,
  laenge: number,
  zeilen: number,
  zeilenschritt: number,
): void {
  const f = 1 / (2 * r + 1);
  const letzte = laenge - 1;
  for (let z = 0; z < zeilen; z++) {
    const o = z * zeilenschritt;
    // Am Rand wird der erste bzw. letzte Wert wiederholt. Ohne eigene
    // Hilfsfunktion je Zugriff -- die kostete hier die Hälfte der Rechenzeit.
    let s = (r + 1) * quelle[o]!;
    for (let i = 0; i < r; i++) s += quelle[o + (i < letzte ? i : letzte) * schritt]!;
    for (let i = 0; i < laenge; i++) {
      const rein = i + r < letzte ? i + r : letzte;
      const raus = i - r - 1 > 0 ? i - r - 1 : 0;
      s += quelle[o + rein * schritt]! - quelle[o + raus * schritt]!;
      ziel[o + i * schritt] = s * f;
    }
  }
}

function gauss(bild: Float32Array, breite: number, hoehe: number, sigma: number): Float32Array {
  const a = Float32Array.from(bild);
  const b = new Float32Array(bild.length);
  for (const w of kastenBreiten(sigma)) {
    const r = (w - 1) / 2;
    kasten(a, b, r, 1, breite, hoehe, breite);
    kasten(b, a, r, breite, hoehe, breite, 1);
  }
  return a;
}

// ------------------------------------------------------------------- Flecken

/**
 * Flecken genau einer Größe: lokale Maxima der Differenz zweier
 * Weichzeichnungen (Difference of Gaussians). Quelle: D. G. Lowe, "Distinctive
 * Image Features from Scale-Invariant Keypoints", IJCV 60(2), 2004 -- hier
 * ohne Größenauswahl über die Stufen hinweg, mit Absicht: Jede Stufe wird ein
 * eigenes Gitter. Zapfenschuppen wachsen nach außen, Sonnenblumenblütchen
 * nicht; welche Größe an welchem Radius stimmt, entscheidet später die
 * Regelmäßigkeit der Kreuzungen, nicht der Fleckdetektor.
 */
function fleckenEbene(d: Float32Array, breite: number, hoehe: number, sigma: number): Fleck[] {
  // Schwelle relativ zur Ebene: das 99-Perzentil der positiven Antworten.
  const stichprobe: number[] = [];
  for (let i = 0; i < d.length; i += 7) if (d[i]! > 0) stichprobe.push(d[i]!);
  stichprobe.sort((x, y) => x - y);
  const oben = stichprobe[Math.floor(stichprobe.length * 0.99)] ?? 0;
  const schwelle = Math.max(0.5, 0.12 * oben);
  const r = Math.max(1, Math.round(sigma));

  const raus: Fleck[] = [];
  for (let y = r; y < hoehe - r; y++) {
    for (let x = r; x < breite - r; x++) {
      const v = d[y * breite + x]!;
      if (v < schwelle) continue;
      // Erst die direkten Nachbarn -- das verwirft fast alles billig. Nur wer
      // das übersteht, wird gegen die ganze Umgebung der Fleckgröße geprüft.
      if (
        d[y * breite + x - 1]! > v ||
        d[y * breite + x + 1]! > v ||
        d[(y - 1) * breite + x]! > v ||
        d[(y + 1) * breite + x]! > v
      ) continue;
      let maximum = true;
      for (let dy = -r; dy <= r && maximum; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if ((dx !== 0 || dy !== 0) && d[(y + dy) * breite + x + dx]! > v) {
            maximum = false;
            break;
          }
        }
      }
      if (maximum) raus.push({ x, y });
    }
  }
  return raus;
}

/**
 * Für jeden Fleck den nächsten Nachbarn weiter außen, einmal linksdrehend und
 * einmal rechtsdrehend.
 *
 * "Weiter außen": Die Verbindung muss wenigstens zu 15 % nach außen zeigen,
 * sonst läuft sie entlang des Kreises und gehört zu keiner Spirale. "Nächster":
 * höchstens das 1,8-Fache des Abstands zum allernächsten Nachbarn -- weiter weg
 * liegt schon das übernächste Blütchen derselben Spirale.
 *
 * Versucht und verworfen: die Verbindung nach der typischen Richtung ihrer
 * Schar wählen statt nach der Länge, um die dritte, gleichsinnig drehende
 * Schar (bei 34/55 die 89er) herauszuhalten. An einzelnen Sonnenblumen half
 * das, insgesamt schadete es: An den Übergängen -- 21/34 wird 34/55 -- wechselt
 * die typische Richtung innerhalb eines Ringbands, und die Regel tauschte dort
 * richtige Verbindungen gegen falsche. Gerechnete Blütenstände verloren ein
 * Drittel ihrer Stütze, ein Zapfen fiel ganz heraus.
 */
function verbinde(flecken: readonly Fleck[], cx: number, cy: number, sigma: number): { links: Int32Array; rechts: Int32Array } {
  const zelle = Math.max(4, Math.ceil(6 * sigma));
  const raster = new Map<number, number[]>();
  const schluessel = (gx: number, gy: number): number => gy * 4096 + gx;
  flecken.forEach((p, i) => {
    const k = schluessel(Math.floor(p.x / zelle), Math.floor(p.y / zelle));
    const liste = raster.get(k);
    if (liste) liste.push(i);
    else raster.set(k, [i]);
  });

  const links = new Int32Array(flecken.length).fill(-1);
  const rechts = new Int32Array(flecken.length).fill(-1);

  for (let i = 0; i < flecken.length; i++) {
    const p = flecken[i]!;
    const rx = p.x - cx;
    const ry = p.y - cy;
    const r = Math.hypot(rx, ry);
    if (r < 2) continue;

    const gx = Math.floor(p.x / zelle);
    const gy = Math.floor(p.y / zelle);
    const nah: Array<[number, number]> = [];
    let naechster = Infinity;
    for (let j = -1; j <= 1; j++) {
      for (let k = -1; k <= 1; k++) {
        for (const q of raster.get(schluessel(gx + k, gy + j)) ?? []) {
          if (q === i) continue;
          const d = Math.hypot(flecken[q]!.x - p.x, flecken[q]!.y - p.y);
          nah.push([q, d]);
          if (d < naechster) naechster = d;
        }
      }
    }

    const ex = rx / r;
    const ey = ry / r;
    let besterLinks = Infinity;
    let besterRechts = Infinity;
    for (const [q, d] of nah) {
      if (d > 1.8 * naechster) continue;
      const vx = flecken[q]!.x - p.x;
      const vy = flecken[q]!.y - p.y;
      const nachAussen = vx * ex + vy * ey;
      const quer = -vx * ey + vy * ex;
      if (nachAussen < 0.15 * d) continue;
      if (quer > 0 && d < besterLinks) {
        besterLinks = d;
        links[i] = q;
      }
      if (quer < 0 && d < besterRechts) {
        besterRechts = d;
        rechts[i] = q;
      }
    }
  }
  return { links, rechts };
}

/** Alle Gitter eines Bildes: je Fleckgröße und Helligkeit eines. */
export function findeGitter(frame: Frame, cx: number, cy: number): Gitter[] {
  const { width: breite, height: hoehe } = frame;
  const bild = Float32Array.from(frame.gray);
  // Größenstufen von 1,4 bis 22 Pixeln im Faktor 1,2 -- vom Sonnenblumen-
  // blütchen am Rand eines 512er Bildes bis zur Zapfenschuppe.
  const stufen: number[] = [];
  for (let s = 1.4; s < 22; s *= 1.2) stufen.push(s);
  const glatt = stufen.map((s) => gauss(bild, breite, hoehe, s));

  const gitter: Gitter[] = [];
  for (let i = 0; i + 1 < glatt.length; i++) {
    const fein = glatt[i]!;
    const grob = glatt[i + 1]!;
    for (const hell of [true, false]) {
      const d = new Float32Array(bild.length);
      for (let p = 0; p < d.length; p++) d[p] = hell ? fein[p]! - grob[p]! : grob[p]! - fein[p]!;
      const sigma = stufen[i]! * 1.1;
      const flecken = fleckenEbene(d, breite, hoehe, sigma);
      gitter.push({ sigma, hell, flecken, ...verbinde(flecken, cx, cy, sigma) });
    }
  }
  return gitter;
}

// ------------------------------------------------------------------ Zählen

/**
 * Unter dieser Regelmäßigkeit zählt ein Gitter an einem Ring nicht mit.
 * Gemessen: Auf Backsteinwand, Baum, fraktaler Fläche und Zinnie erreicht bei
 * 0,6 fast kein Gitter zwei verschiedene Zahlen; bei 0,5 fangen Rauschen und
 * Dahlie an, einzelne Ringe zu füllen.
 */
const REGELMAESSIG_AB = 0.6;

/** Zählt die Kreuzungen einer Schar mit dem Kreis vom Radius R. */
export function kreuzungen(
  g: Gitter,
  schar: Int32Array,
  cx: number,
  cy: number,
  radius: number,
): { anzahl: number; regel: number } {
  const winkel: number[] = [];
  for (let i = 0; i < schar.length; i++) {
    const j = schar[i]!;
    if (j < 0) continue;
    const p = g.flecken[i]!;
    const q = g.flecken[j]!;
    const ra = Math.hypot(p.x - cx, p.y - cy);
    const rb = Math.hypot(q.x - cx, q.y - cy);
    if (!(ra < radius && rb >= radius)) continue;
    const t = (radius - ra) / (rb - ra);
    winkel.push(Math.atan2(p.y + t * (q.y - p.y) - cy, p.x + t * (q.x - p.x) - cx));
  }
  if (winkel.length < 5) return { anzahl: 0, regel: 0 };

  winkel.sort((a, b) => a - b);
  const luecken = winkel.map((a, i) => (i + 1 < winkel.length ? winkel[i + 1]! - a : winkel[0]! + 2 * Math.PI - a));
  const sortiert = [...luecken].sort((a, b) => a - b);
  const typisch = sortiert[Math.floor(sortiert.length / 2)]!;

  // Lücken in Einheiten des typischen Abstands. Eine doppelte Lücke heißt: ein
  // Blütchen fehlt, und es zählt trotzdem mit. Eine halbe Lücke heißt: eines
  // wurde doppelt erkannt, sie wird mit der nächsten zusammengelegt.
  let einheiten = 0;
  let teile = 0;
  let sauber = 0;
  let fehlend = 0;
  let angesammelt = 0;
  for (const l of luecken) {
    angesammelt += l;
    if (angesammelt < 0.5 * typisch) continue;
    const q = angesammelt / typisch;
    const k = Math.round(q);
    einheiten += k;
    teile++;
    if (Math.abs(q - k) < 0.25) sauber++;
    if (k > 1) fehlend += k - 1;
    angesammelt = 0;
  }
  if (angesammelt > 0) einheiten += Math.round(angesammelt / typisch);

  // Regelmäßig heißt: fast alle Lücken sind ganze Vielfache des typischen
  // Abstands, und es fehlt höchstens ein Fünftel. Mehr Ausgleich wäre Raten.
  const regel = teile > 0 && fehlend <= 0.2 * einheiten ? sauber / teile : 0;
  return { anzahl: einheiten, regel };
}

function median(werte: readonly number[]): number {
  const s = [...werte].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

/**
 * Von wo bis wo gezählt wird, als Anteil des Abstands von der Mitte zum
 * Bildrand. Innen unter 0,15 liegen zu wenige Blütchen je Kreis, als dass eine
 * Zählung etwas hieße; ganz außen läuft der Kreis aus dem Bild. Der Zielring
 * über dem Kamerabild zeigt genau diese beiden Kreise.
 */
export const KETTEN_RING = { innen: 0.15, aussen: 0.97 } as const;

/** Wie viele Gitter an einem Ring mindestens sauber zählen müssen. */
const GITTER_MINDEST = 3;
/** Ab wie vielen Gittern und welcher Einigkeit ein Ring als exakt gilt. */
const EXAKT_GITTER = 4;
const EXAKT_EINIG = 0.5;

/** Abstand der Zählkreise, als Anteil des Abstands zum Bildrand. */
const RING_SCHRITT = 0.04;
const RING_ANZAHL = Math.floor((KETTEN_RING.aussen - KETTEN_RING.innen) / RING_SCHRITT + 1e-9) + 1;

interface Stimme {
  g: Gitter;
  klein: number;
  gross: number;
}

/**
 * Was ein Bild zur Zählung beiträgt: je Ring die Paare aller Gitter, die dort
 * sauber gezählt haben. Noch keine Entscheidung -- die fällt in `entscheide`,
 * und zwar über alle Bilder einer Messreihe zugleich.
 */
export interface Stimmen {
  mitte: { x: number; y: number };
  /** Abstand der Mitte zum Bildrand; die Ringe sind Anteile davon. */
  rand: number;
  ringe: ReadonlyArray<readonly Stimme[]>;
}

/** Sammelt die Stimmen eines Bildes um eine gegebene Mitte. */
export function kettenStimmen(frame: Frame, cx: number, cy: number): Stimmen {
  const gitter = findeGitter(frame, cx, cy);
  const rand = Math.min(cx, cy, frame.width - cx, frame.height - cy);
  const ringe: Stimme[][] = [];
  for (let i = 0; i < RING_ANZAHL; i++) {
    const radius = (KETTEN_RING.innen + i * RING_SCHRITT) * rand;
    const hier: Stimme[] = [];
    for (const g of gitter) {
      const a = kreuzungen(g, g.links, cx, cy, radius);
      const b = kreuzungen(g, g.rechts, cx, cy, radius);
      // Zwei gleiche Zahlen heißen Rechteckgitter -- Backsteinwand, Fliesen.
      // Phyllotaxis hat immer zwei verschiedene.
      if (a.regel < REGELMAESSIG_AB || b.regel < REGELMAESSIG_AB || a.anzahl === b.anzahl) continue;
      hier.push({ g, klein: Math.min(a.anzahl, b.anzahl), gross: Math.max(a.anzahl, b.anzahl) });
    }
    ringe.push(hier);
  }
  return { mitte: { x: cx, y: cy }, rand, ringe };
}

/** Zählt die Spiralen eines einzelnen Bildes um eine gegebene Mitte. */
export function zaehleKetten(frame: Frame, cx: number, cy: number): KettenRoh {
  return entscheide([kettenStimmen(frame, cx, cy)]);
}

/**
 * Entscheidet über die Stimmen eines oder mehrerer Bilder.
 *
 * Je Ring stimmen alle Gitter aller Bilder ab, die dort sauber zählen; der
 * Ring nimmt den Median. Dasselbe Prinzip wie die Messreihe, nur über
 * Fleckgrößen, Ringe und Bilder zugleich. Die Ringe sind in allen Bildern
 * dieselben Anteile des Randabstands, deshalb passen sie aufeinander, auch
 * wenn die Hand die Mitte um ein paar Pixel verschoben hat.
 *
 * Gemessen an drei simulierten Handaufnahmen je Originalbild: dreifache
 * Stütze, und die Mediane liegen näher an der Wahrheit (Sonnenblume „Abend“
 * 34/55 in zwei Nachbarringen statt 36/53). Exakt werden echte Blüten dadurch
 * nicht -- die Gitter sind sich dort nur zu 10 bis 40 % einig --, aber das
 * Ungefähr wird besser.
 *
 * Gezeichnet wird mit dem letzten Bild der Liste: Es liegt dem Standbild, das
 * am Ende der Reihe aufgenommen wird, zeitlich am nächsten.
 */
export function entscheide(liste: readonly Stimmen[]): KettenRoh {
  const letztes = liste.at(-1);
  if (!letztes) {
    return { mitte: { x: 0, y: 0 }, ringe: [], paar: null, exakt: false, genauigkeit: 0, stuetze: 0, bilder: 0, treffer: false, segmente: [] };
  }
  // Die Mindestzahlen gelten je Bild. Wer drei Bilder zusammenlegt, braucht
  // dreimal so viele Stimmen -- sonst reicht schon ein zufälliges Gitter je
  // Bild. Gemessen: Ohne diese Skalierung meldete die fraktale Fläche
  // „≈ 10/13“, die Backsteinwand „≈ 24/26“, und ein Zapfen stand als exakt
  // „7/10 – kein Fibonacci-Paar“ da.
  const bilder = liste.length;
  const mindest = GITTER_MINDEST * bilder;
  const exaktMindest = EXAKT_GITTER * bilder;
  const { mitte, rand } = letztes;
  const cx = mitte.x;
  const cy = mitte.y;

  const ringe: Ringzaehlung[] = [];
  const beitraege: Stimme[][] = [];
  for (let i = 0; i < RING_ANZAHL; i++) {
    const radius = (KETTEN_RING.innen + i * RING_SCHRITT) * rand;
    const hier = liste.flatMap((st) => st.ringe[i] ?? []);
    if (hier.length < mindest) {
      ringe.push({ radius, klein: 0, gross: 0, gitter: hier.length, einig: 0 });
      beitraege.push([]);
      continue;
    }
    const klein = median(hier.map((h) => h.klein));
    const gross = median(hier.map((h) => h.gross));
    const einig = hier.filter((h) => h.klein === klein && h.gross === gross).length / hier.length;
    ringe.push({ radius, klein, gross, gitter: hier.length, einig });
    beitraege.push(hier);
  }

  const gezaehlt = (r: Ringzaehlung): boolean => r.gitter >= mindest;
  const exakterRing = (r: Ringzaehlung): boolean => r.gitter >= exaktMindest && r.einig >= EXAKT_EINIG;

  // Exakt: zwei oder mehr benachbarte Ringe, jeder für sich einig, und alle
  // mit genau demselben Paar. Gewonnen hat die Folge mit der meisten Stütze.
  let bester: { von: number; bis: number; stuetze: number } | null = null;
  for (let i = 0; i < ringe.length; i++) {
    const erster = ringe[i]!;
    if (!exakterRing(erster)) continue;
    let j = i;
    let stuetze = erster.gitter;
    while (j + 1 < ringe.length) {
      const n = ringe[j + 1]!;
      if (!exakterRing(n) || n.klein !== erster.klein || n.gross !== erster.gross) break;
      j++;
      stuetze += n.gitter;
    }
    if (j > i && (!bester || stuetze > bester.stuetze)) bester = { von: i, bis: j, stuetze };
  }

  let paar: readonly [number, number] | null = null;
  let exakt = false;
  let genauigkeit = 0;
  let stuetze = 0;
  let von = -1;
  let bis = -1;

  if (bester) {
    const r = ringe[bester.von]!;
    paar = [r.klein, r.gross];
    exakt = true;
    stuetze = bester.stuetze;
    von = bester.von;
    bis = bester.bis;
  } else {
    // Ungefähr: der Ring mit der meisten Stütze, sofern ein Nachbarring in der
    // Nähe zählt. Ein einzelner Ring ist auf Fremdmotiven schon vorgekommen.
    let kandidat = -1;
    for (let i = 0; i < ringe.length; i++) {
      const r = ringe[i]!;
      if (!gezaehlt(r)) continue;
      const nachbarn = [ringe[i - 1], ringe[i + 1]].filter(
        (n): n is Ringzaehlung =>
          n !== undefined && gezaehlt(n) && Math.abs(n.klein - r.klein) <= 3 && Math.abs(n.gross - r.gross) <= 3,
      );
      if (nachbarn.length === 0) continue;
      if (kandidat < 0 || r.gitter > ringe[kandidat]!.gitter) kandidat = i;
    }
    if (kandidat >= 0) {
      const r = ringe[kandidat]!;
      paar = [r.klein, r.gross];
      von = Math.max(0, kandidat - 1);
      bis = Math.min(ringe.length - 1, kandidat + 1);
      // Genauigkeit: wie weit die Nachbarringe und die Gitter am Ring selbst
      // auseinanderliegen. Mindestens eins -- ungefähr heißt nie exakt.
      // Nur Nachbarringe, die zum Befund passen (höchstens drei daneben) --
      // ein Ring weiter außen zählt vielleicht schon die nächste Stufe der
      // Folge, und die gehört nicht in die Unsicherheit dieses Befunds. So
      // stand an der markierten Sonnenblume einmal „auf ±52 genau“.
      const passt = (n: Ringzaehlung): boolean =>
        gezaehlt(n) && Math.abs(n.klein - r.klein) <= 3 && Math.abs(n.gross - r.gross) <= 3;
      let spanne = 1;
      for (let k = von; k <= bis; k++) {
        const n = ringe[k]!;
        if (!passt(n)) continue;
        spanne = Math.max(spanne, Math.abs(n.klein - r.klein), Math.abs(n.gross - r.gross));
      }
      for (const b of beitraege[kandidat] ?? []) {
        spanne = Math.max(spanne, Math.min(3, Math.abs(b.klein - r.klein)), Math.min(3, Math.abs(b.gross - r.gross)));
      }
      genauigkeit = spanne;
      for (let k = von; k <= bis; k++) if (passt(ringe[k]!)) stuetze += ringe[k]!.gitter;
    }
  }

  // Nachzeichnen: das Gitter, das im tragenden Bereich am häufigsten genau
  // das Paar gezählt hat, und davon nur die Verbindungen in diesem Bereich.
  const segmente: Segment[] = [];
  if (paar && von >= 0) {
    const stimmen = new Map<Gitter, number>();
    for (let k = von; k <= bis; k++) {
      // Nur Gitter des letzten Bildes: Nur deren Koordinaten passen zum
      // Standbild. Die anderen Bilder haben mitgezählt, gezeichnet wird eines.
      for (const b of letztes.ringe[k] ?? []) {
        const passt = b.klein === paar[0] && b.gross === paar[1] ? 2 : 1;
        stimmen.set(b.g, (stimmen.get(b.g) ?? 0) + passt);
      }
    }
    const g = [...stimmen].sort((a, b) => b[1] - a[1])[0]?.[0];
    const innen = ringe[von]!.radius - 0.06 * rand;
    const aussen = ringe[bis]!.radius + 0.06 * rand;
    if (g) {
      for (const [schar, verbindung] of [[0, g.links], [1, g.rechts]] as const) {
        for (let i = 0; i < verbindung.length; i++) {
          const j = verbindung[i]!;
          if (j < 0) continue;
          const p = g.flecken[i]!;
          const q = g.flecken[j]!;
          const rm = Math.hypot((p.x + q.x) / 2 - cx, (p.y + q.y) / 2 - cy);
          if (rm < innen || rm > aussen) continue;
          segmente.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, schar });
        }
      }
    }
  }

  return {
    mitte: { x: cx, y: cy },
    ringe,
    paar,
    exakt,
    genauigkeit,
    stuetze,
    bilder,
    treffer: exakt && paar !== null && benachbarteFibonacci(paar[0], paar[1]),
    segmente,
  };
}

/**
 * Sucht die Mitte und zählt.
 *
 * Die Mitte kommt weiter aus der Mittelsuche der Fouriertransformation -- dort
 * leistet sie, was sie soll: Auf den Originalbildern lag sie jedes Mal auf der
 * Blütenmitte. Nur als Zähler taugte das Spektrum nicht.
 * Mit `start` beginnt die Suche dort, wo das vorige Bild einer Reihe die Mitte
 * fand.
 */
export function ketten(frame: Frame, start?: { x: number; y: number }): KettenRoh {
  const { mitte } = sucheMitte(frame, undefined, start);
  return zaehleKetten(frame, mitte.x, mitte.y);
}

// ---------------------------------------------------------------- Ergebnis

export function kettenErgebnis(roh: KettenRoh): Result {
  const caveats: string[] = [];
  const [klein, gross] = roh.paar ?? [0, 0];

  // Früher „Blütenmitte formatfüllend halten" -- beim Feldtest an einer
  // blühenden Sonnenblume füllte die Scheibe das Bild, und es half nichts: Die
  // offenen Röhrenblüten sind Borsten, keine Punkte, und die Knospen innen zu
  // klein und zu dunkel. Der Hinweis nennt jetzt, woran es tatsächlich liegt.
  if (!roh.paar) caveats.push('keine zählbaren Blütchenreihen – zu fein, zu dunkel oder ohne Reihen');
  else if (!roh.exakt) caveats.push(`auf ±${roh.genauigkeit} genau – zu ungenau für eine Fibonacci-Aussage`);
  else if (!roh.treffer) caveats.push('Spiralen gezählt, aber kein Fibonacci-Paar');

  return {
    value: gross,
    // Ungefähr steht als ungefähr da. Die Tilde ist die ganze Einschränkung
    // in einem Zeichen -- und sie verhindert, dass jemand "35/55" für eine
    // gezählte Zahl hält.
    label: roh.paar ? (roh.exakt ? `${klein}/${gross}` : `≈ ${klein}/${gross}`) : '',
    deutung: !roh.paar
      ? ''
      : roh.treffer
        ? 'benachbarte Fibonacci-Zahlen'
        : roh.exakt
          ? 'Spiralen gezählt, kein Fibonacci-Paar'
          : 'ungefähr gezählt',
    detail: {
      klein,
      gross,
      exakt: roh.exakt ? 1 : 0,
      genauigkeit: roh.genauigkeit,
      stuetze: roh.stuetze,
      ringe: roh.ringe.filter((r) => r.gitter >= GITTER_MINDEST * roh.bilder).length,
      bilder: roh.bilder,
      treffer: roh.treffer ? 1 : 0,
    },
    caveats,
  };
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Obergrenze für einen ungefähren Befund -- fest unter `VERTRAUEN_GUT` (0,6).
 * Gleich wie gut gestützt: Was nicht exakt gezählt ist, wird nicht golden und
 * drängt sich nicht vor die fraktale Dimension.
 */
const UNGEFAEHR_HOECHSTENS = 0.5;

export function createKettenMetric(): Metric {
  return {
    id: 'parastichen',
    label: 'Fibonacci-Spiralen',
    phaenomen: SPIRALEN_PHAENOMEN,
    verfahren: [
      'Die App sucht die einzelnen Blütchen im Bild — bei einem Zapfen die Schuppen — und verbindet jedes mit seinem nächsten Nachbarn weiter außen, einmal nach links gedreht, einmal nach rechts. So entstehen Ketten: die Spiralen, Blütchen für Blütchen.',
      'Dann legt sie Kreise um die Mitte und zählt, wie viele Ketten jeden Kreis kreuzen. Jede Spirale kreuzt jeden Kreis genau einmal; die Zahl der Kreuzungen ist die Zahl der Spiralen. Fehlt ein Blütchen, bleibt eine doppelte Lücke, und die App zählt es trotzdem mit.',
      'Weiter außen sind es mehr Spiralen als innen — bei der Sonnenblume etwa 21/34 innen, 34/55 weiter außen. Das ist kein Messfehler, sondern die Pflanze.',
      'Gezählt wird erst beim Festhalten. Die Blütenmitte gehört ungefähr ins Kreuz, der Blütenstand soll den Ring füllen; die genaue Mitte sucht die App selbst.',
      'Zählen mehrere Kreise genau dasselbe Paar, steht es als Zahl da, und ein Fibonacci-Paar wird ockergolden. Schwankt die Zählung, steht davor eine Tilde — „≈ 35/55" heißt: ungefähr so viele, zu ungenau für ein Urteil. An echten Blüten ist das häufig: Blütchen verdecken sich, Spiralen enden oder spalten sich.',
      'Die gezählten Ketten legt die App ins Standbild. Folgen sie den Reihen der Blütchen, stimmt die Zählung; springen sie quer, stimmt sie nicht. Das kann jeder mit eigenen Augen prüfen.',
    ],

    run(frame: Frame): Result {
      return kettenErgebnis(ketten(frame));
    },

    confidence(r: Result): number {
      const gross = r.detail['gross'] ?? 0;
      if (gross === 0) return 0;
      // Stütze je Bild -- sonst wäre eine Reihe aus drei Bildern allein durch
      // ihre Länge sicherer als ein einzelnes.
      const stuetze = (r.detail['stuetze'] ?? 0) / Math.max(1, r.detail['bilder'] ?? 1);
      if ((r.detail['exakt'] ?? 0) === 1) {
        // Exakt beginnt bei der Schwelle für gefundene Befunde und steigt mit
        // der Zahl der Gitter, die dasselbe gezählt haben.
        return clamp01(0.6 + 0.02 * (stuetze - 2 * EXAKT_GITTER));
      }
      // Ungefähr bleibt immer im Bereich "gering": sichtbar, aber nie golden,
      // nie nachgezeichnet als Treffer, nie auf dem Hauptplatz vor der
      // fraktalen Dimension.
      const genauigkeit = r.detail['genauigkeit'] ?? 3;
      return Math.min(UNGEFAEHR_HOECHSTENS, clamp01(0.45 - 0.07 * genauigkeit + 0.005 * stuetze));
    },

    explain(r: Result): string {
      const klein = r.detail['klein'] ?? 0;
      const gross = r.detail['gross'] ?? 0;
      if (gross === 0) {
        return 'Im Bild waren keine zählbaren Blütchenreihen zu finden. Am ehesten gelingt es an Zapfen und an Blütenständen, deren Blütchen als deutliche Punkte erscheinen – bei Tageslicht und nah genug, dass jedes einzelne zu erkennen ist. Eine Sonnenblume in voller Blüte zeigt außen Borsten statt Punkte.';
      }
      if ((r.detail['exakt'] ?? 0) !== 1) {
        return `Etwa ${klein} Spiralen in der einen Richtung und ${gross} in der anderen, auf ±${r.detail['genauigkeit'] ?? 0} genau. Für eine Aussage über Fibonacci-Zahlen ist das zu ungenau.`;
      }
      return (r.detail['treffer'] ?? 0) === 1
        ? `${klein} und ${gross} Spiralen, in mehreren Ringen übereinstimmend gezählt. Die beiden Zahlen sind in der Fibonacci-Folge benachbart.`
        : `${klein} und ${gross} Spiralen, in mehreren Ringen übereinstimmend gezählt. Die beiden Zahlen sind in der Fibonacci-Folge nicht benachbart.`;
    },
  };
}

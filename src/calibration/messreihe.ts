/**
 * Eine Messreihe: viele Einzelbilder, ein Befund -- und die Angabe, wie einig
 * sich die Bilder waren.
 *
 * Der Grund dafuer ist der Mangel, an dem die App draussen gescheitert ist.
 * Beide Verfahren werten je ein einzelnes Bild aus, und ein einzelnes Bild aus
 * der Hand ist eine Zufallsgroesse: der Ausschnitt wandert um Pixel, der
 * Autofokus regelt nach, der Otsu-Schnitt springt um eine Graustufe. Angezeigt
 * wurde davon zuletzt immer das juengste Bild -- also der Zufall selbst.
 *
 * Eine Reihe dreht das um. Nicht der letzte Wert zaehlt, sondern der, auf den
 * sich die Bilder geeinigt haben; und wie stark sie sich geeinigt haben, ist
 * selbst ein Messwert. Ein Befund, den 41 von 58 Bildern tragen, ist etwas
 * anderes als einer, den 6 von 58 tragen -- und genau diesen Unterschied konnte
 * die App vorher nicht aussprechen.
 *
 * Die beiden Verfahren brauchen verschiedene Zusammenfassungen. Die fraktale
 * Dimension ist stetig, dort ist der Median richtig. Eine Spiralenzahl ist
 * ganzzahlig, dort gibt es keinen Median -- nur eine Abstimmung.
 */

/** Was ein einzelnes Bild gesagt hat. */
export interface Probe {
  wert: number;
  /**
   * Der Wert, wie er dasteht -- "34/55". Null heisst: dieses Bild hat nichts
   * gefunden. Solche Bilder zaehlen mit, aber nur im Nenner: Wenn zwei Drittel
   * der Reihe geschwiegen haben, ist das ein Teil des Befundes.
   */
  marke: string | null;
  konfidenz: number;
}

export interface Reihenbefund {
  /** Der festgehaltene Wert. Null, wenn die Reihe nichts hergegeben hat. */
  marke: string | null;
  wert: number;
  /** Anteil der Bilder der ganzen Reihe, die diesen Befund tragen. 0..1 */
  einigkeit: number;
  /** Spanne der beitragenden Werte, in derselben Einheit wie `wert`. */
  spanne: number;
  /** Bilder in der Reihe insgesamt. */
  proben: number;
  /** Bilder, die den Befund tragen. */
  traeger: number;
  /**
   * Vertrauen in den festgehaltenen Befund: was die Verfahren den tragenden
   * Bildern zugetraut haben, mal dem Anteil der Bilder, die sie tragen. Beides
   * muss stimmen. Ein Wert, den das Verfahren fuer sicher haelt, den aber nur
   * jedes zehnte Bild gesehen hat, ist keine Messung.
   */
  konfidenz: number;
  /**
   * Index der Probe, die den Befund am besten vertritt -- fuer alles, was am
   * einzelnen Bild haengt: Zwischenwerte, Schwellwert, Nachzeichnung.
   * -1, wenn die Reihe nichts hergegeben hat.
   */
  vertreter: number;
}

/**
 * Unterhalb dieser Einigkeit wird kein Wert angezeigt, sondern der Grund.
 *
 * Ein Viertel ist mit Absicht niedrig angesetzt: Bei einem Verfahren, das
 * ueberhaupt nur auf jedes dritte Motiv passt, ist ein Viertel schon eine
 * Aussage. Wer hoeher geht, verliert echte Befunde; wer tiefer geht, faengt
 * an, Zufall zu melden -- und das ist der gefaehrlichere Fehler.
 */
export const EINIGKEIT_MINDEST = 0.25;

/**
 * Unterhalb dieser Grenze steht keine Zahl da, sondern ein Strich und der
 * Grund.
 *
 * Draußen stand hier „5/8" in Gold, mit einem Prozent Vertrauen. Das Verfahren
 * hatte selbst gesagt, dass es nichts gefunden hat -- die Anzeige hat es
 * trotzdem ausgesprochen, und zwar in der Farbe für Treffer. Genau das ist die
 * Zahlenmystik, die die App nie betreiben soll. Deshalb gilt die Grenze an
 * einer Stelle und für alle: für die laufende Anzeige, für die Stimmen einer
 * Messreihe und für das, was am Ende festgehalten wird.
 */
export const VERTRAUEN_GERING = 0.15;

/**
 * Ab hier gilt ein Befund als gefunden: Die Nachzeichnung erscheint, ein
 * spezifisches Verfahren bekommt den Hauptplatz, und ein Fibonacci-Paar darf
 * golden werden. Darunter ist ein Paar ein Zufall, keine Entdeckung.
 */
export const VERTRAUEN_GUT = 0.6;

const LEER: Reihenbefund = {
  marke: null,
  wert: 0,
  einigkeit: 0,
  spanne: 0,
  proben: 0,
  traeger: 0,
  konfidenz: 0,
  vertreter: -1,
};

/** Proben, die ueberhaupt etwas gefunden haben, mit ihrem Platz in der Reihe. */
function gueltige(proben: readonly Probe[]): Array<{ probe: Probe; index: number }> {
  const raus: Array<{ probe: Probe; index: number }> = [];
  for (let i = 0; i < proben.length; i++) {
    const p = proben[i]!;
    if (p.marke !== null && p.konfidenz > 0) raus.push({ probe: p, index: i });
  }
  return raus;
}

/**
 * Fasst eine Reihe stetiger Messwerte zusammen: Median statt Mittelwert.
 *
 * Der Mittelwert waere falsch. Ein einziges verwackeltes Bild zieht die
 * fraktale Dimension um mehrere Zehntel, und genau solche Bilder sind in einer
 * Reihe aus der Hand immer dabei. Der Median sieht sie gar nicht.
 *
 * `toleranz` ist die Spanne, innerhalb derer zwei Messungen als dieselbe
 * gelten. Voreingestellt ist 0,05 -- dieselbe Zahl wie in der Abnahmebedingung
 * fuer M1, und aus demselben Grund: Was enger beieinander liegt, ist fuer die
 * Aussage der App nicht zu unterscheiden.
 */
export function fasseStetig(proben: readonly Probe[], toleranz = 0.05): Reihenbefund {
  if (proben.length === 0) return LEER;
  const gut = gueltige(proben);
  if (gut.length === 0) return { ...LEER, proben: proben.length };

  const sortiert = [...gut].sort((a, b) => a.probe.wert - b.probe.wert);
  const mitte = Math.floor(sortiert.length / 2);
  const median =
    sortiert.length % 2 === 1
      ? sortiert[mitte]!.probe.wert
      : (sortiert[mitte - 1]!.probe.wert + sortiert[mitte]!.probe.wert) / 2;

  const halbe = toleranz / 2;
  const traeger = gut.filter((g) => Math.abs(g.probe.wert - median) <= halbe);

  // Spanne ueber alle gueltigen Werte, nicht nur ueber die tragenden -- sonst
  // versteckt sie genau die Ausreisser, um derentwillen sie dasteht. Dieselbe
  // Rechnung wie im Zehn-Sekunden-Fenster: groesster minus kleinster Wert.
  let lo = Infinity;
  let hi = -Infinity;
  for (const g of gut) {
    if (g.probe.wert < lo) lo = g.probe.wert;
    if (g.probe.wert > hi) hi = g.probe.wert;
  }

  const einigkeit = traeger.length / proben.length;
  const mittlereKonfidenz =
    traeger.reduce((summe, g) => summe + g.probe.konfidenz, 0) / Math.max(1, traeger.length);

  // Vertreter: die tragende Probe, die dem Median am naechsten liegt. Bei
  // gleichem Abstand die, der das Verfahren selbst mehr zugetraut hat.
  let vertreter = traeger[0] ?? gut[0]!;
  for (const g of traeger) {
    const naeher = Math.abs(g.probe.wert - median) < Math.abs(vertreter.probe.wert - median);
    const gleichNahUndSicherer =
      Math.abs(g.probe.wert - median) === Math.abs(vertreter.probe.wert - median) &&
      g.probe.konfidenz > vertreter.probe.konfidenz;
    if (naeher || gleichNahUndSicherer) vertreter = g;
  }

  return {
    marke: vertreter.probe.marke,
    wert: median,
    einigkeit,
    spanne: hi - lo,
    proben: proben.length,
    traeger: traeger.length,
    konfidenz: mittlereKonfidenz * einigkeit,
    vertreter: vertreter.index,
  };
}

/**
 * Fasst eine Reihe ganzzahliger Befunde zusammen: Abstimmung statt Rechnung.
 *
 * Ein Mittel aus 34 und 55 waere 44,5 und damit eine Zahl, die es nicht gibt.
 * Gezaehlt wird deshalb, welcher Befund am haeufigsten vorkam. Bei Gleichstand
 * gewinnt der, dem die Verfahren zusammengenommen mehr zugetraut haben --
 * nicht der, der zufaellig zuerst kam.
 */
export function fasseDiskret(proben: readonly Probe[]): Reihenbefund {
  if (proben.length === 0) return LEER;
  const gut = gueltige(proben);
  if (gut.length === 0) return { ...LEER, proben: proben.length };

  const stimmen = new Map<string, { anzahl: number; summe: number }>();
  for (const g of gut) {
    const marke = g.probe.marke!;
    const bisher = stimmen.get(marke) ?? { anzahl: 0, summe: 0 };
    bisher.anzahl++;
    bisher.summe += g.probe.konfidenz;
    stimmen.set(marke, bisher);
  }

  let sieger = '';
  let besteAnzahl = 0;
  let besteSumme = 0;
  for (const [marke, s] of stimmen) {
    if (s.anzahl > besteAnzahl || (s.anzahl === besteAnzahl && s.summe > besteSumme)) {
      sieger = marke;
      besteAnzahl = s.anzahl;
      besteSumme = s.summe;
    }
  }

  const traeger = gut.filter((g) => g.probe.marke === sieger);
  let vertreter = traeger[0]!;
  for (const g of traeger) if (g.probe.konfidenz > vertreter.probe.konfidenz) vertreter = g;

  const einigkeit = traeger.length / proben.length;

  return {
    marke: sieger,
    wert: vertreter.probe.wert,
    einigkeit,
    // Eine Abstimmung hat keine Spanne. Wie weit die Reihe auseinanderlag,
    // steht in der Einigkeit und nirgends sonst.
    spanne: 0,
    proben: proben.length,
    traeger: traeger.length,
    konfidenz: (besteSumme / traeger.length) * einigkeit,
    vertreter: vertreter.index,
  };
}

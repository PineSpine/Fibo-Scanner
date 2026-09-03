/**
 * Ein Frame ist das, was die Messverfahren zu sehen bekommen: nichts von der
 * Kamera, nichts von der Anzeige. Beide Kanaele liegen in derselben Aufloesung
 * und sind zeilenweise gespeichert (Index = y * width + x).
 */
export interface Frame {
  /** Graustufen 0..255. Fuer M1 ungenutzt, M2 rechnet die FFT darauf. */
  gray: Uint8Array;
  /** Kantenstaerke 0..255 (Sobel-Betrag). Noch nicht binarisiert. */
  edges: Uint8Array;
  width: number;
  height: number;
  /** performance.now() beim Greifen des Bildes, ms. */
  timestamp: number;
}

export interface Result {
  /** Der Messwert selbst. Bedeutungslos, solange confidence() nahe 0 liegt. */
  value: number;
  /**
   * Wie der Wert dasteht, wenn eine einzelne Zahl ihn nicht fasst -- etwa
   * "34/55" bei zwei Spiralfamilien. Fehlt er, wird `value` formatiert.
   */
  label?: string;
  /**
   * Drei bis vier Woerter, die den Wert einordnen -- "stark verzweigt",
   * "flaechenfuellend". Eine Zahl allein sagt nur etwas, wenn man ihre Skala
   * kennt; die kennt beim ersten Mal niemand.
   */
  deutung?: string;
  /** Zwischenwerte fuer Anzeige, Pruefung und Fehlersuche. */
  detail: Readonly<Record<string, number>>;
  /** Warum der Wert unsicher ist. Leer heisst: kein bekannter Vorbehalt. */
  caveats: readonly string[];
}

/**
 * Die Spanne, in der ein Messwert liegen kann, mit Namen fuer beide Enden.
 * Die Anzeige macht daraus eine kleine Achse mit einer Marke -- damit sieht
 * man, ob 1,82 viel ist, ohne es gelernt zu haben.
 */
export interface Skala {
  min: number;
  max: number;
  links: string;
  rechts: string;
}

export interface Metric {
  id: string;
  /** deutsch, kurz */
  label: string;
  /** Vorhanden, wenn der Wert auf einer festen Spanne liegt. */
  skala?: Skala;
  run(frame: Frame): Result;
  /** 0..1, ehrlich */
  confidence(r: Result): number;
  /** Was der gemessene Wert bedeutet. Haengt vom Ergebnis ab. */
  explain(r: Result): string;

  /**
   * Was das Phaenomen ueberhaupt ist -- ohne ein Wort ueber Messtechnik, fuer
   * jemanden, der den Begriff zum ersten Mal liest. Ein Eintrag je Absatz --
   * so braucht der Text keine Zeilenumbrueche im Quelltext.
   */
  phaenomen: readonly string[];

  /**
   * Wie die App es misst. Kurz, und in Bildern statt in Formeln: Wer wissen
   * will, warum eine Zahl herauskommt, soll das lesen koennen, ohne vorher
   * Bildverarbeitung gelernt zu haben.
   */
  verfahren: readonly string[];
}

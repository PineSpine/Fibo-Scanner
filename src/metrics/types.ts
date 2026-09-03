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
  /** Zwischenwerte fuer Anzeige, Pruefung und Fehlersuche. */
  detail: Readonly<Record<string, number>>;
  /** Warum der Wert unsicher ist. Leer heisst: kein bekannter Vorbehalt. */
  caveats: readonly string[];
}

export interface Metric {
  id: string;
  /** deutsch, kurz */
  label: string;
  run(frame: Frame): Result;
  /** 0..1, ehrlich */
  confidence(r: Result): number;
  explain(r: Result): string;
}

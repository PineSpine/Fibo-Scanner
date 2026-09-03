export interface Wachhalter {
  /** Bildschirm wach halten. Gibt zurueck, ob es geklappt hat. */
  anfordern(): Promise<boolean>;
  freigeben(): void;
}

/**
 * Haelt den Bildschirm waehrend der Messung wach.
 *
 * Die Abnahmebedingung fuer M1 verlangt zehn Sekunden ruhiges Halten, ohne den
 * Bildschirm zu beruehren. Genau dann dimmt das Telefon. Ohne diese Sperre
 * misst man die Bildschirmzeitschaltung mit.
 *
 * Nicht jeder Browser kann das -- Safari auf iOS erst ab 16.4, aeltere gar
 * nicht. Der Rueckgabewert sagt es, ein Fehlschlag bricht nichts ab.
 */
export function createWachhalter(): Wachhalter {
  let sperre: WakeLockSentinel | null = null;

  return {
    async anfordern(): Promise<boolean> {
      if (!('wakeLock' in navigator)) return false;
      try {
        sperre = await navigator.wakeLock.request('screen');
        // Das System nimmt die Sperre beim Wegschalten von sich aus zurueck.
        // Merken, damit freigeben() nicht auf einer toten Sperre arbeitet.
        sperre.addEventListener('release', () => {
          sperre = null;
        });
        return true;
      } catch {
        return false;
      }
    },

    freigeben(): void {
      void sperre?.release();
      sperre = null;
    },
  };
}

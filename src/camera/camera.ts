export class CameraError extends Error {
  constructor(
    message: string,
    /** Was der Nutzer tun kann. Leer, wenn es nichts zu tun gibt. */
    readonly hint = '',
  ) {
    super(message);
  }
}

export interface CameraHandle {
  readonly video: HTMLVideoElement;
  readonly stream: MediaStream;
  /** Was die Kamera tatsaechlich liefert -- der Wunsch wird selten erfuellt. */
  readonly settings: MediaTrackSettings;
  /**
   * Belichtung und Weissabgleich festhalten. Gibt zurueck, was gelungen ist.
   * Ohne Sperre regelt die Automatik waehrend der Messung nach, und das
   * Kantenbild wandert mit der Helligkeit statt mit dem Motiv.
   */
  lockExposure(): Promise<{ exposure: boolean; whiteBalance: boolean }>;
  /**
   * Nimmt die Sperre zurueck. Noetig, weil manche Treiber beim Umschalten auf
   * manuell nicht stehenbleiben, sondern auf einen Standardwert springen -- das
   * Bild wird dann schlagartig dunkel. Der Aufrufer prueft die Helligkeit und
   * macht es rueckgaengig.
   */
  unlockExposure(): Promise<void>;
  stop(): void;
}

/**
 * Nicht standardisierte, aber in Chrome auf Android vorhandene Einstellungen
 * aus der Image-Capture-Erweiterung. TypeScript kennt sie nicht, deshalb hier
 * nur das, was tatsaechlich benutzt wird.
 */
interface PhotoConstraints {
  exposureMode?: string;
  whiteBalanceMode?: string;
  exposureTime?: number;
  iso?: number;
  exposureCompensation?: number;
  colorTemperature?: number;
}

/** Dieselben Felder, wie getSettings() sie zurueckgibt. */
type PhotoSettings = MediaTrackSettings & PhotoConstraints;

/**
 * Wartet, bis das Videoelement seine Bildgroesse kennt -- vorher laesst sich
 * der Ausschnitt nicht berechnen.
 *
 * Warum so umstaendlich: Auf `loadedmetadata` allein zu warten haengt sich auf.
 * Das Ereignis kann bereits durch sein, bevor der Zuhoerer haengt, und beim
 * zweiten Start mit demselben Element kommt es unter Umstaenden gar nicht mehr.
 * Genau das ist passiert -- die App blieb nach "Beenden" und erneutem Start
 * stumm stehen, ohne Fehler, ohne Bild. Deshalb drei Wege gleichzeitig:
 * das Ereignis, eine regelmaessige Abfrage und eine Frist. Einer greift immer.
 */
function warteAufBild(video: HTMLVideoElement, hoechstensMs = 4000): Promise<void> {
  if (video.videoWidth > 0) return Promise.resolve();

  return new Promise<void>((fertig) => {
    let erledigt = false;
    const beenden = (): void => {
      if (erledigt) return;
      erledigt = true;
      video.removeEventListener('loadedmetadata', beenden);
      video.removeEventListener('resize', beenden);
      clearInterval(abfrage);
      clearTimeout(frist);
      fertig();
    };

    video.addEventListener('loadedmetadata', beenden);
    video.addEventListener('resize', beenden);
    const abfrage = setInterval(() => {
      if (video.videoWidth > 0) beenden();
    }, 50);
    const frist = setTimeout(beenden, hoechstensMs);
  });
}

export async function startCamera(video: HTMLVideoElement): Promise<CameraHandle> {
  if (!window.isSecureContext) {
    throw new CameraError(
      'Die Kamera braucht eine gesicherte Verbindung.',
      'Die Seite über https aufrufen, localhost geht auch.',
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('Dieser Browser gibt keine Kamera frei.');
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 1280 },
        frameRate: { ideal: 30 },
      },
    });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError') {
      throw new CameraError(
        'Die Kamera ist nicht freigegeben.',
        'In den Seiteneinstellungen des Browsers erlauben und neu laden.',
      );
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new CameraError('Keine passende Kamera gefunden.');
    }
    throw new CameraError('Die Kamera lässt sich nicht öffnen.');
  }

  video.srcObject = stream;
  video.playsInline = true;
  video.muted = true;
  // play() lehnt ab, wenn der Browser das Abspielen unterbricht -- etwa weil
  // das Element beim Start noch verborgen ist. Das Bild kommt danach trotzdem,
  // also ist das kein Grund abzubrechen; ob wirklich eines kommt, klaert die
  // naechste Zeile.
  await video.play().catch(() => undefined);
  await warteAufBild(video);

  if (video.videoWidth === 0) {
    for (const t of stream.getTracks()) t.stop();
    throw new CameraError(
      'Die Kamera liefert kein Bild.',
      'App einmal schließen und neu öffnen; belegt eine andere App die Kamera?',
    );
  }

  const track = stream.getVideoTracks()[0];
  if (!track) throw new CameraError('Der Kamerastrom enthält kein Bild.');

  return {
    video,
    stream,
    settings: track.getSettings(),

    /**
     * Haelt die aktuelle Belichtung fest.
     *
     * Entscheidend ist, die laufenden Werte mitzugeben. `exposureMode: manual`
     * allein sagt dem Treiber nur "hoer auf zu regeln", nicht "bleib hier
     * stehen" -- und mancher Treiber springt dann auf einen Standardwert. Auf
     * dem Testgeraet wurde das Bild dadurch im Moment der Sperre schlagartig
     * dunkel, obwohl es vorher richtig belichtet war.
     *
     * Ob es geklappt hat, laesst sich hier nicht feststellen: applyConstraints
     * meldet Erfolg, auch wenn der Treiber etwas anderes tut. Deshalb prueft
     * der Aufrufer hinterher die Helligkeit und nimmt die Sperre notfalls
     * zurueck.
     */
    async lockExposure() {
      const result = { exposure: false, whiteBalance: false };
      const jetzt = track.getSettings() as PhotoSettings;

      const belichtung: PhotoConstraints = { exposureMode: 'manual' };
      if (typeof jetzt.exposureTime === 'number') belichtung.exposureTime = jetzt.exposureTime;
      if (typeof jetzt.iso === 'number') belichtung.iso = jetzt.iso;
      if (typeof jetzt.exposureCompensation === 'number') {
        belichtung.exposureCompensation = jetzt.exposureCompensation;
      }

      try {
        await track.applyConstraints({
          advanced: [belichtung],
        } as MediaTrackConstraints);
        result.exposure = true;
      } catch {
        // Die meisten Kameras am Rechner koennen das nicht. Kein Grund zum
        // Abbruch, die Anzeige weist dann auf die laufende Automatik hin.
      }

      const weiss: PhotoConstraints = { whiteBalanceMode: 'manual' };
      if (typeof jetzt.colorTemperature === 'number') {
        weiss.colorTemperature = jetzt.colorTemperature;
      }
      try {
        await track.applyConstraints({ advanced: [weiss] } as MediaTrackConstraints);
        result.whiteBalance = true;
      } catch {
        // dito
      }
      return result;
    },

    /** Gibt die Regelung wieder frei, wenn die Sperre das Bild verdorben hat. */
    async unlockExposure() {
      for (const modus of [
        { exposureMode: 'continuous' } as PhotoConstraints,
        { whiteBalanceMode: 'continuous' } as PhotoConstraints,
      ]) {
        try {
          await track.applyConstraints({ advanced: [modus] } as MediaTrackConstraints);
        } catch {
          // Wenn schon das Sperren nicht ging, geht das Entsperren erst recht
          // nicht -- dann lief die Automatik ohnehin durch.
        }
      }
    },

    stop() {
      for (const t of stream.getTracks()) t.stop();
      video.srcObject = null;
    },
  };
}

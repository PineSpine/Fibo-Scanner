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
  stop(): void;
}

/** Nicht standardisierte, aber in Chrome auf Android vorhandene Einstellungen. */
interface PhotoConstraints {
  exposureMode?: string;
  whiteBalanceMode?: string;
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
  await video.play();

  // Erst wenn Breite und Hoehe stehen, laesst sich der Ausschnitt berechnen.
  if (video.videoWidth === 0) {
    await new Promise<void>((resolve) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true });
    });
  }

  const track = stream.getVideoTracks()[0];
  if (!track) throw new CameraError('Der Kamerastrom enthält kein Bild.');

  return {
    video,
    stream,
    settings: track.getSettings(),

    async lockExposure() {
      const result = { exposure: false, whiteBalance: false };
      const supported = track.getCapabilities?.() as PhotoConstraints | undefined;

      if (supported?.exposureMode !== undefined || supported === undefined) {
        try {
          await track.applyConstraints({
            advanced: [{ exposureMode: 'manual' } as PhotoConstraints],
          } as MediaTrackConstraints);
          result.exposure = true;
        } catch {
          // Die meisten Desktop-Kameras koennen das nicht. Kein Grund zum Abbruch,
          // die Anzeige weist dann auf die laufende Automatik hin.
        }
      }
      try {
        await track.applyConstraints({
          advanced: [{ whiteBalanceMode: 'manual' } as PhotoConstraints],
        } as MediaTrackConstraints);
        result.whiteBalance = true;
      } catch {
        // dito
      }
      return result;
    },

    stop() {
      for (const t of stream.getTracks()) t.stop();
      video.srcObject = null;
    },
  };
}

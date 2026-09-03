/*
 * Dienstarbeiter. Er ist der Grund, warum die App im Wald ohne Empfang läuft:
 * beim ersten Aufruf legt er alles ab, was die Seite lädt, und bedient danach
 * jede weitere Anfrage aus dem eigenen Speicher.
 *
 * Zwei verschiedene Regeln, weil zwei verschiedene Dinge ausgeliefert werden:
 *
 *   Das Dokument   → erst das Netz, nach kurzer Frist der Speicher.
 *   Alles andere   → erst der Speicher, sonst das Netz.
 *
 * Der Unterschied ist wichtig. Die Dateinamen der Bündel tragen einen Hash,
 * sie ändern sich also nie unter demselben Namen -- der Speicher ist für sie
 * immer richtig. Das Dokument dagegen heißt immer gleich und zeigt nach einer
 * Veröffentlichung auf neue Bündel. Wer es aus dem Speicher ausliefert, zeigt
 * beim ersten Start nach jeder Veröffentlichung noch den alten Stand. Genau das
 * ist passiert: der Umschalter für das zweite Verfahren war ausgeliefert, aber
 * am Telefon nicht zu sehen.
 *
 * Die Frist von zweieinhalb Sekunden ist der Preis dafür. Sie fällt nur an,
 * wenn gar kein Netz da ist, und nur beim Start -- danach kommt alles aus dem
 * Speicher. Im Funkloch startet die App also mit einer kurzen Verzögerung
 * statt gar nicht.
 *
 * Achtung: Ein Dienstarbeiter läuft nur auf einem Ursprung, dessen Zertifikat
 * der Browser anerkennt. Über ein selbst ausgestelltes Zertifikat im WLAN
 * verweigert Chrome die Anmeldung -- dort gibt es also weder Offlinebetrieb
 * noch Installation.
 */
const CACHE = 'fibo-v2';
const NETZFRIST = 2500;

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name !== CACHE) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

/**
 * Der Einstiegspunkt heißt immer gleich, egal welche Adresse aufgerufen wurde.
 * Sonst legt jede Variante -- mit und ohne Schrägstrich, mit Suchteil -- einen
 * eigenen Eintrag an, und offline passt keiner davon.
 */
function schluessel(anfrage) {
  return anfrage.mode === 'navigate' ? new Request(self.registration.scope) : anfrage;
}

/** Netz mit Frist. Kommt nichts, entscheidet der Aufrufer. */
function ausDemNetz(anfrage, frist) {
  if (frist === undefined) return fetch(anfrage).catch(() => undefined);
  return new Promise((fertig) => {
    let erledigt = false;
    const gib = (antwort) => {
      if (erledigt) return;
      erledigt = true;
      fertig(antwort);
    };
    setTimeout(() => gib(undefined), frist);
    fetch(anfrage).then(gib, () => gib(undefined));
  });
}

self.addEventListener('fetch', (event) => {
  const anfrage = event.request;
  if (anfrage.method !== 'GET') return;
  if (new URL(anfrage.url).origin !== self.location.origin) return;

  const istDokument = anfrage.mode === 'navigate';

  event.respondWith(
    (async () => {
      const speicher = await caches.open(CACHE);
      const key = schluessel(anfrage);

      const ablegen = async (antwort) => {
        // Nur vollständige Antworten ablegen. Eine 404 oder ein Teilstück (206)
        // im Speicher wäre schlimmer als kein Eintrag.
        if (antwort && antwort.ok && antwort.status === 200) {
          await speicher.put(key, antwort.clone());
        }
        return antwort;
      };

      if (istDokument) {
        const frisch = await ausDemNetz(anfrage, NETZFRIST);
        if (frisch && frisch.ok) {
          event.waitUntil(ablegen(frisch.clone()));
          return frisch;
        }
        const alt = await speicher.match(key);
        return alt ?? frisch ?? Response.error();
      }

      const treffer = await speicher.match(key);
      if (treffer) return treffer;
      const antwort = await ausDemNetz(anfrage);
      if (antwort) await ablegen(antwort);
      return antwort ?? Response.error();
    })(),
  );
});

/*
 * Dienstarbeiter. Er ist der Grund, warum die App im Wald ohne Empfang läuft:
 * beim ersten Aufruf legt er alles ab, was die Seite lädt, und bedient danach
 * jede weitere Anfrage aus dem eigenen Speicher.
 *
 * Bewusst kein Vorabladen einer Dateiliste: die Namen tragen nach dem Bauen
 * einen Hash, und eine falsch gepflegte Liste ist schlimmer als gar keine.
 * Stattdessen füllt sich der Speicher beim ersten Besuch von selbst -- die
 * Startseite lädt ohnehin alles, was die App braucht.
 *
 * Achtung: Ein Dienstarbeiter läuft nur auf einem Ursprung, dessen Zertifikat
 * der Browser anerkennt. Über ein selbst ausgestelltes Zertifikat im WLAN
 * verweigert Chrome die Anmeldung -- dort gibt es also weder Offlinebetrieb
 * noch Installation. Dafür braucht es echtes Hosting.
 */
const CACHE = 'fibo-v1';

self.addEventListener('install', () => {
  // Kein Vorabladen, also nichts zu tun -- aber gleich übernehmen, damit der
  // erste Besuch schon vom Speicher profitiert.
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

self.addEventListener('fetch', (event) => {
  const anfrage = event.request;
  if (anfrage.method !== 'GET') return;
  if (new URL(anfrage.url).origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const speicher = await caches.open(CACHE);
      const key = schluessel(anfrage);
      const treffer = await speicher.match(key);

      const ausDemNetz = fetch(anfrage)
        .then(async (antwort) => {
          // Nur vollständige Antworten ablegen. Eine 404 oder ein
          // Teilstück (206) im Speicher wäre schlimmer als kein Eintrag.
          if (antwort.ok && antwort.status === 200) {
            await speicher.put(key, antwort.clone());
          }
          return antwort;
        })
        .catch(() => undefined);

      if (treffer) {
        // Aus dem Speicher antworten, im Hintergrund erneuern. Im Wald ohne
        // Empfang startet die App dadurch sofort, statt in einen Zeitablauf
        // zu laufen.
        event.waitUntil(ausDemNetz);
        return treffer;
      }

      return (await ausDemNetz) ?? Response.error();
    })(),
  );
});

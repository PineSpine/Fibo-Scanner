import { defineConfig } from 'vite';
import { hostname, networkInterfaces } from 'node:os';
import basicSsl from '@vitejs/plugin-basic-ssl';

/**
 * Die Kamera laeuft nur in einem sicheren Kontext. `localhost` gilt als sicher,
 * die IP-Adresse im WLAN nicht -- deshalb zwei Betriebsarten:
 *
 *   npm run dev         http auf localhost, fuer die Arbeit am Rechner
 *   npm run dev:https   https im WLAN, fuer den Test am Telefon
 *
 * Das Zertifikat ist selbst ausgestellt, das Telefon warnt einmal und laesst
 * einen weiter. Danach ist die Seite ein sicherer Kontext und die Kamera geht.
 * Kein Tunnel, kein fremder Server -- passt zu "Keine Cloud".
 */
const https = process.env['FIBO_HTTPS'] === '1';

/**
 * Namen und Adressen, die ins Zertifikat sollen.
 *
 * Achtung, Fussangel: das Plugin traegt alles als DNS-Namen ein. Ein DNS-Eintrag
 * "192.168.0.25" passt aber nicht auf eine URL mit dieser IP -- dafuer braeuchte
 * es einen iPAddress-Eintrag, und den kann das Plugin nicht. Die IPs stehen
 * trotzdem drin, sie kosten nichts; wer die IP aufruft, bekommt eben zwei
 * Beanstandungen statt einer. Beide laesst Chrome wegtippen.
 *
 * Der Rechnername mit ".local" ist der saubere Weg: Android und iOS loesen ihn
 * ueber mDNS auf, und als echter DNS-Name passt er auf das Zertifikat. Dann
 * bleibt nur noch die eine Beanstandung, die sich nicht vermeiden laesst --
 * dass niemand den Aussteller kennt.
 */
function eigeneNamen(): string[] {
  const namen = ['localhost', '127.0.0.1', '::1', `${hostname()}.local`, hostname()];
  for (const liste of Object.values(networkInterfaces())) {
    for (const eintrag of liste ?? []) {
      if (eintrag.family === 'IPv4' && !eintrag.internal) namen.push(eintrag.address);
    }
  }
  return namen;
}

export default defineConfig({
  /**
   * Wohin die App gelegt wird. Netlify, Cloudflare Pages und Vercel liefern
   * unter der Wurzel aus, da bleibt es bei "/". GitHub Pages haengt den
   * Projektnamen davor -- dann vor dem Bauen FIBO_BASE=/fibo-scanner/ setzen,
   * sonst sucht die Seite ihre Schriften an der falschen Stelle.
   */
  base: process.env['FIBO_BASE'] ?? '/',
  plugins: https ? [basicSsl({ name: 'fibo-scanner', domains: eigeneNamen() })] : [],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Ohne diese Zeile weist der Entwicklungsserver Anfragen ab, die nicht auf
    // localhost lauten -- also genau die vom Telefon, und auch die ueber einen
    // Tunnel. Der Server laeuft nur beim Entwickeln.
    allowedHosts: true,
  },
  preview: { host: true, port: 4173, allowedHosts: true },
  build: { target: 'es2022' },
});

/**
 * Wie dev:https, aber fuer den gebauten Stand aus dist/ -- also mit
 * Dienstarbeiter, ohne Entwicklungswerkzeug und mit der Geschwindigkeit, die
 * das Telefon spaeter wirklich sieht. Vorher `npm run build`.
 *
 * Aufruf: npm run preview:https
 */
import { preview } from 'vite';
import { networkInterfaces } from 'node:os';

process.env['FIBO_HTTPS'] = '1';

const server = await preview();
const port = server.config.preview.port ?? 4173;

console.log('');
console.log('  FIBO-Scanner — gebauter Stand mit https');
console.log('  ' + '─'.repeat(56));
console.log('');
console.log(`  am Rechner       https://localhost:${port}/`);
for (const [name, liste] of Object.entries(networkInterfaces())) {
  for (const eintrag of liste ?? []) {
    if (eintrag.family !== 'IPv4' || eintrag.internal) continue;
    console.log(`  am Telefon       https://${eintrag.address}:${port}/`.padEnd(52) + `(${name})`);
  }
}
console.log('');
console.log('  Achtung: hier läuft der Dienstarbeiter. Nach einem neuen Bau');
console.log('  im Telefon einmal hart neu laden, sonst zeigt er den alten Stand.');
console.log('');

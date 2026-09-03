/**
 * Startet den Entwicklungsserver mit https, damit die Kamera auf dem Telefon
 * laeuft. Ohne sicheren Kontext gibt kein Browser sie frei, und `localhost`
 * gilt nur auf dem Rechner selbst als sicher.
 *
 * Aufruf: npm run dev:https
 */
import { createServer } from 'vite';
import { hostname, networkInterfaces } from 'node:os';

process.env['FIBO_HTTPS'] = '1';

interface Adresse {
  ip: string;
  schnittstelle: string;
  vermutlichVpn: boolean;
  /** Sieht nach dem echten Drahtlosnetz aus, nicht nach einem Adapter. */
  vermutlichWlan: boolean;
}

/** Alle IPv4-Adressen, unter denen der Rechner im Netz erreichbar ist. */
function adressen(): Adresse[] {
  const gefunden: Adresse[] = [];
  for (const [name, liste] of Object.entries(networkInterfaces())) {
    for (const eintrag of liste ?? []) {
      if (eintrag.family !== 'IPv4' || eintrag.internal) continue;
      gefunden.push({
        ip: eintrag.address,
        schnittstelle: name,
        // VPN- und Virtualisierungsadapter liefern Adressen, unter denen das
        // Telefon den Rechner nicht erreicht. Sie zu nennen, aber zu
        // kennzeichnen, spart die Sucherei.
        vermutlichVpn: /vpn|nord|wireguard|tun|tap|virtualbox|vmware|hyper-v|zerotier|tailscale/i.test(
          name,
        ),
        vermutlichWlan: /wlan|wi-?fi|wireless|^wl|^en0$/i.test(name),
      });
    }
  }
  return gefunden;
}

const server = await createServer();
await server.listen();

const port = server.config.server.port ?? 5173;
const netz = adressen();
// Die Reihenfolge ist die Empfehlung: das Drahtlosnetz zuerst. Virtuelle
// Adapter (VirtualBox, Hyper-V) heissen oft schlicht "Ethernet 3" und sind
// nicht sicher zu erkennen -- deshalb bleiben sie in der Liste, nur weiter unten.
const brauchbar = netz
  .filter((a) => !a.vermutlichVpn)
  .sort((a, b) => Number(b.vermutlichWlan) - Number(a.vermutlichWlan));

console.log('');
console.log('  FIBO-Scanner — Entwicklungsserver mit https');
console.log('  ' + '─'.repeat(56));
console.log('');
console.log(`  am Rechner       https://localhost:${port}/`);
console.log('');
// Der Rechnername steht oben, weil er die bessere Adresse ist: er passt aufs
// Zertifikat, die IP nicht. Loest das Telefon ihn nicht auf, bleibt die IP.
console.log(`  am Telefon       https://${hostname()}.local:${port}/`.padEnd(52) + '← zuerst diese');
brauchbar.forEach((a) => {
  console.log(
    `                   https://${a.ip}:${port}/`.padEnd(52) + `(${a.schnittstelle})`,
  );
});
for (const a of netz.filter((x) => x.vermutlichVpn)) {
  console.log(`  (übersprungen)   ${a.ip} — ${a.schnittstelle}, vermutlich VPN oder virtuell`);
}
console.log('');
console.log('  Das Zertifikat hat niemand bestätigt, das Telefon warnt einmal:');
console.log('    Chrome  → "Erweitert" → "Weiter zu … (unsicher)"');
console.log('    Safari  → "Details einblenden" → "Diese Website besuchen"');
console.log('  Danach ist die Seite ein sicherer Kontext und die Kamera geht.');
console.log('  Über den Rechnernamen ist es eine Warnung, über die IP zwei.');
console.log('');
console.log('  Geht nichts: Windows-Firewall lässt Node eingehend auf Port');
console.log(`  ${port} vermutlich nicht durch, oder ein aktives VPN leitet das`);
console.log('  WLAN um. Beides steht in der README unter "Auf dem Telefon".');
console.log('');

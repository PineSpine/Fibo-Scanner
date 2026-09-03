# FIBO-Scanner

Misst Muster in der Natur mit der Handykamera. Alles rechnet auf dem Gerät.

Was gebaut werden soll, steht in [CLAUDE.md](CLAUDE.md). Diese Datei sagt, was
davon steht und wie man es anfasst.

---

## Stand

| | |
|---|---|
| **M1 — Box-Counting** | gebaut, kalibriert, läuft am Gerät |
| **M4 — Parastichen** | gebaut, gegen Blütenstände nach Vogel kalibriert |
| M2 — Spektralsteigung | nicht angefangen (die FFT dafür steht schon) |
| M3 — Rotationssymmetrie | nicht angefangen |
| M5 — Packung / Voronoi | nicht angefangen |

**Alle Verfahren laufen gleichzeitig.** Nichts wird umgeschaltet: Die App soll
sagen, was im Bild steckt, nicht fragen, wonach man suchen will. Das Verfahren
mit dem höchsten Vertrauen steht groß über dem Bild, die übrigen als Zeile
darunter, jede mit einem Vertrauensbalken.

Ein spezifisches Verfahren geht dabei vor: Box-Counting hat zu jedem Bild etwas
zu sagen, die Spiralenzählung schweigt fast immer. Meldet sie sich, ist das die
interessantere Auskunft — sonst verdeckt das Häufige das Seltene.

Die Abnahmebedingung für M1 lautet: *der Wert schwankt bei ruhiger Hand über
zehn Sekunden um weniger als 0,05*. Die App misst diese Schwankung selbst und
zeigt sie an. Sie und ein gefundenes Fibonacci-Paar sind die einzigen beiden
Anlässe, bei denen die App Gold benutzt.

---

## Loslegen

```bash
npm install
npm run dev
```

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver auf Port 5173 |
| `npm run dev:https` | dasselbe mit https, für den Test am Telefon |
| `npm run preview:https` | gebauten Stand aus `dist/` mit https ausliefern |
| `npm test` | Alle Tests einmal |
| `npm run typecheck` | Nur die Typprüfung |
| `npm run kalibrierung` | Kalibriertabelle drucken (siehe unten) |
| `npm run fixtures` | Referenzbilder als PNG nach `test/fixtures/` schreiben |
| `npm run build` | Typprüfung und Produktionsbau nach `dist/` |

Fünf Abhängigkeiten, alle nur zur Entwicklungszeit: Vite, Vitest, TypeScript,
die Node-Typen und `@vitejs/plugin-basic-ssl` für das Selbstzertifikat. Zur
Laufzeit lädt die App nichts nach.

Die Skripte laufen ohne eigenen Runner — Node ab 22.18 führt TypeScript direkt
aus. Deshalb tragen alle relativen Importe im Projekt die Endung `.ts`.

### Aufs Telefon bringen

Es gibt zwei verschiedene Aufgaben, und sie brauchen verschiedene Wege.

#### Unterwegs benutzen — dafür muss die App gehostet werden

Die App rechnet vollständig auf dem Gerät und braucht im Wald keine Verbindung.
Aber sie muss **einmal** von irgendwoher geladen und installiert werden, und
dieses Irgendwo muss ein Zertifikat haben, das der Browser anerkennt:

- Die Kamera verlangt einen sicheren Kontext.
- Der Dienstarbeiter — das Stück, das die App offline verfügbar macht — verlangt
  mehr als das: Chrome verweigert ihm die Anmeldung auf einem Ursprung mit
  selbst ausgestelltem Zertifikat. **Ohne echtes Hosting also kein
  Offlinebetrieb und keine Installation.**

Gewählter Weg: **GitHub Pages**, veröffentlicht durch
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Der Workflow
läuft bei jedem Push auf `main`, führt erst die Tests aus — eine Änderung an
`metrics/`, die die Referenzbilder verfehlt, soll gar nicht erst auf dem Telefon
landen —, setzt den Basispfad selbst und lädt `dist/` hoch.

Einmalig einzurichten:

1. Auf GitHub ein leeres Repository anlegen, **ohne** README, `.gitignore` oder
   Lizenz — die liegen hier schon.
2. Verknüpfen und hochladen:

   ```bash
   git remote add origin https://github.com/<konto>/<repo>.git
   git push -u origin main
   ```

3. Im Repository unter *Settings → Pages* bei *Source* **GitHub Actions**
   auswählen. Nicht *Deploy from a branch* — der Workflow liefert das Ergebnis
   direkt ab, es gibt keinen `gh-pages`-Zweig.
4. Unter *Actions* zusehen. Nach etwa einer Minute steht die Adresse
   `https://<konto>.github.io/<repo>/` im Schritt *veroeffentlichen*.

Ab dann veröffentlicht jeder Push von selbst.

**Der Basispfad regelt sich allein.** Eine Projektseite liegt unter `/<repo>/`,
eine Nutzerseite (`<konto>.github.io`) unter `/`; der Workflow erkennt beides und
setzt `FIBO_BASE`. Nur wer von Hand für ein Unterverzeichnis baut, muss es selbst
angeben:

```powershell
$env:FIBO_BASE = '/fibo-scanner/'; npm run build
```

Sonst sucht die Seite ihre Schriften an der falschen Stelle. In Git Bash bitte
`MSYS_NO_PATHCONV=1` davorsetzen, sonst verbiegt die Shell den Pfad in einen
Windows-Pfad unterhalb des Git-Verzeichnisses.

**Zum Repository selbst:** GitHub Pages braucht auf einem kostenlosen Konto ein
öffentliches Repository. Deshalb steht `docs/moodboard/` in der `.gitignore` —
die Pins stammen von anderen Leuten, und aus der Git-Historie bekommt man sie
nicht ohne Weiteres wieder heraus. Der lokale Ordner bleibt unberührt. Wird das
Repository privat, genügt es, die Zeile zu löschen.

Am Telefon dann einmal aufrufen und über das Browsermenü **Zum Startbildschirm
hinzufügen**. Von da an:

- startet die App im Vollbild ohne Adressleiste,
- lädt sie aus dem eigenen Speicher, auch ohne Empfang,
- verlässt weiterhin kein Bild das Gerät.

Nach einem neuen Bau zeigt der Dienstarbeiter beim ersten Start noch den alten
Stand und holt den neuen im Hintergrund — der zweite Start ist aktuell. Wer
nicht warten will, lädt im Browser einmal hart neu.

#### Was das über Mobilfunk kostet

Über WLAN, über mobile Daten, über fremdes Gastnetz — die App ist eine ganz
gewöhnliche Website und lädt überall. Was dabei über die Leitung geht:

| | über Netz |
|---|---|
| Ornament (`ornament.png`) | 139,1 KB |
| drei Schriftschnitte | 104,2 KB |
| JavaScript, HTML, CSS, Rest | 14,2 KB |
| **erster Aufruf** | **257,5 KB** |
| **jeder weitere Aufruf** | **0 KB** |
| **eine Messung** | **0 KB** |

Der zweite Wert stimmt, weil der Dienstarbeiter alles behält. Der dritte, weil
die App keinen einzigen Netzwerkaufruf enthält — nachprüfbar:

```bash
grep -rn "fetch(\|XMLHttpRequest\|WebSocket\|sendBeacon" src/
```

Die Antwort ist leer. Kein Analysedienst, kein Schrift-CDN, keine Karte, kein
Bild-Upload. Was die Kamera sieht, geht in die Grafikeinheit und wieder heraus,
mehr nicht.

Das Ornament ist mit 54 Prozent der größte Posten. Es lädt als Graustufenbild
mit Alphakanal, nicht als RGBA — im Stylesheet dient es nur als `mask-image`,
die Farbkanäle sieht ohnehin niemand (`npm run ornament` stellt es aus der
Vorlage in `docs/` her, spart 30 KB, sieht identisch aus). Wer weiter runter
will, müsste die Auflösung senken oder die Linien als SVG nachzeichnen — beides
verändert das Aussehen und lohnt für einen einmaligen Viertelmegabyte kaum.

#### Beim Entwickeln am Telefon prüfen

Fürs schnelle Ausprobieren zwischendurch, ohne jedes Mal zu veröffentlichen.
Hier gibt es keinen Offlinebetrieb — das ist zum Entwickeln auch nicht gewollt.

```bash
npm run dev:https
```

Das startet den Entwicklungsserver mit einem selbst ausgestellten Zertifikat und
druckt die Adressen. **Den Rechnernamen nehmen, nicht die IP** — also
`https://<rechnername>.local:5173/`. Android und iOS lösen ihn über mDNS auf,
und er steht als Name im Zertifikat; über die IP gibt es eine Beanstandung mehr.
Nachprüfbar:

```bash
node -e "const t=require('tls');const s=t.connect({host:'192.168.0.25',port:5173,rejectUnauthorized:false},()=>{console.log(t.checkServerIdentity('192.168.0.25',s.getPeerCertificate())?.message ?? 'Name passt');s.end()})"
```

Der Browser warnt trotzdem einmal, weil den Aussteller niemand kennt: in Chrome
über *Erweitert → Weiter zu … (unsicher)*, in Safari über *Details einblenden →
Diese Website besuchen*. Danach geht die Kamera.

Erreicht das Telefon den Rechner nicht, in dieser Reihenfolge prüfen: gleiches
WLAN (nicht das Gastnetz), VPN aus — auf beiden Geräten —, Client-Isolation im
Router, Firewall. Auf diesem Rechner ist letztere bereits offen: es gibt eine
Eingangsregel *Node.js JavaScript Runtime* für die Node-Programmdatei, gültig
für die Profile *Privat* und *Öffentlich*, und das WLAN läuft als *Öffentlich*.

#### Android per Kabel — der beste Weg zum Fehlersuchen

Wenn ein Android-Telefon zur Hand ist, ist das die stabilste Variante, und sie
bringt die Entwicklerwerkzeuge mit:

1. Am Telefon: *Einstellungen → Über das Telefon → Build-Nummer* siebenmal
   antippen, dann *Entwickleroptionen → USB-Debugging* einschalten.
2. Telefon per Kabel anschließen, am Telefon die Verbindung bestätigen.
3. Am Rechner `npm run dev` starten — **ohne** https, das braucht es hier nicht.
4. In Chrome am Rechner `chrome://inspect/#devices` öffnen, auf *Port
   forwarding* klicken, `5173` → `localhost:5173` eintragen und aktivieren.
5. Am Telefon `http://localhost:5173` aufrufen.

Das Telefon hält die Adresse für `localhost` und damit für sicher — keine
Zertifikatswarnung. Und auf derselben `chrome://inspect`-Seite lässt sich die
Seite am Telefon per *inspect* öffnen: Konsole, Netzwerk und Profiler vom
Rechner aus, während die Kamera am Telefon läuft. Für die Fehlersuche an M1 ist
das der Unterschied zwischen Raten und Sehen.

#### Beim Messen im Freien

- Der Bildschirm bleibt während der Messung wach (Wake Lock), damit die zehn
  Sekunden nicht am Bildschirmtimeout scheitern.
- Wird die App in den Hintergrund geschoben, endet die Messung und die Kamera
  wird freigegeben — sonst leuchtet die Kameraanzeige weiter.
- Die Marginalie unter dem Bild ist das Messprotokoll: Schwankung, Vertrauen,
  Kantendichte, r², Messungen je Sekunde und ob die Belichtung gesperrt werden
  konnte. Wenn im Wald etwas nicht stimmt, steht dort, was.

### Prüfstand für den Shader

`npm run dev`, dann `/pruefstand.html` aufrufen. Die Seite schickt die
Referenzbilder durch die echte Rechenkette auf der Grafikkarte und vergleicht
das Kantenbild Pixel für Pixel mit `src/metrics/sobel.ts`. Erwartet: alle Pixel
weichen um höchstens 1 von 255 ab, die Dimension um weniger als 0,01.

---

## Aufbau

```
src/
  camera/      Kamerazugriff, Belichtungssperre
  gpu/         WebGL2-Kontext, Shader, Rechenkette mit asynchronem Rückweg
  metrics/     Messverfahren — reine Funktionen, keine Seiteneffekte
               (boxCounting, parastichen, dazu fft, logPolar, sobel, regression)
  ui/          Anzeige
  calibration/ Glättung und Schwankungsmessung
test/
  fixtures/    Referenzbilder und synthetische Szenen, im Code erzeugt
scripts/       Kalibriertabelle, PNG-Export
```

Der Weg eines Bildes:

1. **Kamera** liefert einen Videostrom, Rückkamera bevorzugt, Belichtung
   gesperrt, sobald die Messung läuft.
2. **Erster Shader-Durchgang** schneidet den mittigen quadratischen Ausschnitt
   heraus, mittelt ihn auf 512 × 512 und wandelt ihn in Graustufen (Rec. 709).
3. **Zweiter Durchgang** rechnet den Sobel-Betrag. Graubild und Kantenbild
   liegen in zwei Kanälen desselben Ziels, damit nur einmal gelesen wird.
4. **Rückweg** über einen Pixelpuffer mit Zaun: das Ergebnis wird ein bis zwei
   Frames später abgeholt, statt die CPU anzuhalten.
5. **Otsu** trennt Kante von Fläche, mit einer festen Untergrenze gegen
   Sensorrauschen.
6. **Kästchenzählung** über fünf Skalen (2, 4, 8, 16, 32 Pixel), Steigung der
   Ausgleichsgeraden im log-log-Raum.
7. **Anzeige** zeigt den geglätteten Wert, seine Konfidenz und seine Schwankung.

Das Kamerabild selbst wird nie verändert. Der sichtbare Bildbereich ist
quadratisch und deckt sich mit dem ausgewerteten Ausschnitt — der Sucher zeigt
genau das, was gemessen wird.

---

## Kalibrierung

`npm run kalibrierung` druckt:

```
Referenzbilder — als Kantenbild eingespeist, prüft allein die Zählung

Motiv                      D    Soll       Δ  Schw.   Dichte      r² Vertr.
Sierpinski-Dreieck     1.585   1.585   0.000    128    7.5 %  1.0000   1.00
Koch-Schneeflocke      1.310   1.262   0.048    128    2.6 %  0.9995   1.00
Weißes Rauschen        1.982   2.000  -0.018    128   50.0 %  0.9999   0.11
Leere Fläche           0.000   0.000   0.000      8    0.0 %  0.0000   0.00

Szenen — ganze Kette: Graubild, Sobel, Otsu, Zählung

glatte Wand            0.000       —              8    0.0 %  0.0000   0.00
Backsteinwand          1.515       —             16   17.4 %  0.9942   1.00
Baum r=0,60            1.598       —             36    2.5 %  0.9994   1.00
Baum r=0,68            1.672       —             33    5.9 %  0.9995   1.00
Baum r=0,72            1.714       —             33    9.4 %  0.9998   1.00
Baum r=0,76            1.761       —             33   16.1 %  1.0000   1.00
Bildrauschen           1.917       —             57   42.2 %  0.9985   0.52
```

Die Erwartungswerte aus der Projektbeschreibung — Backsteinwand 1,2 · Farnwedel
1,7 · Baumkrone 1,8 · Rauschen 2,0 — werden von den Szenen der Reihe nach
getroffen. Die Bäume sind das brauchbarste synthetische Gegenstück zu Farn und
Winterkrone; ihre Dimension steigt sauber mit dem Verzweigungsverhältnis.

### Spiralenzählung (M4)

Das Bild wird um seine Mitte in Log-Polar-Koordinaten gelegt — waagerecht der
Winkel, senkrecht der Logarithmus des Radius — und fouriertransformiert. Eine
Spiralanordnung ist selbstähnlich unter Drehung und Streckung; in diesen
Koordinaten wird daraus eine Verschiebung, das Muster also periodisch. **Die
Winkelfrequenz eines Spektralgipfels ist dann unmittelbar die Zahl der
Spiralarme** — m Arme kreuzen jeden Kreis genau m-mal. Ganzzahlig von Natur aus,
es muss nichts gerundet werden. Das Vorzeichen der Radiusfrequenz trennt die
beiden Drehrichtungen.

Kalibriert an Blütenständen nach Vogel (*Mathematical Biosciences* 44, 1979):

| Blütchen | gemessen |
|---|---|
| 200 · 400 | 21/34 |
| 700 | 34/55 |
| 1200 · 2000 · 3000 | 55/89 |

Welches Paar sichtbar wird, hängt vom Radius ab: die Blütchen bleiben gleich
groß, der Umfang wächst nach außen. Deshalb wertet das Verfahren einen Kreisring
aus, nicht die ganze Scheibe.

**Der gefährlichere Fehler ist nicht, Spiralen zu übersehen, sondern welche zu
behaupten.** Zwei Tore verhindern das, beide an den Vergleichsmotiven gemessen:

| | Struktur im Ring | Gipfelhöhe |
|---|---|---|
| Blütenstand | 36 – 40 | **174 – 277** |
| fraktale Fläche, Baum | 23 – 26 | 30 – 93 (beide Richtungen dieselbe Zahl) |
| Backsteinwand | 6,5 | 8 |
| glatte Wand | 6,1 | 7 |
| Rauschen | 23 | 4 |

Ein Bild muss überhaupt Struktur enthalten (sonst teilt man Rauschen durch
Rauschen), und die schwächere der beiden Familien muss deutlich über dem
Untergrund liegen. Ein Testfall prüft ausdrücklich, dass Backsteinwand, glatte
Wand, Baum, fraktale Fläche und Rauschen auf Vertrauen null enden — jedes mit
dem Grund, der wirklich zutrifft.

### Zwei Entscheidungen, die sich aus der Tabelle ergeben haben

**Schwellwert nach Otsu, nicht als festes Perzentil.** Ein festes Perzentil ist
stabiler gegen Belichtungswechsel — aber es hält die Kantendichte fest, und die
trägt selbst Information. Mit fester Dichte rücken Backsteinwand, Farn und
Rauschen auf einen Bereich von 0,4 zusammen, mit Otsu liegen sie über 1,5
auseinander. Die Belichtung wird stattdessen an der Kamera gesperrt.

**Die Kästchenzahl wird über vier Gitterlagen minimiert.** Sie ist als kleinste
Überdeckung definiert, nicht als die eines beliebig gelegten Rasters. Ohne diese
Minimierung wandert die Dimension eines rasterparallelen Motivs um 0,13, sobald
die Hand um ein Pixel abweicht — ein Drittel des gesamten Schwankungsbudgets von
M1 verschenkt, bevor die Messung anfängt. Mit ihr liegt die Spanne über alle
Gitterlagen unter 0,0001.

---

## Wo der Wert lügt

- **Ausschnitt und Abstand.** Füllt das Motiv das Bild, sind die groben Kästchen
  alle belegt, und der Wert steigt. Dieselbe Buche misst sich anders, wenn sie
  klein im Bild steht. Das ist keine Ungenauigkeit, sondern die Frage, über
  welche Größen gemessen wird — das Erklärblatt nennt deshalb den Skalenbereich
  ausdrücklich.
- **Flächen ohne scharfe Kanten** (Nebel, weiche Verläufe) liefern eine Zahl,
  der das Verfahren selbst nicht traut. Die Konfidenz fällt dann auf null, und
  die Zahl tritt zurück, statt zu verschwinden.
- **Die Koch-Schneeflocke misst sich 0,048 zu hoch.** Ihre Dreiteilung passt
  nicht ins Zweierraster des Zählgitters, und die Minimierung über die
  Gitterlagen drückt die groben Skalen stärker als die feinen. Der Fehler ist
  systematisch und reproduzierbar; der Test prüft ihn zweifach, gegen den
  Sollwert mit Toleranz und eng gegen den Istwert.
- **Bei weichen Verläufen genügt ein Graustufenschritt**, um den Otsu-Schnitt zu
  verschieben und die Dimension um bis zu 0,03 zu bewegen. Bei kantenreichen
  Motiven — Ast, Fuge, Blattrand — liegt derselbe Vergleich bei 0,000.

---

## Gestaltung

Farben, Schriften und Ton stehen im Styleguide in [CLAUDE.md](CLAUDE.md).
Umgesetzt ist:

- **Schreibschrift nur für den App-Titel.** Italianno auf der Startansicht, sonst
  nirgends. Überschriften und Fachbegriffe laufen in kursivem EB Garamond.
- **Messwerte in Tabellenziffern** (`lining-nums tabular-nums`), damit die
  Anzeige bei dreißig Bildern je Sekunde nicht in der Breite zappelt.
- **Gold bedeutet genau eine Sache:** die Schwankung ist unter 0,05 gefallen.
- **Eine einzige Bewegung.** Wird der Wert stabil, wächst er sanft in Position.
  Sonst nichts. `prefers-reduced-motion` wird beachtet.
- **Die Skizze** liegt als Randornament unten rechts, angeschnitten, bei 13 %
  Deckkraft, eingefärbt über `mask-image` — Variante 2 aus der Projektbeschreibung.
  Sie ist gebaut, um angesehen und dann entschieden zu werden.

Schriften liegen selbst gehostet unter `public/fonts/` (SIL Open Font License,
siehe `LIZENZ.txt` daneben), damit die App offline läuft und beim Aufruf keine
Verbindung zu Google entsteht.

---

## Was als Nächstes ansteht

1. **M1 im Wald abnehmen.** Telefon, Farn, zehn Sekunden ruhig halten, auf die
   Schwankungsanzeige sehen.
2. **M4 an einem echten Blütenstand prüfen.** Sonnenblume, Kiefernzapfen,
   Romanesco. Die Kalibrierung steht gegen gerechnete Muster; ein fotografierter
   Zapfen ist unordentlicher. Weicht es ab, stehen die Zahlen im Messprotokoll:
   Spiralen je Richtung, Gipfelschärfe, Struktur im Ring.
3. Fällt die Schwankung nicht unter 0,05, sind die Verdächtigen in dieser
   Reihenfolge: nachregelnder Autofokus (die Belichtung ist bereits gesperrt,
   der Fokus nicht), Bewegungsunschärfe bei wenig Licht, und die Empfindlichkeit
   des Otsu-Schnitts bei kontrastarmen Motiven.
4. Über die Platzierung der Skizze entscheiden.

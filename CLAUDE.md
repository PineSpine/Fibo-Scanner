# FIBO-Scanner

Eine Web-App, die per Handykamera Muster in der Natur misst und erklärt: fraktale
Dimension, Selbstähnlichkeit, Symmetrie, Phyllotaxis.

Privatprojekt. Kein Produkt, kein Store, kein Nutzerkonto.

> Diese Datei ist Auftrag **und** Zustandsbericht. Abschnitte unter
> [Auftrag](#auftrag) sind Vorgabe und gelten weiter. Abschnitte unter
> [Stand](#stand) beschreiben, was gebaut ist — sie sind änderbar, aber nur mit
> Grund. Wo eine Entscheidung von der ursprünglichen Vorgabe abweicht, steht
> dabei, warum.

---

## Stand

**Live: https://pinespine.github.io/Fibo-Scanner/** · Repo `PineSpine/Fibo-Scanner`
(öffentlich) · jeder Push auf `main` veröffentlicht von selbst.

| Meilenstein | Zustand |
|---|---|
| **M1 — Box-Counting** | gebaut, kalibriert, läuft am Gerät |
| **M4 — Spiralen** | Kettenzählung (Blütchen → Nachbarn → Kreuzungen), nur beim Festhalten. Gerechnet exakt; **echte Fotos nur ungefähr** („≈ 34/55"), kein Urteil |
| M2 — Spektralsteigung | offen (die FFT dafür steht bereits in `metrics/fft.ts`) |
| M3 — Rotationssymmetrie | offen (Log-Polar steht bereits in `metrics/logPolar.ts`) |
| M5 — Packung / Voronoi | offen |

117 Tests, 13 Dateien. `npm test` muss grün sein, bevor irgendetwas gepusht wird —
der Workflow bricht sonst ab und veröffentlicht nicht.

### Übergabe — wo wir stehen (21.09.2026)

Der Code-Stand ist der jüngste Commit auf `main`.
Jeder Push baut neu — die Zeile „Stand" im Messprotokoll zeigt die Bauzeit des
letzten Pushs in UTC, nicht die des Codes. Was seit dem ersten Feldtest geschah, in einem Absatz:
Messreihe mit Standbild gebaut („Messung festhalten") → M1 damit
reproduzierbar → M4 zappelte weiter → Diagnose: die Spiralenzählung per
Fouriertransformation braucht die Blütenmitte pixelgenau (Mittelsuche gebaut)
und zählt an echten Blüten trotzdem nicht → ersetzt durch die **Kettenzählung**
(`metrics/ketten.ts`), die an gerechneten Blüten exakt und an echten ungefähr
zählt und das auch so anzeigt. Unterwegs gefunden und behoben: das Messbild
stand auf dem Kopf; die Anzeige zeigte Zahlen und Gold ohne Vertrauen.

**Worauf gewartet wird:** der Feldtest der Kettenzählung am Telefon an einem
*geeigneten* Motiv — Zapfen oder ein Blütenstand mit Blütchen als deutlichen
Punkten, bei Tageslicht. Der erste Versuch an einer blühenden Sonnenblume
abends zählte nichts, und das zu Recht (siehe
[Feldtest der Kettenzählung](#feldtest-der-kettenzählung-21092026)). Ablesen:
steht „≈ …" oder eine exakte Zahl, folgen die gezeichneten Ketten den
Blütchenreihen, wie lange dauert die Auswertung. Danach
[Nächster Schritt](#nächster-schritt), Punkt 2.

**Arbeitsweise, die sich bewährt hat:** Jede Änderung an einem Verfahren erst
mit dem Prüfskript an allen Motiven messen (`node scripts/ketten-probe.ts lang`,
`npm run kalibrierung`), dann Tests, dann UI. Behauptungen über Ursachen erst
nach einem Gegentest. Was nicht hilft, wieder herausnehmen und im Code
vermerken, warum („Versucht und verworfen").

**Der Feldtest hat den entscheidenden Mangel gezeigt:** Beide Verfahren werten
je ein einzelnes Bild aus, und ein einzelnes Bild aus der Hand ist eine
Zufallsgröße. Angezeigt wurde davon immer das jüngste — also der Zufall selbst.
Die Spiralenzahl wechselte im Millisekundentakt, und damit war keine Aussage
reproduzierbar. Gegenmaßnahme ist die **Messreihe** (siehe
[Reliabilität](#reliabilität)): Nicht der letzte Wert zählt, sondern der, auf
den sich viele Bilder geeinigt haben — und wie einig sie waren, steht daneben.

**Offen und wichtig:** Die Abnahmebedingung für M1 — *Schwankung unter 0,05 über
zehn Sekunden bei ruhiger Hand* — ist am Gerät **noch nicht bestätigt**. Die App
misst und zeigt diese Schwankung selbst an (Messprotokoll, Zeile „Schwankung,
10 s"); sie färbt sich ockergolden, sobald die Bedingung erfüllt ist. Bis das
jemand draußen gesehen hat, gilt M1 als gebaut, nicht als abgenommen.

Die ursprünglich geplante Reihenfolge M1 → M2 → … wurde bewusst verlassen: Nach
M1 wurde M4 vorgezogen, weil es das namensgebende Feature ist. M2 folgt erst,
wenn M4 am Gerät geprüft ist — ein weiteres Verfahren, das dieselben Schwächen
erbt, macht die App nicht besser.

---

## Auftrag

### Ziel

Der Nutzer hält das Handy auf einen Farn, eine Baumkrone, eine Sonnenblume oder
eine Hauswand und sieht sofort Zahlen, die beschreiben, wie das Ding gebaut ist.
Die App liefert Tendenzen, keine Beweise. Sie soll den Blick schulen, nicht den
Doktortitel verleihen.

### Nicht-Ziele

- **Keine psychedelischen Filter.** Keine Kaleidoskope, kein Warping des
  Kamerabilds. Wer das will, nimmt Hyperspektiv.
- **Keine Zahlenmystik.** Die App behauptet nie, der Goldene Schnitt stecke
  überall. Wenn nichts Auffälliges gemessen wird, sagt sie das.
  *Das ist die Regel, die in der Praxis am häufigsten gebrochen zu werden droht —
  siehe [Fallstricke](#fallstricke).*
- **Keine Vierdimensionalität.** Dafür gibt es kein Messverfahren.
- **Kein natives App-Projekt.** Kein Swift, kein Kotlin, kein React Native.
- **Keine Cloud.** Alles rechnet auf dem Gerät. Keine Bilder verlassen das Handy.
  Nachprüfbar: `grep -rn "fetch(\|XMLHttpRequest\|WebSocket\|sendBeacon" src/`
  ist leer.

### Code-Regeln

- TypeScript, `strict: true`, dazu `noUncheckedIndexedAccess` und
  `exactOptionalPropertyTypes`.
- Messverfahren sind **reine Funktionen** ohne Seiteneffekte. Kamera und Anzeige
  bleiben außen vor. Ein Verfahren bekommt einen `Frame` und gibt ein `Result`.
- Jedes Verfahren bekommt Unit-Tests gegen Referenzbilder, **bevor** es in die UI
  geht.
- Kommentare erklären das Warum, nicht das Was. Bei Formeln die Quelle nennen.
- Deutsche Bezeichner in der UI, englische im Code. Gewachsene Ausnahme: Die
  neueren Module (`ui/`, `camera/belichtung.ts`, `scripts/`) sind durchgängig
  deutsch benannt, weil sie eng an den angezeigten Begriffen hängen. Nicht
  vereinheitlichen, ohne dass es einen Anlass gibt.
- **Keine Abhängigkeit hinzufügen, ohne den Nutzen zu begründen.** Bisher fünf,
  alle nur zur Entwicklungszeit. Zur Laufzeit lädt die App nichts nach.

---

## Stack

| Bereich | Wahl |
|---|---|
| Laufzeit | Browser, als PWA installierbar |
| Kamera | `getUserMedia`, Rückkamera bevorzugt, Belichtungssperre mit Rückfahrt |
| Rechnen | WebGL2 für Vorverarbeitung, JS für Auswertung |
| Build | Vite 7, TypeScript, keine UI-Bibliothek |
| Tests | Vitest 4 |
| Stil | CSS, handgeschrieben |
| Deployment | GitHub Pages, statisch, HTTPS |

Abhängigkeiten: `vite`, `vitest`, `typescript`, `@types/node`,
`@vitejs/plugin-basic-ssl`. Kein OpenCV.js — 8 MB WASM für Kantendetektion sind
Unfug, ein Sobel-Shader sind 20 Zeilen. FFT und PNG-Ein-/Ausgabe sind ebenfalls
selbst geschrieben, jeweils unter hundert Zeilen und gegen eine direkte
Berechnung geprüft.

**Node ab 22.18 führt TypeScript direkt aus** — deshalb brauchen die Skripte
keinen eigenen Runner. Preis dafür: **alle relativen Importe im Projekt tragen
die Endung `.ts`.** Wer eine Datei anlegt, hält sich daran, sonst laufen die
Skripte nicht mehr.

---

## Loslegen

```bash
npm install
npm test
npm run dev
```

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver, Port 5173 |
| `npm run dev:https` | dasselbe mit Selbstzertifikat, für den Test am Telefon |
| `npm run preview:https` | gebauten Stand aus `dist/` mit https ausliefern |
| `npm test` | alle Tests einmal |
| `npm run typecheck` | nur die Typprüfung (zwei tsconfigs) |
| `npm run build` | Typprüfung und Produktionsbau nach `dist/` |
| `npm run kalibrierung` | Kalibriertabelle drucken — **das wichtigste Werkzeug** |
| `npm run fixtures` | Referenzbilder als PNG nach `test/fixtures/` schreiben |
| `npm run ornament` | Maske aus der Federzeichnung erzeugen |
| `npm run icon` | App-Zeichen aus der Federzeichnung schneiden |
| `node scripts/ketten-probe.ts [lang]` | Kettenzählung auf allen Motiven — **das wichtigste Werkzeug für M4** |

Zusätzlich: `/pruefstand.html` im Entwicklungsserver vergleicht den Sobel-Shader
Pixel für Pixel mit der CPU-Referenz. Ein Shader lässt sich nicht ohne Browser
testen; das ist der Ersatz. Erwartet: alle Pixel innerhalb von 1 von 255.

Weitere Prüfskripte ohne festen Sollwert, zum Nachsehen beim Kalibrieren:
`gemeinsam-probe.ts` (beide Verfahren auf allen Motiven, plus Rechenzeit),
`spektrum-probe.ts` (Log-Polar-Spektren im Vergleich), `parastichen-probe.ts`,
`mittelsuche-probe.ts` (Mittelsuche auf allen Motiven, mit Rechenzeit),
`ketten-probe.ts` (Kettenzählung: gerechnet, Fremdmotive, echte Blütenstände —
diese nur, wenn lokal vorhanden, siehe unten; `lang` zeigt jeden Ring).

### Aufs Telefon

Zum **Benutzen** führt kein Weg an echtem Hosting vorbei: Der Dienstarbeiter
meldet sich nur auf einem Ursprung an, dessen Zertifikat der Browser anerkennt.
Über ein Selbstzertifikat gibt es also keine Installation und keinen
Offlinebetrieb. Deshalb GitHub Pages.

Zum **Entwickeln** genügt `npm run dev:https`. Den Rechnernamen nehmen
(`https://<name>.local:5173/`), nicht die IP — er steht im Zertifikat, die IP
nicht. Für Android ist die Kabelvariante besser: `chrome://inspect/#devices`,
Port forwarding `5173`, dann `http://localhost:5173` am Telefon. Gilt als sicher
und bringt die Entwicklerwerkzeuge mit.

---

## Architektur

```
src/
  camera/      camera.ts        Zugriff, Belichtungssperre mit Rückfahrt
               belichtung.ts    wartet, bis die Automatik zur Ruhe kommt
               wakeLock.ts      Bildschirm wach halten
  gpu/         context.ts       WebGL2-Kontext (mit Alphakanal!)
               shaders.ts       Verkleinern, Sobel, Kantenüberlagerung
               pipeline.ts      zwei Durchgänge, asynchroner Rückweg über PBO
  metrics/     types.ts         Frame, Result, Skala, Metric
               boxCounting.ts   M1
               ketten.ts        M4: Blütchen, Nachbarketten, Kreuzungen zählen
               parastichen.ts   Mittelsuche (und die alte Fourierzählung, nur noch geprüft)
               fft.ts           Radix-2, iterativ — für M4, später M2
               logPolar.ts      Abrollen um die Mitte — für M4, später M3
               sobel.ts         CPU-Referenz, Vorlage für den Shader
               threshold.ts     Otsu mit Untergrenze
               regression.ts    Ausgleichsgerade mit r²
  ui/          anzeige.ts       Befundliste, Messprotokoll, Erklärungen
               nachzeichnung.ts zeichnet gefundene Spiralen ins Bild
  calibration/ stability.ts     Schwankungsfenster und Glättung
               messreihe.ts     viele Einzelmessungen zu einem Befund
               bewegung.ts      Bildunruhe zwischen zwei Messbildern
  main.ts                       Schleife, Verfahrensauswahl, Verdrahtung
test/fixtures/ images.ts        Sierpinski, Koch, Rauschen, leer
               scenes.ts        Wand, Backstein, fBm, Verzweigungsbaum, Weichzeichner
               phyllotaxis.ts   Blütenstände nach Vogel
               stoerung.ts      verschieben, verrauschen — wie draußen
test/fotos/                     eigene Fotos, eingecheckt (fixtures/*.png sind erzeugt und ignoriert)
test/test_messungen/            fremde Bilder und Bildschirmfotos -- IGNORIERT, nie einchecken
scripts/       png.ts           gemeinsamer PNG-Leser und -Schreiber
```

### Die Schnittstelle

```ts
interface Metric {
  id: string;
  label: string;               // deutsch, kurz, kein Fachbegriff
  skala?: Skala;               // feste Spanne, falls es eine gibt
  run(frame: Frame): Result;
  confidence(r: Result): number;   // 0..1, ehrlich
  explain(r: Result): string;      // was DIESER Wert bedeutet
  phaenomen: readonly string[];    // was das Phänomen ist, absatzweise
  verfahren: readonly string[];    // wie die App es misst, absatzweise
}

interface Result {
  value: number;
  label?: string;    // wenn eine Zahl nicht reicht: "34/55"
  deutung?: string;  // drei Wörter: "stark verzweigt"
  detail: Readonly<Record<string, number>>;
  caveats: readonly string[];
}
```

`confidence` ist Pflicht, nicht Kür. Ein Messwert ohne Vertrauensangabe ist eine
Behauptung.

Die Felder über der ursprünglichen Vorgabe hinaus sind alle aus einem konkreten
Mangel entstanden: `label`, weil zwei Spiralenzahlen in keine Zahl passen;
`deutung` und `skala`, weil „1,82" nichts sagt, solange man die Spanne nicht
kennt; `phaenomen` und `verfahren`, weil ein einzelner Erklärtext beides
vermischte und dadurch keins von beidem tat. **Ein neues Verfahren bringt seine
Erklärtexte selbst mit; die Anzeige kennt kein einziges Verfahren beim Namen.**

### Die Schleife

Alle Verfahren laufen **gleichzeitig**, es wird nichts umgeschaltet. Die App soll
sagen, was im Bild steckt, nicht fragen, wonach man suchen will.

- `jedesNte` staffelt die teureren. Box-Counting 4,4 ms bei jedem Bild
  (Zeit vom Entwicklungsrechner). Die Spiralenzählung läuft nicht mehr in der
  Schleife, siehe `nurFestgehalten`.
- `stetig` sagt, ob geglättet werden darf. Eine Spiralenzahl ist ganzzahlig; ein
  Mittel aus 34 und 55 wäre 44,5 und damit eine Zahl, die es nicht gibt.
- `spezifisch` heißt: Das Verfahren passt nur auf bestimmte Motive. Ein
  spezifisches Verfahren mit Vertrauen ab 0,6 bekommt den Hauptplatz, auch wenn
  ein Dauerverfahren nominell höher steht — sonst verdeckt das Häufige das
  Seltene. Box-Counting hat zu jedem Bild etwas zu sagen, die Spiralenzählung
  fast nie.
- Ein Wechsel des Hauptbefundes braucht 0,15 Vorsprung, sonst springt die
  Überschrift bei jedem Bild.
- `nurFestgehalten`: Die Spiralenzählung rechnet **nicht live**. Während einer
  Reihe legt die Schleife drei Bilder im Abstand von 700 ms beiseite; nach dem
  Festhalten sammelt jedes Bild Stimmen (Mittelsuche, dreißig Gitter, gut eine
  Sekunde je Bild am Entwicklungsrechner), und dann wird über alle zugleich
  entschieden (`kettenStimmen` → `entscheide`). In Häppchen, damit die Anzeige
  nicht stillsteht (Zustand `auswertung`). Live steht in ihrer Zeile nur die
  Anleitung.
- **Während einer Messreihe rechnet jedes Verfahren bei jedem Bild.** Die
  Staffelung spart Rechenzeit im Dauerbetrieb; in den zweieinhalb Sekunden einer
  Reihe ist jede Einzelmessung eine Stimme.

---

## Reliabilität

Die Verfahren selbst sind kalibriert und tun, was sie sollen — der Mangel lag
eine Ebene darüber: **eine Einzelmessung wurde für einen Befund gehalten.**

### Die Messreihe

Der Knopf „Messung festhalten" sammelt zweieinhalb Sekunden lang
Einzelmessungen, fasst sie zusammen, friert das Kamerabild ein und stellt den
Befund still. Nochmal drücken heißt „Weiter messen".

Die Zusammenfassung hängt davon ab, was für eine Größe gemessen wird — dieselbe
Unterscheidung wie bei der Glättung (`stetig`), und aus demselben Grund:

| Größe | Zusammenfassung | warum |
|---|---|---|
| fraktale Dimension | **Median** | Ein einziges verwackeltes Bild zieht den Mittelwert um Zehntel. Der Median sieht es nicht. |
| Spiralenzahlen | **Abstimmung** | Ein Mittel aus 34 und 55 wäre 44,5 — eine Zahl, die es nicht gibt. |

**Die Einigkeit ist selbst ein Messwert.** Sie steht unter jedem festgehaltenen
Wert: „einig in 41 von 58 Messungen". Im Nenner stehen *alle* Bilder der Reihe,
auch die, die nichts gefunden haben — wenn zwei Drittel geschwiegen haben,
gehört das in die Aussage. Das Vertrauen ist das Produkt aus dem, was die
Verfahren den tragenden Bildern zugetraut haben, und dem Anteil, den sie
ausmachen. Beides muss stimmen.

Unter einem Viertel Einigkeit (`EINIGKEIT_MINDEST`) zeigt die App **keinen
Wert**, sondern den Grund: „die Messungen widersprechen einander — 6 von 58".
Das ist dieselbe Regel wie überall sonst: Der gefährlichere Fehler ist nie,
etwas zu übersehen, sondern etwas zu behaupten.

### Erster Feldtest der Messreihe (21.09.2026)

| Motiv | fraktale Dimension | Spiralen |
|---|---|---|
| Dahlie, ganze Blüte | 1,24 · einig in 90 von 91 · Spanne 0,044 | „12/13", Vertrauen 3 %, 26 von 91 |
| Zinnie, ganze Blüte | 1,39 · einig in 88 von 97 · Spanne 0,057 | **„5/8" in Gold**, Vertrauen 1 %, 86 von 97 |

**M1 ist mit der Reihe reproduzierbar**, die Spanne innerhalb einer Reihe liegt
um die Abnahmegrenze von 0,05.

**M4 hat nichts gefunden — und das war richtig.** Nachgerechnet am Standbild:
Gipfelhöhe 33 bis 51, also der Bereich von Baum und fraktaler Fläche, nicht der
eines Blütenstands (90 bis 277). Gezählt wurden die Blütenblätter (Dahlie 12 bis
14), nicht die Blütchen. Eine Verschiebung um vier Pixel kippt 13/14 auf 13/13
und 5/8 auf 7/8 — so sieht das Zappeln aus, wenn es keinen echten Gipfel gibt.

**Der Fehler lag in der Anzeige.** Sie zeigte jede Zahl mit Vertrauen über null
und machte ein Fibonacci-Paar golden, egal wie sicher. Seitdem gelten zwei
Grenzen an einer Stelle (`messreihe.ts`): Unter `VERTRAUEN_GERING` (0,15) keine
Zahl, sondern Strich und Grund — live, als Stimme in der Reihe und im
festgehaltenen Befund. Gold, Nachzeichnung und Hauptplatz erst ab
`VERTRAUEN_GUT` (0,6). Die beiden Fotos liegen als `test/fotos/`
bei und müssen unter der Anzeigegrenze bleiben.

### Die Blütenmitte muss gesucht werden

Die ehrliche Bestandsaufnahme nach dem ersten Feldtest ergab: Die
Spiralenzählung hätte draußen **nie** funktionieren können, auch nicht an einer
perfekten Sonnenblume. Sie rollte das Bild um die Bildmitte ab und nahm damit
an, dort liege die Blütenmitte — auf etwa einen Pixel genau.

Warum so genau: Verschiebt man die Mitte um δ, verrutscht jede der m Spiralen
am inneren Messring (Radius r ≈ 100 Pixel) um etwa m·δ/r im Winkel. Ab etwa
einer Einheit ist das Muster zerstört. Für 89 Spiralen heißt das gut ein Pixel.
Gemessen an gerechneten Blütenständen, weichgezeichnet und verrauscht:

| Blütchen | 0 px | 2 px | 4 px | 8 px |
|---|---|---|---|---|
| 400 (21/34) | 100 % | 45 % | 2 % | 0 % |
| 700 (34/55) | 100 % | 72 % | 17 % | 0 % |
| 2000 (55/89) | 100 % | 14 % | 0 % | 0 % |

**Das ist kein Problem der Hand, sondern des Zielens** — auch ein Stativ hilft
nicht, solange niemand die Blüte pixelgenau mittig stellt. Und es war nie
aufgefallen, weil die Kalibrierung nur exakt zentrierte Blütenstände kannte.

**`sucheMitte()`**: Bergsteigen auf der Gipfelschärfe, vorher ein grobes Raster
von 5 × 5 Punkten im Abstand 16. Findet die Mitte auf einen Pixel genau, bei
Versatz bis mindestens ±45 Pixel (ein Sechstel des Bildes); 0,2 bis 0,6 s am
Entwicklungsrechner. Ohne Raster blieb der Aufstieg einmal an einem
Nebengipfel hängen. In der Reihe bekommt nur das erste Bild die volle Suche,
die weiteren steigen von der zuletzt gefundenen Mitte aus.

**Wer sucht, findet auch im Rauschen etwas.** Die Suche hob das Vertrauen der
Fotos von 9 auf 20 % (Dahlie) und 0 auf 15 % (Zinnie). Für gesuchte Befunde
gilt deshalb Gipfelhöhe ab **60** statt 30, gemessen mit
`scripts/mittelsuche-probe.ts`:

| nach der Suche | Gipfelhöhe |
|---|---|
| Blütenstände, auch verrauscht und versetzt | 90,6 – 157 |
| Fremdmotive mit zwei verschiedenen Zahlen | höchstens 53,6 (Foto Zinnie) |
| fraktale Fläche | 85, aber in beiden Richtungen dieselbe Zahl — schließt aus |

**Noch nicht gemessen, nur überschlagen:** Neigung. Schräg gehalten wird der
Kreis zur Ellipse, mit ähnlicher Wirkung wie ein falscher Mittelpunkt. 21/34
verträgt nach der Überschlagsrechnung 15 bis 20 Grad, 55/89 eher ±10.

### Die Fouriertransformation zählt an echten Blüten nicht

Zweiter Feldtest (Bildschirmfotos) und danach die **Originalbilder** selbst,
formatfüllend zugeschnitten, mit Mittelsuche:

| Bild | Fourier | vermutlich richtig |
|---|---|---|
| Sonnenblume, markiert | 55/85, Gipfel 13 | 55/89 |
| Sonnenblume, nah | 29/55, Gipfel 24 | 34/55 |
| Sonnenblume, Abend | 40/60, Gipfel 18 | 34/55 |
| Zapfen, grau | 8/12, Gipfel 40 | 8/13 |
| Zapfen, rot | 8/11, Gipfel 28 | 8/13 |

Die Zahlen liegen in der richtigen Gegend, aber eins bis vier daneben, und kein
Gipfel erreicht die 60. Ausgeschlossen als Ursache: Neigung (Ellipsensuche,
Achsenverhältnis 0,98–1,0, kein Gewinn), Beleuchtung (Kontrastnormierung, kein
Gewinn), Bildschirm-Moiré (Originale genauso). Übrig bleibt: Echte
Blütenstände sind unregelmäßig — Spiralen enden, spalten sich, wechseln die Zahl
mit dem Radius —, und ein globales Spektrum über einen breiten Ring verschmiert
das. Schmale Ringe zeigen die Abfolge (13/21 → 21/34 → 36/55), aber schwach.

### Die Kettenzählung

`metrics/ketten.ts` zählt wie ein Botaniker: Blütchen finden (Differenz zweier
Weichzeichnungen, jede Größe und Helligkeit ein eigenes Gitter), jedes mit dem
nächsten Nachbarn weiter außen verbinden, links- und rechtsdrehend, und für
Kreise um die Mitte zählen, wie viele Verbindungen jeder Schar sie kreuzen.
Fehlende und doppelte Blütchen gleicht die Lückengröße aus. Je Ring stimmen alle
Gitter ab, die dort regelmäßig zählen (`REGELMAESSIG_AB` 0,6); der Ring nimmt
den Median.

**Exakt** nur, wenn zwei benachbarte Ringe genau dasselbe Paar zählen und sich
in jedem die Mehrheit der Gitter einig ist. Nur dann ein Fibonacci-Urteil und
Gold. Sonst **ungefähr**: „≈ 35/55", Vertrauen fest unter 0,5
(`UNGEFAEHR_HOECHSTENS`), mit „auf ±3 genau – zu ungenau für eine
Fibonacci-Aussage". Ein ungefähres Paar wird nie golden.

| Motiv | Kettenzählung, drei Bilder zusammen |
|---|---|
| gerechnete Blütenstände, verrauscht, versetzt | **exakt**, samt Abfolge 5/8 → 8/13 → 13/21 → 21/34 → 34/55 → 55/89 |
| Backsteinwand, Wand, Baum, fraktale Fläche, Rauschen, Dahlie, Zinnie | nichts |
| Sonnenblume, Abend | ≈ 34/55 |
| Sonnenblume, nah | ≈ 22/34 (innen; außen ≈ 35/55) |
| Sonnenblume, markiert | ≈ 59/88 |
| Zapfen, grau | ≈ 8/12 |
| Zapfen, rot | nichts |

**Warum nicht exakt an echten Blüten:** Die Gitter sind sich an einem Ring nur
zu 10 bis 40 % einig — nicht jedes Gitter findet jedes Blütchen. Die kleinere
der beiden Zahlen liegt meist zu hoch: Die dritte, gleichsinnig drehende Schar
(bei 34/55 die 89er) mischt sich ein.

**Zusammenzählen über drei Bilder** verdreifacht die Stütze und rückt die
Mediane näher an die Wahrheit. **Die Mindestzahlen an Gittern wachsen mit der
Zahl der Bilder** — ohne das meldeten fraktale Fläche „≈ 10/13" und
Backsteinwand „≈ 24/26", und ein Zapfen stand als exakt „7/10 – kein
Fibonacci-Paar" da.

**Versucht und verworfen:** Verbindungen nach der typischen Richtung der Schar
wählen statt nach der Länge. Half an einer Sonnenblume (erstmals exakt 34/55),
schadete insgesamt: An den Übergängen wechselt die Richtung, gerechnete
Blütenstände verloren ein Drittel ihrer Stütze, ein Zapfen fiel heraus. Ebenso
strengere Regelmäßigkeit (0,75/0,85): kaum mehr Einigkeit, viel weniger Stütze.

Die Mitte kommt weiter aus `sucheMitte()`: Dort leistet die Fouriertransformation,
was sie soll.

### Feldtest der Kettenzählung (21.09.2026)

Echte Sonnenblume in voller Blüte, abends in der Wohnung, drei Abstände:
M1 1,34 bis 1,58, einig in 97 bis 104 von gut 100 Messungen. **Spiralen:
nichts, an allen drei.** Nachgerechnet an den Standbildern (Zuschnitte nur
lokal, `test/test_messungen/4/`): nichts, auch mit von Hand gesetzter Mitte
(die Mittelsuche lag ~30 px daneben — nicht die Ursache), auch am inneren Teil
der Scheibe in fast doppelter Auflösung. Örtliche Kontrastnormierung erzeugte
nur Zufallspaare um falsche Mitten — verworfen.

**Ursache ist das Motiv:** Außen sind die Röhrenblüten offen — Borsten, keine
Punkte; innen die Knospen 3 bis 5 Pixel, dunkelbraun auf Schwarz, von der
Rauschunterdrückung verwischt. An jedem Ring zählten höchstens ein bis vier
Gitter regelmäßig. **Die App hat richtig geschwiegen.** Falsch war nur der
Hinweis „Blütenmitte formatfüllend halten" — die Scheibe füllte das Bild
bereits. Er heißt jetzt „zu fein, zu dunkel oder ohne Reihen", und die
Erklärung nennt, welche Motive taugen.

### Bildunruhe

`calibration/bewegung.ts` misst den mittleren Helligkeitsunterschied zwischen
zwei Messbildern. Die Zahl steht im Messprotokoll und beantwortet bei jedem
zappelnden Wert die erste Frage: **lag es am Verfahren oder an der Hand?**

Bewusst **kein Tor** — es wird kein Bild verworfen, weil es „zu unruhig" wäre.
Eine solche Schwelle müsste am Gerät gemessen sein, und das ist sie nicht.
Unruhige Bilder erledigen sich in der Reihe von selbst: Sie sind sich
untereinander uneinig, und genau das meldet die Reihe. **Die Schwelle ist noch
nicht kalibriert; die Zahl steht da, damit sie es werden kann.**

---

## Kalibrierung

Der größte Fehlerquell: Beleuchtung, Abstand, Tiefenschärfe. Dieselbe Buche
liefert je nach Zoom eine andere Dimension.

**`npm run kalibrierung` ist das wichtigste Werkzeug des Projekts.** Jede
Änderung an `metrics/` wird zuerst dort angesehen, dann erst in der UI.

### Referenzbilder (M1)

Als Kantenbild eingespeist, prüfen also allein die Zählung:

| Motiv | gemessen | Soll |
|---|---|---|
| Sierpinski-Dreieck | **1,585** | 1,585 (exakt, rasterparallel) |
| Koch-Schneeflocke | 1,310 | 1,262 |
| Weißes Rauschen | 1,982 | 2,0 |
| leere Fläche | 0, Vertrauen 0 | 0 |

Die Koch-Abweichung von +0,048 ist systematisch und bekannt: Ihre Dreiteilung
passt nicht ins Zweierraster des Zählgitters, und die Minimierung über die
Gitterlagen drückt die groben Skalen stärker als die feinen. Der Test prüft
zweifach — gegen den Sollwert mit Toleranz und eng gegen den Istwert, damit eine
Änderung am Verfahren nicht unbemerkt durchrutscht.

### Ganze Kette (M1)

| Motiv | D |
|---|---|
| glatte Wand | 0,00 (Vertrauen 0) |
| Backsteinwand | 1,52 |
| Baum r = 0,60 … 0,76 | 1,60 … 1,76 |
| Bildrauschen | 1,92 |

Die Erwartungswerte aus dem Auftrag — Wand 1,2 · Farn 1,7 · Krone 1,8 ·
Rauschen 2,0 — werden der Reihe nach getroffen.

### Blütenstände (M4)

Kettenzählung (`node scripts/ketten-probe.ts`), gerechnete Blütenstände nach
Vogel, weichgezeichnet, verrauscht und um bis zu 20 Pixel versetzt — alle
exakt, 100 %:

| Blütchen | gemessen (tragender Bereich) | nach außen |
|---|---|---|
| 400 | 21/34 | 5/8 → 8/13 → 13/21 → 21/34 → 34/55 |
| 700 | 34/55 | 5/8 → … → 34/55 → 55/89 |
| 1200 · 2000 | 55/89 | 8/13 → … → 55/89 (2000: → 89/144) |

Welches Paar sichtbar wird, hängt vom Radius ab: Die Blütchen bleiben gleich
groß, der Umfang wächst nach außen. Deshalb zählt das Verfahren an 21 Kreisen
von 0,15 bis 0,97 des Randabstands (`KETTEN_RING`) und nicht einmal für die
ganze Scheibe. Die Fourierzählung (`npm run kalibrierung`, `parastichen-probe`)
trifft dieselben Paare an gerechneten Blüten; sie ist nur an echten gescheitert.

Echte Blütenstände: siehe [Die Kettenzählung](#die-kettenzählung). Die
Zuschnitte dafür entstehen so (Windows PowerShell, `System.Drawing`):
Ausschnitt so wählen, dass der Blütenstand das Quadrat füllt, auf 512 × 512
bikubisch verkleinern, als PNG nach `test/test_messungen/3/zuschnitt/`. Nie
anderswohin.

### Die Schwellen und woher sie kommen

Alle Zahlen unten sind gemessen, nicht geschätzt. Wer sie ändert, misst vorher
neu.

**Box-Counting.** Skalenbereich 2 bis 32 Pixel auf 512 × 512, also fünf Skalen.
Nach unten: Bei einem Pixel Kästchenbreite zählt das Verfahren Pixel statt
Struktur. Nach oben: Kästchen ab 64 Pixeln erfassen nur noch den Umriss.
Schwellwert nach **Otsu**, Untergrenze 8 auf dem durch 4 geteilten Sobel-Betrag.

**Kettenzählung.** Ein Gitter zählt an einem Ring nur mit, wenn beide Scharen
regelmäßig kreuzen (`REGELMAESSIG_AB` 0,6) und zwei *verschiedene* Zahlen
ergeben (gleiche heißen Rechteckgitter). Ein Ring zählt ab 3 Gittern je Bild
(`GITTER_MINDEST`), exakt ab 4 je Bild und mehrheitlicher Einigkeit
(`EXAKT_GITTER`, `EXAKT_EINIG`). Ungefähr höchstens 0,5 Vertrauen
(`UNGEFAEHR_HOECHSTENS`). Alle an `ketten-probe.ts` gemessen; die Grenzen
zwischen „Fremdmotiv meldet nichts" und „echte Blüte meldet ungefähr" sind
schmal — wer sie verschiebt, misst beide Seiten neu.

**Fourierzählung (nur noch Mittelsuche und Vergleich).** Zwei Tore, beide
müssen offen sein:

| Motiv | Struktur im Ring | Gipfelhöhe |
|---|---|---|
| Blütenstand | 36 – 40 | **174 – 277** |
| fraktale Fläche, Baum | 23 – 26 | 30 – 93 (beide Richtungen dieselbe Zahl) |
| Backsteinwand | 6,5 | 8 |
| glatte Wand | 6,1 | 7 |
| Rauschen | 23 | 4 |

Daraus: Struktur mindestens 10, Gipfelhöhe mindestens 30 — nach einer
Mittelsuche mindestens 60 (siehe [Reliabilität](#reliabilität)). Der Abstand zwischen
den Gruppen ist die eigentliche Aussage, nicht die Schwelle selbst.

### Zwei Entscheidungen gegen das Naheliegende

**Otsu statt festem Dichte-Perzentil.** Ein Perzentil ist stabiler gegen
Belichtungswechsel, friert aber die Kantendichte ein — und die trägt selbst
Information. Mit fester Dichte rücken Backsteinwand, Farn und Rauschen auf eine
Spanne von 0,4 zusammen; mit Otsu liegen sie über 1,5 auseinander. Die Belichtung
wird stattdessen an der Kamera gesperrt.

**Kästchenzahl über vier Gitterlagen minimiert.** Sie ist als kleinste
Überdeckung definiert, nicht als die eines beliebig gelegten Rasters. Ohne diese
Minimierung wandert die Dimension eines rasterparallelen Motivs um 0,13, sobald
die Hand ein Pixel abweicht — ein Drittel des M1-Budgets verschenkt, bevor die
Messung anfängt. Mit ihr liegt die Spanne unter 0,0001.

### Belichtung

`camera/belichtung.ts` beobachtet die mittlere Helligkeit und meldet, wenn sie
zur Ruhe gekommen ist. **Erst dann** greift die Sperre, und `lockExposure()` gibt
die laufenden Werte mit (`exposureTime`, `iso`, `exposureCompensation`). Danach
folgt eine Prüfphase von anderthalb Sekunden: Fällt die Helligkeit unter 65 % des
Werts davor, wird die Sperre zurückgenommen und nicht wieder versucht. Bilder aus
der Einpendelphase gehen weder in die Glättung noch ins Zehn-Sekunden-Fenster.

Warum so umständlich: siehe [Fallstricke](#fallstricke).

---

## UI-Prinzipien

- **Alle Befunde an einer Stelle**, in einer Liste unter dem Bild, das
  aussagekräftigste zuerst und größer.
  *Abweichung vom ursprünglichen „Zahlen liegen über dem Kamerabild": Bei einem
  Verfahren ging das auf, bei zweien stand einer im Bild und der andere darunter
  — und den zweiten übersah man verlässlich. Über dem Bild steht jetzt nur, was
  mit dem Bild selbst nicht stimmt („Belichtung pendelt sich ein", „Zu dunkel");
  ist alles in Ordnung, bleibt es frei.*
- **Über dem Bild liegt die Nachzeichnung**, und nur sie: die gezählten
  Ketten, Verbindung für Verbindung, dort, wo gezählt wurde. Findet ein
  Verfahren nichts, wird nichts gezeichnet — eine Linie ohne Befund wäre eine
  Behauptung. Der Knopf „Kanten zeigen" legt die gezählten Kantenpixel in
  Grünspan darüber, mit demselben Otsu-Schwellwert, mit dem gezählt wurde.
  *Die Ketten erscheinen schon bei geringem Vertrauen, nicht erst bei gutem:
  Sie sind der Beleg der Zählung, nicht eine Behauptung über das Bild. Wer
  „≈ 35/55" liest, soll sehen, welche Blütchen verbunden wurden. Papierfarbe auf
  einem Hof aus Tinte, zweite Schar gestrichelt — Grünspan allein verschwand auf
  dunklen Blütchen. Golden nur bei einem exakten Fibonacci-Paar.*
- **Ungefähr steht als ungefähr da.** „≈ 35/55" mit Tilde, darunter „auf ±3
  genau – zu ungenau für eine Fibonacci-Aussage" und „aus 3 Bildern
  zusammengezählt" (nicht „einig in 3 von 3" — es gab keine drei Zählungen,
  die sich einig sein könnten).
- **Jede Zahl bekommt eine Einordnung.** Drei Wörter („stark verzweigt") und, wo
  es eine feste Spanne gibt, eine kleine Achse mit Marke: Linie 1,0 links,
  Fläche 2,0 rechts. Eine nackte Zahl beantwortet nicht, ob sie viel ist.
- **Niedrige Konfidenz zeigt die App als solche an** — die Zahl tritt zurück,
  daneben steht der Grund („zu wenig Kontrast", „zu wenig Struktur — kein
  Blütenstand im Bild"). Ohne Vertrauen gar keine Zahl, sondern ein Strich.
- **Gold hat genau zwei Anlässe:** ein *exakt gezähltes* Fibonacci-Paar mit
  Vertrauen ab 0,6 (`VERTRAUEN_GUT`) und die erfüllte
  Abnahmebedingung von M1. Sonst nirgends.
- **Ein festgehaltener Wert sagt, worauf er sich stützt.** „einig in 41 von 58
  Messungen" steht dort, wo sonst nur das Vertrauen steht. Wer eine Messung
  festhält, will wissen, ob sie reproduzierbar ist — und das soll die Messung
  selbst beantworten, nicht das Gefühl des Betrachters.
- **Über dem Bild liegt auch der Zielring** — zwei gestrichelte Kreise, wo die
  Spiralen gezählt werden, und ein Kreuz in der Mitte.
  *Abweichung von „nur die Nachzeichnung": Der Ring behauptet nichts über das
  Bild, er zeigt, wo gemessen wird — wie die Eckmarken. In Papierfarbe, nicht
  in Grünspan, damit er nicht wie ein Befund aussieht. Am Standbild
  verschwindet er. Die Radien kommen aus `LOGPOLAR_STANDARD`.*
  *Verworfen wurde eine eingeblendete Goldene Spirale: Ihr Zentrum liegt nicht
  in der Mitte, sie kommt in keiner Sonnenblume vor, und als feste Kurve passt
  sie auf jedes Motiv ein bisschen — genau die Zahlenmystik, die die App nicht
  betreibt. Sie steht jetzt im Erklärtext, als das, was sie nicht ist.*
- **Das Standbild sagt, dass es eines ist.** Über dem eingefrorenen Bild steht
  „Standbild — Messreihe über 2,4 s". Ein stehendes Bild ohne diesen Satz hält
  man für eine hängengebliebene Kamera.
- **Erklärungen ausklappbar, je Verfahren eine**, und zweiteilig: erst das
  Phänomen wie ein kurzer Lexikoneintrag, dann wie die App es misst. Zwei
  verschiedene Fragen — die erste stellt sich jedem einmal, die zweite nur dem,
  der der Zahl nicht traut.
- **Wenig Text auf der Oberfläche.** Was erklärt werden muss, liegt hinter einem
  Griff.
- Alles auf Deutsch. Fachbegriffe stehen im Erklärtext, nicht in der Anzeige:
  „Fibonacci-Spiralen", nicht „Parastichen".
- Kein Bewertungston. Nicht „wunderschön fraktal!", sondern „1,74 — stark
  verzweigt".

---

## Styleguide

Die App soll aussehen wie das Notizbuch einer Naturforscherin, die es mit der
Magie nicht so genau nimmt: verschnörkelt, handgemacht, ein bisschen verwunschen.
Nicht wie ein Messgerät.

**Die eine Regel, die alles zusammenhält:** Der Schnörkel steckt in der Hülle,
nie im Messwert. Titel, Rahmen, Ornamente dürfen schwelgen. Die Zahl bleibt
nüchtern und sofort lesbar.

### Schrift

| Rolle | Wahl |
|---|---|
| App-Titel | Italianno |
| Überschriften | EB Garamond, kursiv |
| Fließtext | EB Garamond |
| Messwerte | EB Garamond, `font-variant-numeric: lining-nums tabular-nums` |

Tabellenziffern, weil die Anzeige bei dreißig Bildern je Sekunde sonst in der
Breite zappelt. Schreibschrift **nur** für den App-Titel — nie für Fachbegriffe,
nie unter 32 px. Und **keine `text-transform`** auf Knöpfen: Beschriftungen
stehen so da, wie sie geschrieben sind.

Schriften liegen selbst gehostet in `public/fonts/` (SIL Open Font License),
damit die App offline läuft und beim Aufruf keine Verbindung zu Google entsteht.

### Farben

```
--ink      #241E1A   Eisengallustinte. Linien, Text.
--paper    #E6E1CE   gealtertes Papier. Flächen.
--patina   #4E7A6B   Grünspan. Akzent, Kurven, Kantenüberlagerung.
--gold     #B8862F   Ocker. Nur für Treffer — zwei Anlässe, sonst keiner.
--veil     rgba(36, 30, 26, 0.55)   Schleier über dem Kamerabild
```

Kein Creme-Beige mit Terrakotta-Akzent — das ist der Standardanstrich generierter
Seiten. `--paper` ist bewusst kühler und grüner.

### Die Zeichnung

`docs/michaelendething_skizze/michaelendething-alpha.png` — Federzeichnung,
verzweigte Ranken um ein Gittergerüst, freigestellt mit der Tinte im Alphakanal.

**Entschieden: Variante 2**, Randornament unten rechts angeschnitten, 13 %
Deckkraft, über `mask-image` in `--ink` eingefärbt. `npm run ornament` erzeugt
`public/ornament.png` daraus — als Graustufenbild mit Alphakanal statt RGBA, weil
die Farbkanäle einer Maske niemand sieht (spart 30 KB).

**Das App-Zeichen** ist die gezeichnete Spirale am rechten Rand derselben
Vorlage, Tinte auf Papier. `npm run icon`; der Ausschnitt steht als eine
Konstante oben im Skript. Die Zeichen müssen im HTML **ausdrücklich benannt**
sein — sonst holt der Browser die `favicon.ico` aus der Wurzel der Domain, und
dort liegt eine andere App.

### Bewegung

Ein einziger orchestrierter Moment: Wird ein Messwert stabil oder ein
Fibonacci-Paar gefunden, wächst er sanft in Position. Sonst nichts.
`prefers-reduced-motion` respektieren.

Moodboard: `docs/moodboard/` — Federstrich-Ornamente, einfarbige Tinte auf
Papier, Kupferstich-Register. **Absichtlich nicht in Git** (siehe `.gitignore`):
Das Repo ist öffentlich, und die Pins stammen von anderen Leuten. Der lokale
Ordner bleibt.

---

## Betrieb

GitHub Pages über `.github/workflows/deploy.yml`. Jeder Push auf `main` führt
erst die Tests aus, setzt den Basispfad selbst (`FIBO_BASE`, aus
`GITHUB_REPOSITORY` abgeleitet) und lädt `dist/` hoch. Pages-Quelle steht auf
*GitHub Actions*, nicht auf *Deploy from a branch*.

**Dienstarbeiter** (`public/sw.js`): Netz zuerst für das Dokument mit 2,5 s
Frist, Speicher zuerst für alles andere. Der Unterschied ist wesentlich — die
Bündelnamen tragen einen Hash und ändern sich nie unter demselben Namen, das
Dokument heißt immer gleich und zeigt auf neue Bündel. Erster Aufruf 257 KB,
danach 0, eine Messung 0.

**Zeile „Stand" im Messprotokoll** zeigt die Bauzeit (`__BAUZEIT__`, per
`define` in `vite.config.ts`). Damit ist ohne Raten zu beantworten, ob am Telefon
schon der neue Stand läuft.

---

## Fallstricke

Alles hier ist einmal passiert und hat Zeit gekostet.

**Belichtung sperren, bevor die Automatik fertig ist.** Die Automatik eines
Telefons beginnt dunkel und braucht ein bis zwei Sekunden. Wer vorher sperrt,
friert das schwarze Anfangsbild ein.

**`exposureMode: 'manual'` ohne Werte.** Sagt dem Treiber nur „hör auf zu regeln",
nicht „bleib hier stehen" — mancher springt dann auf einen Standardwert. Die
laufenden Werte müssen mitgegeben werden. Und weil `applyConstraints` Erfolg
meldet, auch wenn der Treiber etwas anderes tut, prüft die App hinterher die
Helligkeit nach und nimmt die Sperre notfalls zurück.

**Auf `loadedmetadata` warten hängt.** Das Ereignis kann schon durch sein, und
beim zweiten Start mit demselben Videoelement kommt es unter Umständen gar nicht
mehr. `camera.ts` wartet deshalb über drei Wege gleichzeitig: Ereignis,
regelmäßige Abfrage, Frist. Die App blieb sonst stumm stehen — ohne Fehler, ohne
Bild.

**Ein Verfahren, das überall etwas findet.** Die Spiralenzählung meldete auf einer
Backsteinwand „6/22" mit 99 % Vertrauen und auf einer leeren Wand „75/81" mit
70 %. Die Schwellen lagen auf der falschen Skala. **Bevor ein neues Verfahren in
die UI geht: gegen alle Fremdmotive prüfen, nicht nur gegen die eigenen
Referenzbilder.** Der gefährlichere Fehler ist nie, etwas zu übersehen, sondern
etwas zu behaupten.

**Fremde Bilder im öffentlichen Repository.** Zum Prüfen der Spiralenzählung
dienten Bilder aus dem Netz, teils von Stockseiten mit Wasserzeichen. Sie und
alles daraus Abgeleitete (Zuschnitte in `test/test_messungen/3/zuschnitt/`)
liegen in `test/test_messungen/`, das in der `.gitignore` steht, und dürfen
**unter keinen Umständen** eingecheckt werden. Tests im Repository verwenden
nur gerechnete Bilder und eigene Fotos (`test/fotos/`); `ketten-probe.ts` liest
die fremden Bilder nur, wenn sie lokal da sind. Vor jedem Commit:
`git status --short --ignored | grep test_messungen` muss `!!` zeigen.

**Schwellen, die für ein Bild bemessen sind, beim Zusammenlegen mitwachsen
lassen.** „Mindestens drei Gitter je Ring" hieß über drei Bilder: ein
zufälliges Gitter je Bild — und schon standen Zahlen auf einer fraktalen Fläche
und ein falsches exaktes „7/10" auf einem Zapfen.

**Nur am Idealfall kalibriert.** Die Spiralenzählung bestand jede Prüfung —
gegen Blütenstände, die exakt in der Bildmitte lagen. Die naheliegendste
Störung im Feld, eine Blüte knapp daneben, hat niemand ausprobiert; vier Pixel
genügten, um alles zu zerstören. `test/fixtures/stoerung.ts` verschiebt und
verrauscht deshalb. **Jedes Verfahren wird auch gegen die Störungen geprüft,
die draußen sicher eintreten.**

**Das Messbild stand auf dem Kopf.** `readPixels` liefert die unterste Zeile
zuerst, der Frame zählt von oben. Die Zählungen hängen nicht davon ab, der
Prüfstand verglich das Bild mit sich selbst — so fiel es lange nicht auf. Erst
Nachzeichnung und Mittelsuche brauchen die richtige Lage. `poll()` kehrt die
Zeilen jetzt um, und der Prüfstand hat eine Zeile „Ausrichtung".

**Ein Verfahren, das nichts findet, und eine Anzeige, die es trotzdem sagt.**
Die Spiralenzählung meldete auf einer Zinnie selbst 1 % Vertrauen — die Anzeige
schrieb „5/8" in Gold daneben. Die Regel „ohne Vertrauen keine Zahl" stand im
Styleguide, aber im Code stand `konfidenz > 0`. **Jede Schwelle, die über
Anzeigen entscheidet, gehört als benannte Konstante an eine Stelle.**

**Der Fototest liegt unter der anderen tsconfig.** `test/fotos.test.ts` liest
PNG-Dateien und braucht Node-Typen; die Browser-tsconfig schließt ihn aus, die
Skript-tsconfig schließt ihn ein. Wer weitere Tests mit Dateizugriff anlegt,
trägt sie dort genauso ein.

**Der Browser-Pane der Entwicklungsumgebung drosselt `requestAnimationFrame`** auf
wenige Bilder je Sekunde und schaltet die Messung über `visibilitychange` ab.
Live-Verhalten lässt sich dort nicht beurteilen — Messverfahren über Tests
absichern, die Kamerakette am Gerät prüfen.

**Backslashes und `\n` überleben die Bash-Heredocs dieser Umgebung nicht.**
Mehrfach sind so Steuerzeichen in Markdown und kaputte Zeichenketten in
TypeScript gelandet. Für Dateien mit Escapes das Write-Werkzeug nehmen oder das
Skript in den Scratchpad schreiben und von dort ausführen.

---

## Nächster Schritt

**Erst Reliabilität, dann M2.** Ein weiteres Verfahren, das dieselbe Unruhe
erbt, macht die App nicht besser. Die Reihenfolge steht so, weil jeder Schritt
den nächsten beurteilbar macht:

1. **Kettenzählung am Telefon prüfen.** Zapfen oder reifer Samenstand bei
   Tageslicht (eine blühende Sonnenblume taugt nicht, siehe Feldtest), Mitte
   ungefähr ins Kreuz, festhalten. Abzulesen: steht „≈ …" oder eine exakte Zahl,
   und folgen die gezeichneten Ketten den Reihen der Blütchen? Dazu die
   Rechenzeit am Gerät — geschätzt fünf bis sieben Sekunden für drei Bilder,
   gemessen ist das nicht. Eigene Fotos davon gehören als Testbilder nach
   `test/fotos/`; fremde Bilder nie.
2. **Die dritte Schar heraushalten (M4).** Die kleinere Zahl liegt an echten
   Blüten meist zwei, drei zu hoch. Die Richtungsregel je Ringband ist daran
   gescheitert, dass die Richtung an den Übergängen wechselt. Aussichtsreicher:
   die Richtung aus den *eigenen* Nachbarn jedes Blütchens bestimmen (lokales
   Gitter aus den zwei kürzesten Vektoren), statt aus einem ganzen Band.
3. **Rechenzeit (M4).** Dreißig Gitter je Bild, die meisten zählen nie mit.
   Aus den Stimmen des ersten Bildes ließe sich ablesen, welche Fleckgrößen
   überhaupt tragen, und die übrigen Bilder rechnen nur diese.
4. **Neigung messen (M4).** Gerechnete Blütenstände gestaucht (Ellipse statt
   Kreis) durch die Kettenzählung schicken, wie bei der Verschiebung.
5. **Otsu-Schwelle über die Reihe stabilisieren (M1).** Der Schnitt springt von
   Bild zu Bild um Graustufen, und jede Stufe verschiebt die feinste Zählung.
   Der Median der Schwelle über die Reihe, auf alle Bilder der Reihe angewandt,
   nimmt das heraus, ohne die Entscheidung „Otsu statt Perzentil" anzutasten —
   die Dichte wandert weiter mit dem Motiv. **Danach `npm run kalibrierung`,
   die Tabelle muss stehenbleiben.**
6. **Autofokus sperren.** Wie die Belichtung, mit derselben Vorsicht:
   `focusMode: 'manual'` mit mitgegebener `focusDistance` und Rückfahrt, wenn
   das Bild dadurch unscharf wird. Er steht seit je an erster Stelle der
   Verdächtigen für die Schwankung von M1.
7. **M1 abnehmen.** Telefon, Farn, zehn Sekunden ruhig halten, auf die Zeile
   „Schwankung, 10 s" im Messprotokoll sehen. Unter 0,05 bei vollem Fenster:
   erfüllt.
8. **M2 — Spektralsteigung.** Die FFT steht. Radial mitteln, Abfall β bestimmen,
   Anzeige als Zahl mit Einordnung (natürliche Szenen liegen nahe β ≈ 2). Mit
   Referenzbildern und Kalibriertabelle wie bei M1 und M4, und mit derselben
   Gegenprobe: Was meldet es auf Motiven, für die es nicht gedacht ist?

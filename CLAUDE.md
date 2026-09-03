# FIBO-Scanner

Eine Web-App, die per Handykamera Muster in der Natur misst und erklärt: fraktale
Dimension, Selbstähnlichkeit, Symmetrie, Phyllotaxis.

Privatprojekt. Kein Produkt, kein Store, kein Nutzerkonto.

---

## Ziel

Der Nutzer hält das Handy auf einen Farn, eine Baumkrone, eine Sonnenblume oder eine
Hauswand und sieht sofort Zahlen, die beschreiben, wie das Ding gebaut ist. Die App
liefert Tendenzen, keine Beweise. Sie soll den Blick schulen, nicht den Doktortitel
verleihen.

## Nicht-Ziele

- **Keine psychedelischen Filter.** Keine Kaleidoskope, keine Shader-Spielereien, kein
  Warping des Kamerabilds. Wer das will, nimmt Hyperspektiv.
- **Keine Zahlenmystik.** Die App behauptet nie, der Goldene Schnitt stecke überall.
  Wenn nichts Auffälliges gemessen wird, sagt sie das.
- **Keine Vierdimensionalität.** Dafür gibt es kein Messverfahren. Taucht höchstens im
  Erklärtext auf, nie als Messwert.
- **Kein natives App-Projekt.** Kein Swift, kein Kotlin, kein React Native.
- **Keine Cloud.** Alles rechnet auf dem Gerät. Keine Bilder verlassen das Handy.

---

## Stack

| Bereich | Wahl |
|---|---|
| Laufzeit | Browser, als PWA installierbar |
| Kamera | `navigator.mediaDevices.getUserMedia`, Rückkamera bevorzugt |
| Rechnen | WebGL2 für Bildvorverarbeitung, JS für Auswertung |
| Build | Vite, TypeScript, keine UI-Bibliothek |
| Stil | CSS, handgeschrieben |
| Deployment | statisches Hosting, HTTPS zwingend (Kamera) |

Keine schweren Abhängigkeiten. Kein OpenCV.js — 8 MB WASM für Kantendetektion sind
Unfug, ein Sobel-Shader sind 20 Zeilen. Kein Framework, solange nicht zwingend.

---

## Architektur

```
src/
  camera/      Kamerazugriff, Frame-Grabbing, Auflösungssteuerung
  gpu/         WebGL-Kontext, Shader (Graustufen, Sobel, Schwellwert)
  metrics/     Messverfahren, je eine Datei pro Verfahren
  ui/          Anzeige, Historie, Erklärtexte
  calibration/ Referenzmessungen, Plausibilitätsprüfung
```

Jedes Messverfahren erfüllt dieselbe Schnittstelle:

```ts
interface Metric {
  id: string;
  label: string;              // deutsch, kurz
  run(frame: Frame): Result;  // Frame = Graustufen + Kantenbild + Metadaten
  confidence(r: Result): number; // 0..1, ehrlich
  explain(r: Result): string; // was der Wert bedeutet
}
```

`confidence` ist Pflicht, nicht Kür. Ein Messwert ohne Vertrauensangabe ist eine
Behauptung.

---

## Meilensteine

### M1 — Box-Counting live

Kamerabild, Sobel-Kanten, Schwellwert, Gitterzählung bei mindestens fünf Skalen,
Regressionssteigung im log-log-Raum. Ergebnis als eine Zahl über dem Bild, 30 fps.

Erwartungswerte zur Kontrolle: glatte Linie ≈ 1,0 · Backsteinwand ≈ 1,2 ·
Farnwedel ≈ 1,7 · Baumkrone im Winter ≈ 1,8 · Rauschen ≈ 2,0.

**M1 gilt als erreicht, wenn der Wert bei ruhiger Hand über zehn Sekunden um weniger
als 0,05 schwankt.** Erst dann weitermachen.

### M2 — Spektralsteigung

FFT über das Graubild, Leistungsspektrum radial mitteln, Abfall β bestimmen.
Natürliche Szenen liegen meist nahe β ≈ 2. Anzeige als Zahl plus Kurve.

### M3 — Rotationssymmetrie

Bildmitte als Zentrum, Polartransformation, Autokorrelation über den Winkel.
Peaks ergeben die Symmetrieordnung. Blüten meist 5, Schneeflocken 6.

### M4 — Parastichen (Fibonacci)

Nur für Sonnenblume, Zapfen, Kaktus, Romanesco. Blobdetektion, Nachbarschaftsvektoren
gruppieren, Spiralfamilien zählen, linke und rechte Anzahl ausgeben. Treffer, wenn
beide Zahlen in der Fibonacci-Folge benachbart liegen (21/34, 34/55).

Aufwendig und winkelabhängig. Braucht einen eigenen Modus mit Halteanweisung
("frontal, formatfüllend"), keine Dauermessung.

### M5 — Packung

Zellzentren finden, Voronoi bilden, Nachbaranzahl-Histogramm. Wabe konzentriert
auf 6, Giraffenfell und Trockenrisse streuen breiter.

---

## Kalibrierung

Der größte Fehlerquell: Beleuchtung, Abstand, Tiefenschärfe. Dieselbe Buche liefert je
nach Zoom eine andere Dimension.

Deshalb von Anfang an mitbauen:

- **Referenzbilder** im Repo (`test/fixtures/`) mit bekannten Sollwerten: Sierpinski-
  Dreieck (1,585), Koch-Kurve (1,262), Weißes Rauschen (2,0), leere Fläche (0).
  Jede Änderung an `metrics/` muss diese Tests bestehen.
- **Abstandswarnung** in der UI, wenn die Schärfeebene zu nah oder zu fern liegt.
- **Belichtungssperre**, sobald gemessen wird. Automatik verfälscht Kantenbilder.

---

## UI-Prinzipien

- Kamerabild bleibt unverändert. Zahlen liegen darüber, sonst nichts.
- Ein Hauptwert groß, Nebenwerte klein. Nie fünf Zahlen gleichzeitig gleich laut.
- Niedrige Konfidenz zeigt die App als solche an — ausgegraut, mit Begründung
  ("zu wenig Kontrast", "Bewegung zu stark").
- Erklärtexte auf Antippen, nicht permanent.
- Alles auf Deutsch, Fachbegriffe erklärt: Parastiche, Phyllotaxis, Box-Counting.
- Kein Bewertungston. Nicht "wunderschön fraktal!", sondern "Dimension 1,74 — stark
  verzweigte Struktur".

---

## Styleguide

Die App soll aussehen wie das Notizbuch einer Naturforscherin, die es mit der Magie
nicht so genau nimmt: verschnörkelt, handgemacht, ein bisschen verwunschen. Nicht wie
ein Messgerät.

**Die eine Regel, die alles zusammenhält:** Der Schnörkel steckt in der Hülle, nie im
Messwert. Titel, Rahmen, Übergänge, Ornamente dürfen schwelgen. Die Zahl über dem
Kamerabild bleibt nüchtern und sofort lesbar. Wer beides vermischt, bekommt eine App,
die hübsch aussieht und nichts sagt.

### Inspiration

Moodboard: https://de.pinterest.com/kacktype/fibo-scanner-inspo/

**Achtung: Pinterest sperrt automatisierten Zugriff aus.** Weder ich noch eine
Code-Instanz können das Board auslesen – der Link ist ein Hinweis für Menschen, keine
Quelle für den Build. Damit die Bilder wirklich in die Gestaltung einfließen: die
wichtigsten Pins herunterladen und in `docs/moodboard/` ablegen. Dann liegen sie im
Repo und lassen sich beim Bauen tatsächlich ansehen.

### Schrift

Der Schriftzug aus dem Referenzbild ist eine hochkontrastige englische Schreibschrift
mit sehr langen Schwüngen. **Welche genau, kann ich nicht sagen** – vermutlich eine
kommerzielle Lizenzschrift. Frei verfügbare Verwandte:

| Rolle | Empfehlung | Alternativen |
|---|---|---|
| App-Titel, H1 | Italianno | Monsieur La Doulaise (mehr Schwung, weniger lesbar), Mrs Saint Delafield |
| H2, H3 | EB Garamond, kursiv | Cormorant Garamond |
| Fließtext, Erklärungen | EB Garamond | Spectral |
| Messwerte | EB Garamond mit `font-variant-numeric: lining-nums tabular-nums` | – |

Begründung zur letzten Zeile: Bei 30 fps springt die Anzeige, wenn die Ziffern
unterschiedlich breit sind. Tabellenziffern verhindern das Zappeln – deshalb keine
dritte Schriftfamilie, sondern nur ein OpenType-Feature.

Schreibschrift nur für den Titel und höchstens eine H1 pro Ansicht. Nie für
Fachbegriffe, nie unter 32 px, nie für Umlaute in Versalien. "Parastiche" in
Monsieur La Doulaise liest niemand.

### Farben

```
--ink      #241E1A   Eisengallustinte, warmes Schwarzbraun. Linien, Text.
--paper    #E6E1CE   gealtertes Papier. Flächen, Karten, Panels.
--patina   #4E7A6B   Grünspan. Akzent, aktive Zustände, Kurven.
--gold     #B8862F   Ocker. Nur für Treffer, etwa gefundene Fibonacci-Paare.
--veil     rgba(36, 30, 26, 0.55)   Schleier über dem Kamerabild
```

Kein Creme-Beige mit Terrakotta-Akzent – das ist der Standardanstrich generierter
Seiten. `--paper` ist bewusst kühler und grüner. `--gold` ist rar: Wenn es überall
leuchtet, bedeutet es nichts.

Über dem Livebild braucht Text `--veil` als Unterlage, sonst verschwindet er im Laub.

### Die Skizze

`docs/michaelendething_skizze/michaelendething-alpha.png` – Federzeichnung,
verzweigte Ranken um ein Gittergerüst. Freigestellt, Tinte als Alphakanal, dadurch
per CSS einfärbbar (`filter` oder als `mask-image`).

Platzierung ist noch offen, wird nach dem ersten Entwurf entschieden. Kandidaten:

1. **Hintergrund der Startansicht**, groß, stark ausgeblendet (Deckkraft 8–12 %).
   Wirkt sofort, kollidiert aber mit dem Kamerabild, sobald die Messung läuft.
2. **Randornament**, rechts oder unten angeschnitten, sodass die Ranken in den
   Viewport hineinwachsen. Stört die Messanzeige nicht.
3. **Ladezustand und Leerlauf**: Erscheint, solange keine Kamera freigegeben oder
   kein Motiv erkannt ist, und weicht der Messung. Erzählerisch am stärksten.

Variante 2 ist der sicherste Start. Erst bauen, dann ansehen, dann entscheiden.

**Technische Hinweise:** Das Original ist ein CMYK-JPEG, 1080 × 1350 – Browser stellen
CMYK unzuverlässig dar, teils invertiert. Es liegt nicht im Repo; stattdessen stehen in
`docs/michaelendething_skizze/` die RGB-Fassung `michaelendething-rgb.jpg` und die
freigestellte `michaelendething-alpha.png`. Für scharfe Kanten auf großen Displays
lohnt später ein SVG-Trace der Linien.

### Bewegung

Ein einziger orchestrierter Moment: Wenn ein Messwert stabil wird, wächst er sanft in
Position. Sonst nichts. Keine Einblendanimationen auf jeder Karte, keine
Hover-Effekte auf allem. `prefers-reduced-motion` respektieren.

---

## Code-Regeln

- TypeScript, `strict: true`.
- Messverfahren sind reine Funktionen ohne Seiteneffekte. Kamera und Anzeige bleiben
  außen vor.
- Jedes Verfahren bekommt Unit-Tests gegen die Referenzbilder, bevor es in die UI geht.
- Kommentare erklären das Warum, nicht das Was. Bei Formeln die Quelle nennen.
- Deutsche Bezeichner in der UI, englische im Code.
- Keine Abhängigkeit hinzufügen, ohne den Nutzen zu begründen.

---

## Nächster Schritt

M1 bauen. Nichts sonst. Erst wenn der Dimensionswert im Wald stabil steht, lohnt sich
Meilenstein 2.

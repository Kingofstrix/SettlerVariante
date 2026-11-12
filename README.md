# Inselreich

Browser-Mehrspielerspiel für 3–6 Personen nach dem Prinzip „siedeln, handeln, bauen“ – gedacht für eine Runde im Hörsaal: jede:r am eigenen Laptop, das Brett auf dem Beamer. Kein eigener Server, keine Kosten, keine API-Keys.

- **Statische Web-App** (Vite, TypeScript, Preact, SVG), Hosting auf GitHub Pages.
- **Peer-to-Peer über WebRTC** (PeerJS). Der Browser des Hosts rechnet das ganze Spiel, alle anderen treten mit einem Raumcode bei.
- Standardregeln plus 5–6-Spieler-Erweiterung mit **Sonderbauphase**, Zugtimer, Beameransicht.
- **Bankübersicht** (Karten je Rohstoff in der Bank und bei den Spielern), **Chat**, gut sichtbare **Handelsangebote**, **Würfel in der Brettmitte** und **Kartenflug-Animationen** zwischen Hand, Bank und Mitspielern.

Namen, Grafiken und Texte sind eigene; nur die Spielmechanik orientiert sich am bekannten Brettspiel.

## Lokal starten

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Regel-Engine, Host-Logik, 500 Zufallsspiele (ca. 30 s)
npm run build      # statische Dateien in dist/
```

### Ohne Netzwerk testen (Dev-Modus)

`http://localhost:5173/?dev=1` öffnen. Im Dev-Modus

- reden die Tabs über einen `BroadcastChannel` statt über WebRTC (kein Internet nötig),
- ist jeder Tab ein eigener Spieler (Token im `sessionStorage`),
- hat der Host im Menü (☰) ein **Debug-Panel**: Karten geben, Spielzustand als JSON laden und setzen.

Also: einen Tab „Raum erstellen“, zwei bis fünf weitere Tabs „Raum beitreten“, einen Tab „Als Beamer verbinden“ – alle mit `?dev=1` im selben Browser.

Zum schnellen Ausprobieren gibt es außerdem auf der Startseite „Lokal an einem Gerät spielen“ (Hot-Seat, ohne Timer).

## Deployment auf GitHub Pages

1. Repo nach GitHub pushen (Branch `main`).
2. Im Repo: **Settings → Pages → Source: „GitHub Actions“**.
3. Der Workflow `.github/workflows/deploy.yml` testet, baut und veröffentlicht bei jedem Push auf `main`.
4. Die Adresse steht danach unter Settings → Pages (`https://<name>.github.io/<repo>/`).

`base` steht in `vite.config.ts` auf `./` (relative Pfade). Das funktioniert unabhängig vom Repo-Namen.

## So läuft es im Hörsaal

1. **Host** öffnet die Seite, gibt Namen und Farbe ein, klickt „Raum erstellen“. Der Raumcode steht groß in der Lobby.
2. **Mitspieler** öffnen die Seite, „Raum beitreten“, Code eingeben (oder Einladungslink aus der Lobby).
3. **Beamer-Laptop** öffnet die Seite, gibt den Code ein und klickt „Als Beamer verbinden“. Im Spiel oben rechts ⛶ für Vollbild.
4. In der Lobby prüft der Host den **Verbindungstest**: Status, Latenz, „direkt“ oder „Relay“ für jeden Spieler.
5. Einstellungen wählen (Brett, Siegpunkte, Timer) und „Spiel starten“ (ab 3 Spielern).

Im Spiel:

- **Würfeln:** Wer dran ist, sieht die Würfel groß in der Brettmitte. Würfeln per Klick, Leertaste oder Enter. Ein Ritter lässt sich vorher unten in der Handleiste ausspielen. Nach dem Wurf fliegen die Würfel mit dem Ergebnis an den Rand.
- **Bank:** In der Seitenleiste steht je Rohstoff oben die Zahl in der Bank, unten die Zahl bei allen Spielern zusammen. Daneben der Stapel der Entwicklungskarten.
- **Handel:** Angebote an dich erscheinen groß oben über dem Brett, aus deiner Sicht formuliert („Du bekommst … / Du gibst …“), mit Annehmen, Ablehnen und Gegenangebot. Wer ein Angebot macht, sieht pro Mitspieler, ob er noch überlegt oder abgelehnt hat.
- **Las Vegas (Glücksrad):** Muss man bei einer 7 abwerfen, darf man stattdessen am Glücksrad drehen. 30 %: nichts abwerfen. 70 %: doppelt so viele Karten abwerfen (höchstens die ganze Hand; ist es die ganze Hand, ist sie sofort weg). Pro 7 nur ein Dreh. Den Zufall zieht der Host, das Rad landet passend dazu. Nach einem Dreh beginnt die Abwurfzeit neu. Der Beamer zeigt jeden Dreh groß, die anderen Spieler bekommen eine Einblendung. Abschaltbar in der Lobby.
- **Statistik:** Reiter „Statistik“ neben Verlauf und Chat. Ein Balkendiagramm zeigt, wie oft jede Augensumme (2–12) in der laufenden Partie gefallen ist. Die gestrichelte Linie ist der statistisch erwartete Wert bei dieser Zahl an Würfen, der letzte Wurf ist gold markiert. Beim Überfahren eines Balkens stehen Anzahl, Anteil und Erwartung oben. Der Bereich klappt dafür über Bank und Baumenü auf.
- **Chat:** Reiter „Chat“ neben dem Verlauf (auch in der Lobby). Ungelesene Nachrichten zeigt eine Zahl am Reiter. Höchstens 5 Nachrichten in 10 Sekunden pro Person, 200 Zeichen je Nachricht. Der Beamer liest nur mit.
- **Animationen:** Karten fliegen zwischen Hand, Bank und Mitspielern. Bei fremden Spielern ist nur dann zu sehen, welcher Rohstoff fliegt, wenn die Bank beteiligt ist (das ist ohnehin öffentlich). Diebstahl und Handel zwischen zwei anderen zeigen verdeckte Karten. Mit „Bewegung reduzieren“ im Betriebssystem sind alle Animationen aus.

Tipps:

- Der Host-Tab muss offen bleiben. Am besten in einem eigenen Fenster, nicht minimiert.
- **Pause** für die Vorlesung: Host-Menü (☰) → „Spiel pausieren“.
- 6 Spieler mit Sonderbauphase dauern eher 2 Stunden als 90 Minuten. Für eine Vorlesung: **8 Siegpunkte** einstellen.
- Vor dem Termin einmal im echten Raum mit zwei Laptops testen (siehe nächster Abschnitt).

## Netzwerk: eduroam, TURN und der Hotspot-Plan

WebRTC baut direkte Verbindungen zwischen den Laptops auf. Dafür braucht es:

1. **Signalisierung** (nur zum Verbindungsaufbau): standardmäßig der öffentliche PeerJS-Server. Er ist kostenlos, hat aber keine Verfügbarkeitsgarantie.
2. **STUN** (eigene Adresse herausfinden): Google-STUN ist voreingestellt.
3. **TURN** (Umweg über einen Relay-Server), falls die direkte Verbindung blockiert ist.

In Uni-Netzen wie **eduroam** sehen sich Geräte oft gegenseitig nicht („Client Isolation“). Dann scheitert die direkte Verbindung, und nur TURN hilft. Zuverlässige kostenlose TURN-Server ohne Account gibt es praktisch nicht. Deshalb:

> **Plan A im Hörsaal: alle in einen Handy-Hotspot.** Der Datenverbrauch ist winzig (Text-Nachrichten, keine Medien). Das Spiel zeigt bei Verbindungsfehlern genau diesen Tipp an.

### TURN konfigurieren (optional)

Für **alle** Teilnehmer gemeinsam: `public/netz-config.json` anpassen und neu deployen.

```json
{
  "peerServer": null,
  "iceServers": [
    { "urls": ["stun:stun.l.google.com:19302"] },
    { "urls": "turn:mein-turn.example.org:3478", "username": "nutzer", "credential": "passwort" }
  ]
}
```

Achtung: Die Datei ist öffentlich. Feste TURN-Zugangsdaten darin kann jeder lesen. Für eine einzelne Veranstaltung ist das vertretbar, danach die Zugangsdaten wieder entfernen oder ändern.

Nur für **einen Browser**: Startseite → „Netzwerk-Einstellungen“. TURN muss bei beiden Seiten einer Verbindung bekannt sein, also mindestens beim Host und beim betroffenen Spieler.

### Eigener PeerJS-Server (optional)

Fällt der öffentliche PeerJS-Server aus, kann jeder einen eigenen starten (`npx peerjs --port 9000`) und in `netz-config.json` eintragen:

```json
{ "peerServer": { "host": "mein-server.example.org", "port": 443, "path": "/", "secure": true }, "iceServers": [ … ] }
```

## Ausfallsicherheit

| Fall | Was passiert |
|---|---|
| Spieler lädt neu / WLAN weg | Ein zufälliges Token im `localStorage` bringt ihn automatisch auf **denselben Sitz** zurück. Bis dahin steht „getrennt“ an seinem Namen. Ist er am Zug, läuft sein Timer ab und er wird übersprungen (bei Timer „aus“ nach 60 s). |
| Derselbe Spieler in zwei Tabs | Der neue Tab übernimmt, der alte zeigt einen Hinweis. |
| Host lädt neu | Der Host speichert nach **jeder Aktion** den kompletten Stand im `localStorage`. Nach dem Neuladen öffnet er denselben Raum wieder (kann bis ca. 20 s dauern, bis der Code wieder frei ist); alle Clients verbinden sich automatisch neu. |
| Host-Laptop fällt aus | Vorher regelmäßig Host-Menü → „Spielstand exportieren“. Ein anderer Laptop wählt auf der Startseite „Spielstand importieren“ und wird Host mit demselben Raumcode. Der alte Host kann danach als normaler Spieler wieder beitreten. |
| Verbindung hängt | Heartbeat alle 2 s; nach 8 s ohne Antwort gilt die Verbindung als getrennt. |

## Fehlersuche

| Symptom | Ursache und Lösung |
|---|---|
| „Der Verbindungsserver ist nicht erreichbar“ | Kein Internet oder der PeerJS-Server ist blockiert/down. Anderes Netz (Hotspot) probieren oder eigenen PeerJS-Server eintragen. |
| „Raum nicht gefunden“ | Code falsch, oder der Host-Tab ist zu. Der Client versucht es automatisch weiter. |
| „Direkte Verbindung zum Host nicht möglich“ | Netz blockiert WebRTC (typisch eduroam). Alle in einen Handy-Hotspot oder TURN konfigurieren. |
| Spieler steht auf „Relay“ | Läuft über TURN. Funktioniert, ist nur etwas träger. |
| „Versionen passen nicht zusammen“ | Jemand hat eine alte Seite im Cache. Alle neu laden (Strg/Cmd + Shift + R). |
| Host-Timer läuft zäh | Der Host-Tab liegt im Hintergrund und wird vom Browser gedrosselt. Tab sichtbar lassen. |
| Safari verbindet nicht | Safari ist bei WebRTC am empfindlichsten. Im Zweifel Chrome, Edge oder Firefox nehmen. |
| Spiel hängt, weil jemand weg ist | Host-Menü → Pause aufheben prüfen; sonst läuft der Timer des Spielers ab. Notfalls Export → Import. |

## Architektur

```
src/engine/   Reine Regel-Engine (kein DOM, kein Netz). anwenden(state, aktion) → state | fehler
  typen.ts      Datenmodell und Aktionen
  brett.ts      Graph (Hex/Ecke/Kante, Axialkoordinaten), Brettgenerierung, Häfen
  regeln.ts     Bauplätze, Abstandsregel, längste Straße (DFS), Tauschkurse, Räuberfelder
  engine.ts     Reducer mit allen Aktionen, Sonderkarten, Sonderbauphase, Sieg
  sicht.ts      Gefilterte Sicht je Spieler / Beamer
  pruefung.ts   Invarianten (Kartenbilanz …) und Zufallsaktionen für die Simulation
                Kartenbewegungen (für Animationen) stehen im Zustand als `bewegungen`
  rng.ts        Seeded RNG (mulberry32); der Seed steht im Log und im Host-Menü
src/netz/     Host-autoritatives Netzwerk
  protokoll.ts  Versionierte JSON-Nachrichten mit Prüfung (Ungültiges wird ignoriert)
  host.ts       Sitze, Tokens, Heartbeat, Timer, Pause, Persistenz, Export/Import
  client.ts     Spieler/Beamer: Absichten senden, Sicht anzeigen, automatisch neu verbinden
  transport.ts  PeerJS (WebRTC) und BroadcastChannel (Dev-Modus), Netzwerk-Konfiguration
  lokal.ts      Hot-Seat an einem Gerät
src/ui/       Preact-Oberfläche: Start, Lobby, Spieler- und Beameransicht, Dialoge, SVG-Brett,
              Chat, Würfelbühne, Kartenflug (animation.tsx)
  tokens.css    Design-Tokens: alle Farben, Schatten, Radien, Schriften an einer Stelle
  Brett.tsx     Brett als zwei gestapelte SVGs: Grundebene (Insel, Felder, Chips, Häfen; ändert sich
                in einer Partie nicht) und Spielebene (Straßen, Gebäude, Räuber, Bauplätze)
  Gelaende.tsx  Geländebilder und Verläufe, je einmal in <defs>, pro Feld per <use>
  brett.css     Styles des Bretts, stil.css der Rest der Oberfläche
tests/        Vitest: Brett, Regeln, Engine, Host, Simulation
```

Grundsätze:

- **Nur der Host wendet Aktionen an.** Clients schicken Absichten (`{typ: "STRASSE_BAUEN", kante}`), der Host prüft sie mit der Engine und schickt jedem seine gefilterte Sicht: eigene Karten ja, bei Gegnern nur Anzahlen.
- **Zufall nur auf dem Host**, mit Seed. Gleicher Seed und gleiche Aktionen ergeben denselben Spielverlauf.
- **Aktionen strikt nacheinander.** Nehmen zwei Spieler denselben Handel an, bekommt der zweite „nicht mehr gültig“.
- **Timer nur auf dem Host.** Clients zeigen ihn an. Bei Ablauf: würfeln, zufällig abwerfen, Räuber zufällig setzen, Zug beenden; in der Gründung zufällig, aber gültig setzen.

## Festgelegte Details und Abweichungen

Regeln, die im Auftrag offen waren, sind so umgesetzt:

1. **Anfänger-Layout**: eigenes festes, ausgeglichenes Layout (per fester Suche erzeugt), nicht die Originalaufstellung.
2. **Varianten** in der Lobby: Siegpunkte 8/10/12, „Freundlicher Räuber“ (Spieler mit höchstens 2 sichtbaren Punkten sind geschützt) und „Las Vegas“ (Glücksrad bei 7). Standard: 10 Punkte, Räuber normal, Glücksrad an.
3. **Sonderbauphase**: Wer mit seiner Hand nichts bauen oder kaufen kann, wird automatisch übersprungen. Das spart viel Zeit, verrät aber minimal etwas über die Hand. Abschaltbar über `sonderbauAutoSkip` in der Spielkonfiguration (`src/engine/typen.ts`).
4. **Sieg in der Sonderbauphase** gibt es nicht: Wer dort 10 Punkte erreicht, gewinnt zu Beginn seines eigenen Zugs.
5. **Bestehlen**: Gibt es nur einen möglichen Betroffenen, wird direkt gezogen; bei mehreren wählt der Spieler.
6. **Straßenbau-Karte** mit nur einer Reststraße baut eine Straße. **Erfindung** geht nur mit Rohstoffen, die die Bank noch hat.
7. **Nur der Ritter** darf vor dem Würfeln gespielt werden (wie im Auftrag festgelegt).
8. **Timer „aus“** und der Spieler am Zug ist getrennt: Nach 60 s (Sonderbau 20 s, Abwerfen 30 s) greift ein Notfall-Timer.
9. **Hafen-Tausch und Bank** laufen über denselben Dialog wie der Spielerhandel; der Kurs steht unter jedem Rohstoff.

Die Zuordnung aller Regeln zu Code und Tests steht in [REGELN-CHECKLISTE.md](REGELN-CHECKLISTE.md).

## Bekannte Grenzen

- Nur für Desktop-Browser ab 1280×720 ausgelegt, keine Handy-Optimierung.
- Der Host ist ein Single Point of Failure. Reload und Export/Import fangen das ab, aber nicht automatisch.
- Wer die Entwicklerkonsole des **Hosts** öffnet, kann alles sehen (dort liegt der volle Spielstand). Unter Kommilitonen vertretbar; echte Geheimhaltung bräuchte einen Server.

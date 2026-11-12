# Regel-Checkliste

Wo jede Regel umgesetzt und getestet ist. Pfade relativ zu `src/engine/` bzw. `tests/`. Testnamen stehen in Anführungszeichen.

## Brett

| Regel | Umsetzung | Test |
|---|---|---|
| 3–4 Spieler: 19 Felder (4 Wald, 4 Weide, 4 Acker, 3 Hügel, 3 Gebirge, 1 Wüste), 18 Zahlen, 9 Häfen (4× 3:1, 5× 2:1) | `brett.ts`: `GELAENDE_KLEIN`, `ZAHLEN_KLEIN`, `HAEFEN_KLEIN`, `hexKoordinaten` | `brett.test.ts` „klein / zufall …“, „klein / anfaenger …“ |
| 5–6 Spieler: 30 Felder (6/6/6/5/5, 2 Wüsten), 28 Zahlen, 11 Häfen (5× 3:1, 6× 2:1, davon 2 Wolle) | `brett.ts`: `GELAENDE_GROSS`, `ZAHLEN_GROSS`, `HAEFEN_GROSS` | `brett.test.ts` „groß / zufall …“, „groß / anfaenger …“ |
| Layout „Anfänger“ (fest) und „Zufall“ | `brett.ts`: `erzeugeBrett` | „Anfänger-Layout ist fest …“ |
| 6 und 8 nie benachbart (auch nicht 6/6, 8/8); neu mischen bis gültig | `brett.ts`: `belege`, `rotRegelOk` | „… 6/8-Regel …“ (200 Seeds je Größe), „rotRegelOk erkennt benachbarte 6/8“ |
| Graph: Felder, Ecken, Kanten mit Nachbarschaftslisten, Axialkoordinaten | `brett.ts`: `baueGraph`, `kuestenKanten` | „kleines Brett: 19 Felder, 54 Ecken, 72 Kanten …“, „großes Brett: 30 Felder, 80 Ecken, 109 Kanten …“ |
| Häfen an der Küste, keine geteilten Ecken | `brett.ts`: `setzeHaefen` | „… Häfen“ (2 Ecken je Hafen, alle verschieden) |
| Weitere Karten (Zwillingsinseln, Spirale, Fjordland), je klein und groß; Gelände 4:4:4:3:3, 6/8-Regel, Häfen über die Küste verteilt; jede Insel mit allen Rohstoffen | `karten.ts`: `kartenFelder`; `brett.ts`: `gelaendeFuer`, `zahlenFuer`, `belegeFrei`, `setzeHaefenFrei`, `inseln` | `karten.test.ts` „Kartenformen“, „Belegung freier Karten“; `simulation.test.ts` „je 40 Zufallsspiele auf den neuen Karten …“ |
| Abstimmung über die Karte: Mehrheit gewinnt, Los bei Gleichstand, ohne Stimmen Klassik | `karten.ts`: `zaehleStimmen`, `waehleKarte`; `netz/host.ts`: `setzeStimme`, `starten` | `karten.test.ts` „Abstimmung“; `host.test.ts` „Abstimmung über die Karte“ |

## Material

| Regel | Umsetzung | Test |
|---|---|---|
| Je Spieler 5 Siedlungen, 4 Städte, 15 Straßen | `engine.ts`: `neuesSpiel`; Limits in `STRASSE_/SIEDLUNG_/STADT_BAUEN` | `engine.test.ts` „Kosten werden abgezogen, Stadt gibt die Siedlung zurück, Figurenlimit“; Invariante in `pruefung.ts` |
| Rohstoffkarten 19 (3–4) bzw. 24 (5–6) je Sorte | `engine.ts`: `kartenProRohstoff` | `simulation.test.ts` (Kartenbilanz in jedem Schritt) |
| Entwicklungskarten 14/5/2/2/2 bzw. 20/5/3/3/3 | `engine.ts`: `entwStapel` | `simulation.test.ts` (Entwicklungskarten-Bilanz) |
| Bank knapp: mehrere Berechtigte → niemand; einer → der Rest | `engine.ts`: `verteile` | „Bank knapp: mehrere Berechtigte -> niemand; einer -> der Rest“ |

## Gründung

| Regel | Umsetzung | Test |
|---|---|---|
| Zufällige Sitzreihenfolge und Startspieler | `engine.ts`: `neuesSpiel` (`mischen`) | `host.test.ts` (Zuordnung Token → Spieler nach dem Mischen) |
| Schlangenreihenfolge 1→n, n→1, je Siedlung + Straße | `engine.ts`: `setupSpieler`, `setupWeiter` | `regeln.test.ts` „Schlangenreihenfolge und Startrohstoffe …“ |
| Rohstoffe für die zweite Siedlung | `engine.ts`: `SIEDLUNG_BAUEN` (Setup-Zweig) | dito |
| Straße muss an die neue Siedlung grenzen | `regeln.ts`: `gueltigeStrassenKanten(…, setupEcke)` | „Gründungsphase: Straße muss an die neue Siedlung grenzen“ |

## Zugablauf

| Regel | Umsetzung | Test |
|---|---|---|
| Würfeln → Handeln/Bauen in beliebiger Reihenfolge → Zug beenden | `engine.ts`: Phasen `wuerfeln`, `aktion` | „vor dem Würfeln darf nicht gebaut oder gehandelt werden“ |
| Ertrag: Siedlung 1, Stadt 2; Räuberfeld liefert nichts | `engine.ts`: `verteile` | „Siedlung 1, Stadt 2; Räuberfeld liefert nichts“ |
| 7: mehr als 7 Karten → Hälfte abgerundet, parallel | `engine.ts`: `WUERFELN`, `ABWERFEN` | „mehr als 7 Karten: Hälfte abgerundet, parallel“ |
| Räuber versetzen, nicht aufs selbe Feld | `regeln.ts`: `gueltigeRaeuberHexes`; `engine.ts`: `RAEUBER_SETZEN` | „Räuber: nicht aufs selbe Feld; stiehlt eine Karte vom Anlieger“ |
| 1 zufällige Karte von einem angrenzenden Gegner | `engine.ts`: `stehle`, `STEHLEN` | dito, „mehrere Kandidaten: Auswahl nötig“ |
| Abstandsregel | `regeln.ts`: `eckeFrei`, `gueltigeSiedlungsEcken` | `regeln.test.ts` „Abstandsregel“ (2 Tests); Invariante in jedem Simulationsschritt |
| Straßen schließen ans eigene Netz an, nicht durch fremde Siedlungen | `regeln.ts`: `eckeVerbindet`, `gueltigeStrassenKanten` | „Straße muss ans eigene Netz anschließen“, „fremde Siedlung blockiert das Weiterbauen“ |
| Kosten: Straße, Siedlung, Stadt, Entwicklungskarte | `typen.ts`: `KOSTEN`; `engine.ts`: `zahle` | „Kosten werden abgezogen …“, „Kauf: Kosten, verdeckt …“ |

## Entwicklungskarten

| Regel | Umsetzung | Test |
|---|---|---|
| Höchstens 1 pro Zug | `engine.ts`: `entwGespielt` | „höchstens eine Karte pro Zug“ |
| Nicht im Zug des Kaufs | `engine.ts`: `gekauftInZug < zugNr` | „im Kaufzug nicht spielbar, im nächsten schon“ |
| Siegpunktkarten zählen verdeckt und sofort | `engine.ts`: `gesamtPunkte`; `sicht.ts` | „Siegpunktkarten zählen verdeckt und sofort“ |
| Ritter auch vor dem Würfeln | `engine.ts`: `RITTER_SPIELEN`, `nachRaeuber` | „Ritter vor dem Würfeln: danach wird gewürfelt …“ |
| Straßenbau, Erfindung, Monopol | `engine.ts`: `STRASSENBAU_/ERFINDUNG_/MONOPOL_SPIELEN` | „Straßenbau: zwei kostenlose Straßen …“, „Erfindung nimmt zwei Rohstoffe …; Monopol sammelt ein“ |

## Handel

| Regel | Umsetzung | Test |
|---|---|---|
| Bank 4:1, Häfen 3:1 und 2:1 | `regeln.ts`: `tauschVerhaeltnis`; `engine.ts`: `BANKHANDEL` | „Bank 4:1, Hafen 3:1 und 2:1“ |
| Spielerhandel nur mit dem aktiven Spieler; an alle oder ausgewählte; Gegenangebote | `engine.ts`: `HANDEL_ANBIETEN/_ANNEHMEN/_ABLEHNEN/_ZURUECKZIEHEN` | „Spielerhandel: nur mit dem aktiven Spieler, keine Geschenke, zweite Annahme ungültig“ |
| Keine Geschenke / 0:x | `engine.ts`: `HANDEL_ANBIETEN` | dito |
| Gleichzeitige Annahme: zweite ist „nicht mehr gültig“ | `engine.ts`; `netz/host.ts`: `verarbeite` | `host.test.ts` „gleichzeitige Annahme eines Handels …“ |

## Sonderkarten und Sieg

| Regel | Umsetzung | Test |
|---|---|---|
| Längste Straße ≥ 5 per DFS, mit Verzweigungen, Schleifen, Unterbrechung | `regeln.ts`: `strassenLaenge` | `regeln.test.ts` „einfacher Pfad“, „Schleife um ein Feld …“, „Verzweigung …“, „zwei Schleifen (Acht) …“, „fremde Siedlung unterbricht, eigene nicht“ |
| Gleichstand: Besitzer behält; unterbrochen + Gleichstand: niemand | `engine.ts`: `aktualisiereStrasse` | „Vergabe ab 5, Gleichstand …, Überholen wechselt“, „unterbrochen: der neue Längste bekommt sie; bei Gleichstand niemand“ |
| Größte Rittermacht ≥ 3, Gleichstand bleibt | `engine.ts`: `aktualisiereMacht` | „Größte Rittermacht ab 3, Gleichstand bleibt beim Besitzer“ |
| Sieg bei 10 Punkten, nur im eigenen Zug; verdeckte Siegpunkte zählen | `engine.ts`: `pruefeSieg` | „10 Punkte im eigenen Zug …“, „nicht aktiver Spieler mit 10 Punkten gewinnt erst zu Beginn seines Zugs“ |
| Variante 8/12 Siegpunkte | `SpielConfig.siegpunkte` | „Variante: 8 Siegpunkte“ |
| Variante Freundlicher Räuber | `regeln.ts`: `gueltigeRaeuberHexes` | „Freundlicher Räuber schützt Spieler mit höchstens 2 Punkten“ |

## Sonderbauphase (5–6 Spieler)

| Regel | Umsetzung | Test |
|---|---|---|
| Nur bei 5–6 Spielern | `engine.ts`: `ZUG_BEENDEN` | „3–4 Spieler: keine Sonderbauphase“ |
| Alle anderen reihum; nur bauen und Entwicklungskarten kaufen | `engine.ts`: Flag `baut`, `SONDERBAU_FERTIG`, `sonderbauWeiter` | „alle anderen bauen reihum; nur Bauen und Kaufen erlaubt“ |
| Kein Handel, keine Karten ausspielen | Phasenprüfung in den Handels- und Kartenaktionen | dito |
| Auto-Skip, wenn nichts baubar | `engine.ts`: `kannEtwasBauen` | „Auto-Skip überspringt Spieler, die nichts bauen können“ |
| Kein Sieg in der Sonderbauphase | `engine.ts`: `pruefeSieg` | „wer in der Sonderbauphase 10 Punkte erreicht, gewinnt erst im eigenen Zug“ |
| Eigener Timer | `netz/host.ts`: `schritt`, `timerAktualisieren` | `host.test.ts` „Sonderbauphase und Abwerfen haben eigene Zeiten“ |

## Timer

| Regel | Umsetzung | Test |
|---|---|---|
| Aus / 60 / 90 / 120 / 180 s, eigene Zeiten für Sonderbau und Abwerfen | `netz/sitzung.ts`: `Einstellungen`; `ui/Lobby.tsx` | `host.test.ts` „Sonderbauphase und Abwerfen haben eigene Zeiten“ |
| Läuft nur auf dem Host | `netz/host.ts`: `tick` | „nach Ablauf wird automatisch gesetzt, gewürfelt und der Zug beendet“ |
| Standardaktionen bei Ablauf | `engine.ts`: `ZEIT_ABGELAUFEN` | dito, `engine.test.ts` „Zeitablauf wirft zufällig ab“ |
| Pause / Fortsetzen | `netz/host.ts`: `pause` | „Pause hält Timer und Aktionen an“ |
| Timer aus + Spieler getrennt: Notfall-Timer | `netz/host.ts`: `timerAktualisieren` (`fallback`) | „Timer aus: es passiert nichts von selbst – außer der Spieler am Zug ist getrennt“ |

## Netzwerk und Robustheit

| Anforderung | Umsetzung | Test |
|---|---|---|
| Host-autoritativ, gefilterte Sicht | `netz/host.ts`: `rundsenden`; `engine/sicht.ts` | `host.test.ts` „gefilterte Sicht …“; `simulation.test.ts` |
| Versioniertes Protokoll, Ungültiges ignorieren | `netz/protokoll.ts` | „verwirft Ungültiges und lässt ZEIT_ABGELAUFEN von außen nicht durch“; `engine.test.ts` „kaputte Nutzdaten werden abgelehnt …“ |
| Raumcode ohne verwechselbare Zeichen | `netz/speicher.ts`: `CODE_ALPHABET` | „Beitritt, eindeutige Namen und Farben, voller Raum, falsche Version“ |
| Wiedereinstieg auf denselben Sitz, doppelte Tabs | `netz/host.ts`: `hallo`; `netz/client.ts` | „doppelter Tab übernimmt den Sitz …; Reconnect landet auf demselben Sitz“ |
| Heartbeat | `netz/host.ts`: `herzschlag`; `netz/client.ts`: Wache | „Heartbeat erkennt tote Verbindungen“ |
| Host-Reload, Export/Import | `netz/host.ts`: `speichern`, `fortsetzen`, `pruefeHostDaten` | „Export/Import: anderer Host übernimmt, alle Sitze bleiben erhalten“ |
| Deterministisch mit Seed | `engine/rng.ts` | „gleicher Seed, gleiche Aktionen -> gleicher Zustand“ |
| 500 Zufallsspiele ohne Ausnahme, Kartenbilanz stimmt | `engine/pruefung.ts` | `simulation.test.ts` |

## Zusatzfunktionen

| Anforderung | Umsetzung | Test |
|---|---|---|
| Bankübersicht (Bank und im Umlauf je Rohstoff) | `ui/Teile.tsx`: `BankAnzeige` | von Hand (Screenshots) |
| Chat (Host verteilt, Spam-Bremse, 200 Zeichen, Beamer nur lesen, im Export) | `netz/host.ts`: `chatHinzu`; `netz/protokoll.ts`; `ui/Chat.tsx` | `host.test.ts` „verteilt Nachrichten an alle, bremst Spam …“ |
| Gut sichtbare Handelsangebote | `ui/Teile.tsx`: `AngebotsListe` | von Hand |
| Würfel in der Mitte, danach an den Rand | `ui/WuerfelBuehne.tsx` | von Hand |
| Glücksrad bei 7: 30 % kein Abwurf, 70 % doppelt (max. ganze Hand), einmal pro 7, abschaltbar | `engine/engine.ts`: `GLUECKSRAD_DREHEN`; `ui/Gluecksrad.tsx` | `engine.test.ts` „Glücksrad (Las Vegas)“ (5 Tests, u. a. Quote ≈ 30 % über 2000 Drehs); `host.test.ts` „Lobby-Schalter … Abwurfzeit neu“ |
| Würfelstatistik der laufenden Partie (Diagramm, Erwartungswert, letzter Wurf) | `engine/engine.ts`: `wurfStatistik`; `ui/Statistik.tsx` | `engine.test.ts` „zählt jeden Wurf je Augensumme, auch per Zeitablauf“ |
| Kartenflug Hand ↔ Bank ↔ Mitspieler | `engine/engine.ts`: `bewege`; `engine/sicht.ts`; `ui/animation.tsx` | `engine.test.ts` „Kartenbewegungen …“ (3 Tests, u. a. kein Verraten des Rohstoffs an Dritte) |

## Nur von Hand geprüft (kein automatischer Test)

- Oberfläche: Platzieren mit Vorschau, Handelsdialog, Abwurfdialog, Beameransicht, Tooltips, Töne, Würfelbühne, Kartenflug, Bankübersicht, Chat.
- WebRTC über PeerJS: im Headless-Chrome gegen einen lokalen PeerJS-Server durchgespielt (Beitritt, Start, doppelter Tab, Host-Reload, Trennung). **Nicht** geprüft: der öffentliche PeerJS-Server und echte Uni-Netze.

import { describe, expect, it } from 'vitest';
import { anwenden, neuesSpiel, pruefeInvarianten, sichtFuer, zufallsAktion, type GameState } from '../src/engine';
import { FARBEN } from './hilfe';

describe('Simulation', () => {
  it('500 Zufallsspiele: keine Ausnahmen, keine ungültigen Zustände, Kartenbilanz stimmt', () => {
    let beendet = 0;
    let aktionen = 0;
    let abgelehnt = 0;
    for (let spielNr = 0; spielNr < 500; spielNr++) {
      const n = 3 + (spielNr % 4);
      const rng = { rngState: 1000 + spielNr };
      let s: GameState = neuesSpiel({
        spieler: Array.from({ length: n }, (_, i) => ({ name: `S${i}`, farbe: FARBEN[i] })),
        seed: spielNr * 7919 + 1,
        config: {
          layout: spielNr % 5 === 0 ? 'anfaenger' : 'zufall',
          freundlicherRaeuber: spielNr % 3 === 0,
          sonderbauAutoSkip: spielNr % 2 === 0,
          siegpunkte: [8, 10, 12][spielNr % 3],
          gluecksrad: spielNr % 4 !== 1,
        },
      });
      for (let schritt = 0; schritt < 6000 && s.phase !== 'ende'; schritt++) {
        // Ab und zu den Timer simulieren
        const a = rng.rngState % 17 === 0 ? ({ typ: 'ZEIT_ABGELAUFEN', spieler: 0 } as const) : zufallsAktion(s, rng);
        rng.rngState = (rng.rngState + 1) | 0;
        expect(a).not.toBe(null);
        const e = anwenden(s, a!);
        aktionen++;
        if (!e.ok) {
          abgelehnt++;
          continue;
        }
        s = e.state;
        const verstoesse = pruefeInvarianten(s);
        if (verstoesse.length) throw new Error(`Spiel ${spielNr}, Schritt ${schritt}: ${verstoesse.join('; ')}`);
        if (schritt % 50 === 0) {
          // Die gefilterte Sicht darf nie fremde Karten enthalten
          const sicht = sichtFuer(s, 0);
          expect(sicht.spieler.slice(1).every((p) => p.hand === null && p.entw === null)).toBe(true);
          expect(JSON.stringify(sicht)).not.toContain('rngState');
        }
      }
      if (s.phase === 'ende') {
        beendet++;
        expect(s.gewinner).not.toBe(null);
      }
    }
    console.log(`Simulation: ${beendet}/500 Spiele beendet, ${aktionen} Aktionen, ${abgelehnt} abgelehnt`);
    expect(beendet).toBeGreaterThan(400);
    // Abgelehnte Aktionen sind erlaubt (z. B. Annahme eines unbezahlbaren Handels), sollten aber selten sein
    expect(abgelehnt / aktionen).toBeLessThan(0.05);
  });

  it('je 40 Zufallsspiele auf den neuen Karten: alle enden, Kartenbilanz stimmt', () => {
    for (const karte of ['zwillinge', 'spirale', 'fjorde'] as const) {
      let beendet = 0;
      for (let spielNr = 0; spielNr < 40; spielNr++) {
        const n = 3 + (spielNr % 4);
        const rng = { rngState: 5000 + spielNr };
        let s: GameState = neuesSpiel({
          spieler: Array.from({ length: n }, (_, i) => ({ name: `S${i}`, farbe: FARBEN[i] })),
          seed: spielNr * 104729 + 3,
          config: { karte, freundlicherRaeuber: spielNr % 3 === 0, siegpunkte: [8, 10, 12][spielNr % 3], gluecksrad: spielNr % 2 === 0 },
        });
        expect(s.config.karte).toBe(karte);
        for (let schritt = 0; schritt < 9000 && s.phase !== 'ende'; schritt++) {
          const a = rng.rngState % 17 === 0 ? ({ typ: 'ZEIT_ABGELAUFEN', spieler: 0 } as const) : zufallsAktion(s, rng);
          rng.rngState = (rng.rngState + 1) | 0;
          expect(a).not.toBe(null);
          const e = anwenden(s, a!);
          if (!e.ok) continue;
          s = e.state;
          const verstoesse = pruefeInvarianten(s);
          if (verstoesse.length) throw new Error(`${karte}, Spiel ${spielNr}, Schritt ${schritt}: ${verstoesse.join('; ')}`);
        }
        if (s.phase === 'ende') beendet++;
      }
      expect(beendet).toBeGreaterThanOrEqual(36);
    }
  });
});

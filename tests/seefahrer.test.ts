import { describe, expect, it } from 'vitest';
import {
  INSEL_BONUS,
  KARTEN_VARIANTE,
  amZug,
  anwenden,
  beweglicheSchiffe,
  erzeugeBrett,
  feldKanten,
  gesamtPunkte,
  gueltigeRaeuberHexes,
  gueltigeSchiffKanten,
  gueltigeSetupEcken,
  gueltigeStrassenKanten,
  inseln,
  istLand,
  kantenFelder,
  kartenFuer,
  neuesSpiel,
  pruefeInvarianten,
  rotRegelOk,
  schiffZiele,
  sichtFuer,
  strassenLaenge,
  waehleKarte,
  zaehleStimmen,
  zufallsAktion,
  type GameState,
  type SeeKarte,
} from '../src/engine';
import { FARBEN, fehler, gib, leere, nachSetup, naechsterWurf, ok, setze, spiel } from './hilfe';

const SEE = kartenFuer('seefahrer') as SeeKarte[];

/** Ecken, die an Land der Startinsel und an Meer grenzen. */
function kuestenEcken(s: GameState): number[] {
  const start = s.brett.startInseln!;
  return s.brett.ecken
    .filter((e) => e.hexes.some((h) => start.includes(s.brett.hexes[h].insel ?? -1)) && e.hexes.some((h) => !istLand(s.brett.hexes[h])))
    .map((e) => e.id);
}

function meerKanten(s: GameState, ecke: number): number[] {
  return s.brett.ecken[ecke].kanten.filter((k) => kantenFelder(s.brett, k).some((h) => !istLand(s.brett.hexes[h])));
}

/** Ein Seefahrer-Spiel im Zustand „aktion“ von Spieler 0, ohne Gebäude und mit leerer Hand. */
function leeresSeeSpiel(karte: SeeKarte = 'neueUfer', n = 3): GameState {
  const s = spiel(n, { karte }, 5);
  s.phase = 'aktion';
  s.zugNr = 1;
  s.aktiv = 0;
  s.setup = { schritt: 2 * n, erwartet: 'siedlung', letzteEcke: null };
  return s;
}

describe('Seefahrer: Bretter', () => {
  for (const karte of SEE)
    for (const gross of [false, true])
      it(`${karte} ${gross ? 'groß' : 'klein'}: Startinseln vollständig, Gold nie rot, Häfen nur an Startinseln`, () => {
        for (let seed = 1; seed <= 120; seed++) {
          const b = erzeugeBrett(gross, 'zufall', { rngState: seed }, karte);
          const land = inseln(b);
          expect(b.startInseln!.length).toBeGreaterThan(0);
          expect(rotRegelOk(b)).toBe(true);
          land.forEach((insel, i) => {
            const g = insel.map((id) => b.hexes[id].gelaende);
            for (const id of insel) expect(b.hexes[id].insel).toBe(i);
            if (b.startInseln!.includes(i)) {
              expect(g.filter((x) => x === 'wueste').length).toBe(1);
              expect(new Set(g.filter((x) => x !== 'wueste' && x !== 'gold')).size).toBe(5);
              expect(g).not.toContain('gold');
            } else expect(g).not.toContain('wueste');
          });
          for (const h of b.hexes) {
            if (h.gelaende === 'meer' || h.gelaende === 'wueste') expect(h.zahl).toBe(null);
            else expect(h.zahl).not.toBe(null);
            if (h.gelaende === 'gold') expect([6, 8]).not.toContain(h.zahl);
            // Jede Küste ist befahrbar: Land hat immer sechs Nachbarn (Land oder Meer)
            if (istLand(h)) expect(h.nachbarn.length).toBe(6);
          }
          expect(b.hexes.some((h) => h.gelaende === 'gold')).toBe(true);
          expect(b.haefen.length).toBeGreaterThan(5);
          for (const hf of b.haefen) {
            const felder = kantenFelder(b, hf.kante).map((h) => b.hexes[h]);
            expect(felder.some((h) => h.gelaende === 'meer')).toBe(true);
            expect(felder.some((h) => b.startInseln!.includes(h.insel ?? -1))).toBe(true);
          }
        }
      });

  it('Variante folgt aus der Karte; Pirat startet im Meer, Räuber in der Wüste', () => {
    for (const karte of SEE) {
      const s = spiel(4, { karte, variante: 'grund' });
      expect(s.config.variante).toBe('seefahrer');
      expect(s.brett.hexes[s.pirat!].gelaende).toBe('meer');
      expect(s.brett.hexes[s.raeuber].gelaende).toBe('wueste');
      expect(s.spieler.every((p) => p.schiffeUebrig === 15)).toBe(true);
    }
    const g = spiel(4, { karte: 'klassik', variante: 'seefahrer' });
    expect(g.config.variante).toBe('grund');
    expect(g.pirat).toBe(null);
    expect(g.spieler.every((p) => p.schiffeUebrig === 0)).toBe(true);
    expect(KARTEN_VARIANTE.archipel).toBe('seefahrer');
  });

  it('Abstimmung zählt nur Karten der gewählten Variante', () => {
    const stimmen = ['klassik', 'klassik', 'archipel'] as const;
    expect(zaehleStimmen(stimmen, 'seefahrer').vorn).toEqual(['archipel']);
    expect(zaehleStimmen(stimmen, 'grund').vorn).toEqual(['klassik']);
    expect(waehleKarte([null, 'klassik'], () => 0, 'seefahrer')).toEqual({ karte: 'neueUfer', los: false });
  });
});

describe('Seefahrer: Gründung', () => {
  it('nur auf Startinseln; als zweites Teil darf es ein Schiff sein', () => {
    let s = spiel(3, { karte: 'neueUfer' });
    const start = s.brett.startInseln!;
    for (const e of gueltigeSetupEcken(s)) expect(s.brett.ecken[e].hexes.some((h) => start.includes(s.brett.hexes[h].insel ?? -1))).toBe(true);
    const ecke = kuestenEcken(s).find((e) => gueltigeSetupEcken(s).includes(e))!;
    s = ok(s, { typ: 'SIEDLUNG_BAUEN', spieler: 0, ecke });
    const schiffe = gueltigeSchiffKanten(s, 0, ecke);
    expect(schiffe.length).toBeGreaterThan(0);
    // Straßen nie auf reinen Meerkanten
    for (const k of gueltigeStrassenKanten(s, 0, ecke)) expect(kantenFelder(s.brett, k).some((h) => istLand(s.brett.hexes[h]))).toBe(true);
    s = ok(s, { typ: 'SCHIFF_BAUEN', spieler: 0, kante: schiffe[0] });
    expect(s.schiffe[schiffe[0]]).toBe(0);
    expect(s.spieler[0].schiffeUebrig).toBe(14);
    expect(s.setup.schritt).toBe(1);
  });

  it('im Grundspiel gibt es keine Schiffe', () => {
    let s = spiel(3);
    s = ok(s, { typ: 'SIEDLUNG_BAUEN', spieler: 0, ecke: gueltigeSetupEcken(s)[0] });
    expect(fehler(s, { typ: 'SCHIFF_BAUEN', spieler: 0, kante: s.brett.ecken[s.setup.letzteEcke!].kanten[0] })).toMatch(/Seefahrer/);
  });
});

describe('Seefahrer: Schiffe', () => {
  it('bauen kostet Holz und Wolle und braucht Anschluss an Gebäude oder eigenes Schiff', () => {
    let s = leeresSeeSpiel();
    const ecke = kuestenEcken(s)[0];
    expect(gueltigeSchiffKanten(s, 0)).toEqual([]);
    setze(s, ecke, 0, 'siedlung');
    const k = meerKanten(s, ecke)[0];
    expect(fehler(s, { typ: 'SCHIFF_BAUEN', spieler: 0, kante: k })).toMatch(/Rohstoffe/);
    gib(s, 0, { holz: 2, wolle: 2 });
    s = ok(s, { typ: 'SCHIFF_BAUEN', spieler: 0, kante: k });
    expect(s.spieler[0].hand.holz).toBe(1);
    expect(s.spieler[0].hand.wolle).toBe(1);
    // Weiter vom eigenen Schiff aus, aber nicht von einer Straße aus
    const weiter = gueltigeSchiffKanten(s, 0);
    expect(weiter.length).toBeGreaterThan(0);
    for (const kid of weiter) {
      const kk = s.brett.kanten[kid];
      expect([kk.a, kk.b].some((e) => e === ecke || s.brett.ecken[e].kanten.some((x) => s.schiffe[x] === 0))).toBe(true);
    }
    // Straßen schließen nicht an Schiffe an
    const fern = s.brett.kanten[k].a === ecke ? s.brett.kanten[k].b : s.brett.kanten[k].a;
    for (const kid of gueltigeStrassenKanten(s, 0)) {
      const kk = s.brett.kanten[kid];
      expect(kk.a === fern || kk.b === fern).toBe(false);
    }
    expect(pruefeInvarianten(s)).toEqual([]);
  });

  it('versetzen: nur das offene Ende, nicht im Bauzug, einmal pro Zug', () => {
    let s = leeresSeeSpiel();
    const ecke = kuestenEcken(s)[0];
    setze(s, ecke, 0, 'siedlung');
    gib(s, 0, { holz: 3, wolle: 3 });
    const k1 = meerKanten(s, ecke)[0];
    s = ok(s, { typ: 'SCHIFF_BAUEN', spieler: 0, kante: k1 });
    const k2 = gueltigeSchiffKanten(s, 0).find((k) => {
      const kk = s.brett.kanten[k];
      return kk.a !== ecke && kk.b !== ecke;
    })!;
    s = ok(s, { typ: 'SCHIFF_BAUEN', spieler: 0, kante: k2 });
    expect(beweglicheSchiffe(s, 0, s.schiffeNeu)).toEqual([]);
    expect(fehler(s, { typ: 'SCHIFF_VERSETZEN', spieler: 0, von: k2, nach: schiffZiele(s, 0, k2)[0] })).toMatch(/nicht versetzen/);
    // nächster Zug von Spieler 0
    s.schiffeNeu = [];
    expect(beweglicheSchiffe(s, 0)).toEqual([k2]); // k1 hängt an der Siedlung und an k2
    const ziel = schiffZiele(s, 0, k2).find((k) => k !== k2)!;
    s = ok(s, { typ: 'SCHIFF_VERSETZEN', spieler: 0, von: k2, nach: ziel });
    expect(s.schiffe[k2]).toBe(undefined);
    expect(s.schiffe[ziel]).toBe(0);
    expect(fehler(s, { typ: 'SCHIFF_VERSETZEN', spieler: 0, von: ziel, nach: k2 })).toMatch(/schon ein Schiff/);
    expect(pruefeInvarianten(s)).toEqual([]);
  });

  it('Handelsroute: Straßen und Schiffe zählen zusammen, Wechsel nur über eigene Siedlung', () => {
    const s = leeresSeeSpiel();
    const ecke = kuestenEcken(s).find((e) => {
      const land = s.brett.ecken[e].kanten.filter((k) => kantenFelder(s.brett, k).every((h) => istLand(s.brett.hexes[h])));
      return land.length > 0 && meerKanten(s, e).length > 0;
    })!;
    const strasse = s.brett.ecken[ecke].kanten.find((k) => !meerKanten(s, ecke).includes(k))!;
    const schiff = meerKanten(s, ecke)[0];
    s.strassen[strasse] = 0;
    s.schiffe[schiff] = 0;
    expect(strassenLaenge(s, 0)).toBe(1);
    setze(s, ecke, 0, 'siedlung');
    expect(strassenLaenge(s, 0)).toBe(2);
    setze(s, ecke, 1, 'siedlung');
    expect(strassenLaenge(s, 0)).toBe(1);
  });
});

describe('Seefahrer: Pirat, Gold, Inseln', () => {
  it('der Pirat sperrt Schiffe an seinem Feld und bestiehlt Schiffseigner', () => {
    let s = leeresSeeSpiel();
    const ecke = kuestenEcken(s)[0];
    setze(s, ecke, 1, 'siedlung');
    const k = meerKanten(s, ecke)[0];
    const meer = kantenFelder(s.brett, k).find((h) => !istLand(s.brett.hexes[h]))!;
    expect(gueltigeSchiffKanten(s, 1)).toContain(k);
    s.pirat = meer;
    expect(gueltigeSchiffKanten(s, 1)).not.toContain(k);
    // Pirat woanders hin und zurück: Diebstahl beim Schiffseigner
    s.pirat = s.brett.hexes.find((h) => !istLand(h) && h.id !== meer)!.id;
    s.schiffe[k] = 1;
    s.spieler[1].schiffeUebrig--;
    gib(s, 1, { erz: 1 });
    s.phase = 'raeuber';
    s.nachRaeuber = 'aktion';
    expect(gueltigeRaeuberHexes(s, 0)).toContain(meer);
    expect(gueltigeRaeuberHexes(s, 0).every((h) => (istLand(s.brett.hexes[h]) ? h !== s.raeuber : h !== s.pirat))).toBe(true);
    s = ok(s, { typ: 'RAEUBER_SETZEN', spieler: 0, hex: meer });
    expect(s.pirat).toBe(meer);
    expect(s.spieler[0].hand.erz).toBe(1);
    expect(feldKanten(s.brett, meer)).toContain(k);
    expect(beweglicheSchiffe(s, 1)).toEqual([]); // am Piraten unbeweglich
    expect(s.log.at(-2)!.text).toMatch(/Piraten/);
  });

  it('Gold: Wurf auf ein Goldfeld lässt frei wählen, danach geht der Zug weiter', () => {
    let s = leeresSeeSpiel();
    const gold = s.brett.hexes.find((h) => h.gelaende === 'gold')!;
    setze(s, gold.ecken[0], 1, 'stadt');
    s.phase = 'wuerfeln';
    naechsterWurf(s, gold.zahl!);
    s = ok(s, { typ: 'WUERFELN', spieler: 0 });
    expect(s.phase).toBe('gold');
    expect(amZug(s)).toEqual([1]);
    expect(fehler(s, { typ: 'GOLD_WAEHLEN', spieler: 1, rohstoffe: { erz: 1 } })).toMatch(/genau 2/);
    s = ok(s, { typ: 'GOLD_WAEHLEN', spieler: 1, rohstoffe: { erz: 1, wolle: 1 } });
    expect(s.phase).toBe('aktion');
    expect(s.spieler[1].hand.erz).toBe(1);
    expect(sichtFuer(s, 0).phase).toBe('aktion');
    expect(pruefeInvarianten(s)).toEqual([]);
  });

  it('Gold mit Zeitablauf wird zufällig gewählt', () => {
    let s = leeresSeeSpiel();
    const gold = s.brett.hexes.find((h) => h.gelaende === 'gold')!;
    setze(s, gold.ecken[0], 2, 'siedlung');
    s.phase = 'wuerfeln';
    naechsterWurf(s, gold.zahl!);
    s = ok(s, { typ: 'WUERFELN', spieler: 0 });
    s = ok(s, { typ: 'ZEIT_ABGELAUFEN', spieler: 0 });
    expect(s.phase).toBe('aktion');
    expect(Object.values(s.spieler[2].hand).reduce((a, b) => a + b, 0)).toBe(1);
  });

  it(`erste Siedlung auf einer neuen Insel bringt ${INSEL_BONUS} Siegpunkte, aber nur einmal je Insel`, () => {
    let s = leeresSeeSpiel();
    const neu = s.brett.hexes.find((h) => h.insel !== undefined && !s.brett.startInseln!.includes(h.insel) && h.gelaende !== 'gold')!;
    const ecken = neu.ecken.filter((e) => s.brett.ecken[e].hexes.every((h) => s.brett.hexes[h].insel === undefined || s.brett.hexes[h].insel === neu.insel));
    const [e1] = ecken;
    // Anschluss über ein eigenes Schiff
    s.schiffe[meerKanten(s, e1)[0]] = 0;
    s.spieler[0].schiffeUebrig--;
    gib(s, 0, { holz: 2, lehm: 2, wolle: 2, getreide: 2 });
    const vorher = gesamtPunkte(s, 0);
    s = ok(s, { typ: 'SIEDLUNG_BAUEN', spieler: 0, ecke: e1 });
    expect(gesamtPunkte(s, 0)).toBe(vorher + 1 + INSEL_BONUS);
    expect(s.spieler[0].inselBonus).toEqual([neu.insel]);
    expect(s.log.some((l) => /neue Insel/.test(l.text))).toBe(true);
    leere(s, 0);
  });

  it('Straßenbau-Karte erlaubt auch kostenlose Schiffe', () => {
    let s = leeresSeeSpiel();
    const ecke = kuestenEcken(s)[0];
    setze(s, ecke, 0, 'siedlung');
    s.spieler[0].entw.push({ typ: 'strassenbau', gekauftInZug: 0 });
    s.stapel.pop();
    s = ok(s, { typ: 'STRASSENBAU_SPIELEN', spieler: 0 });
    s = ok(s, { typ: 'SCHIFF_BAUEN', spieler: 0, kante: meerKanten(s, ecke)[0] });
    expect(s.freieStrassen).toBe(1);
    expect(s.spieler[0].hand.holz).toBe(0);
  });
});

describe('Seefahrer: Simulation', () => {
  it('je 60 Zufallsspiele pro Karte: keine Ausnahmen, Invarianten halten, fast alle enden', () => {
    for (const karte of SEE) {
      let beendet = 0;
      let mitSchiffen = 0;
      let mitBonus = 0;
      let mitGold = 0;
      for (let spielNr = 0; spielNr < 60; spielNr++) {
        const n = 3 + (spielNr % 4);
        const rng = { rngState: 77 + spielNr };
        let s = neuesSpiel({
          spieler: Array.from({ length: n }, (_, i) => ({ name: `S${i}`, farbe: FARBEN[i] })),
          seed: spielNr * 104729 + 3,
          config: { karte, siegpunkte: [10, 12, 14][spielNr % 3], freundlicherRaeuber: spielNr % 3 === 0, gluecksrad: spielNr % 2 === 0 },
        });
        let gold = false;
        for (let schritt = 0; schritt < 9000 && s.phase !== 'ende'; schritt++) {
          const a = rng.rngState % 19 === 0 ? ({ typ: 'ZEIT_ABGELAUFEN', spieler: 0 } as const) : zufallsAktion(s, rng);
          rng.rngState = (rng.rngState + 1) | 0;
          expect(a).not.toBe(null);
          const e = anwenden(s, a!);
          if (!e.ok) continue;
          s = e.state;
          if (s.phase === 'gold') gold = true;
          const v = pruefeInvarianten(s);
          if (v.length) throw new Error(`${karte} Spiel ${spielNr}, Schritt ${schritt}: ${v.join('; ')}`);
        }
        if (s.phase === 'ende') beendet++;
        if (Object.keys(s.schiffe).length > 0) mitSchiffen++;
        if (s.spieler.some((p) => p.inselBonus.length > 0)) mitBonus++;
        if (gold) mitGold++;
      }
      console.log(`${karte}: ${beendet}/60 beendet, Schiffe in ${mitSchiffen}, Insel-Bonus in ${mitBonus}, Gold in ${mitGold}`);
      expect(beendet).toBeGreaterThan(50);
      expect(mitSchiffen).toBeGreaterThan(50);
      expect(mitBonus).toBeGreaterThan(20);
      expect(mitGold).toBeGreaterThan(2);
    }
  });

  it('Zeitablauf spielt eine Seefahrer-Gründung durch', () => {
    const s = nachSetup(spiel(4, { karte: 'archipel' }, 9));
    expect(s.phase === 'wuerfeln' || s.phase === 'gold').toBe(true);
    expect(pruefeInvarianten(s)).toEqual([]);
  });
});

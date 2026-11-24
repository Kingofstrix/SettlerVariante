import { describe, expect, it } from 'vitest';
import { anwenden, istLand, sichtFuer, sichtbareFelder, zufallsAktion, type GameState } from '../src/engine';
import { gib, nachSetup, naechsterWurf, ok, setze, spiel } from './hilfe';

const verdeckt = (s: GameState, ich: number | null): number[] =>
  sichtFuer(s, ich)
    .brett.hexes.filter((h) => h.gelaende === 'nebel')
    .map((h) => h.id);
const land = (s: GameState): number[] => s.brett.hexes.filter(istLand).map((h) => h.id);

/** Felder an den Gebäuden eines Spielers (null = aller). */
function anGebaeuden(s: GameState, sp: number | null): Set<number> {
  return new Set(
    Object.entries(s.gebaeude)
      .filter(([, g]) => sp === null || g.spieler === sp)
      .flatMap(([e]) => s.brett.ecken[Number(e)].hexes),
  );
}

describe('Nebel des Krieges', () => {
  it('aus: Brett unverändert, kein Schlüssel', () => {
    const s = spiel(3);
    const sicht = sichtFuer(s, 0);
    expect(sicht.brett).toBe(s.brett);
    expect(sicht.nebelSchluessel).toBe('');
    expect(sichtbareFelder(s, 0)).toBe(null);
  });

  it('mittel: in der ganzen Gründung ist alles Land verdeckt (auch für den Beamer), danach alles offen', () => {
    let s = spiel(3, { nebel: 'mittel' });
    for (const ich of [0, 1, null]) expect(verdeckt(s, ich)).toEqual(land(s));
    // Zahl und Gelände stehen auch nicht in den Daten
    const sicht = sichtFuer(s, 0);
    expect(sicht.brett.hexes.every((h) => h.zahl === null)).toBe(true);
    // Mitten in der Gründung (zweite Runde) noch verdeckt
    while (s.setup.schritt < 4) s = ok(s, { typ: 'ZEIT_ABGELAUFEN', spieler: 0 });
    expect(verdeckt(s, 1)).toEqual(land(s));
    s = nachSetup(s);
    for (const ich of [0, 1, null]) expect(verdeckt(s, ich)).toEqual([]);
    expect(sichtFuer(s, 0).brett).toBe(s.brett);
  });

  it('mittel: Start-Rohstoffe der zweiten Siedlung sieht nur der Spieler selbst', () => {
    const s = nachSetup(spiel(3, { nebel: 'mittel' }));
    const gruendung = s.log.filter((l) => /gründet eine Siedlung und erhält/.test(l.text));
    expect(gruendung.length).toBe(3);
    for (const l of gruendung) {
      expect(l.text).toMatch(/erhält \d+ Rohstoff/);
      expect(l.geheim!.fuer).toEqual([l.wer]);
      expect(l.geheim!.text).toMatch(/×/);
    }
    // Die Kartenbewegungen verraten den Rohstoff nur dem Empfänger
    const fremd = sichtFuer(s, 0).bewegungen.filter((b) => b.von === null && b.nach !== 0 && b.nach !== null);
    expect(fremd.length).toBeGreaterThan(0);
    expect(fremd.every((b) => b.r === null)).toBe(true);
    expect(sichtFuer(s, 0).bewegungen.filter((b) => b.nach === 0).every((b) => b.r !== null)).toBe(true);
  });

  it('extrem: jeder sieht nur Felder an eigenen Gebäuden, der Beamer alles Aufgedeckte', () => {
    let s = spiel(4, { nebel: 'extrem' });
    expect(verdeckt(s, 0)).toEqual(land(s));
    s = nachSetup(s);
    for (const sp of [0, 1, 2, 3]) {
      const offen = anGebaeuden(s, sp);
      expect(verdeckt(s, sp)).toEqual(land(s).filter((h) => !offen.has(h)));
      for (const h of sichtFuer(s, sp).brett.hexes) if (offen.has(h.id)) expect(h).toEqual(s.brett.hexes[h.id]);
    }
    const alle = anGebaeuden(s, null);
    expect(verdeckt(s, null)).toEqual(land(s).filter((h) => !alle.has(h)));
    // Gleiche Sicht -> dasselbe Brett-Objekt (die Grundebene zeichnet nicht neu)
    expect(sichtFuer(s, 0).brett).toBe(sichtFuer(s, 0).brett);
  });

  it('extrem: eine neue Siedlung lichtet den Nebel nur für ihren Besitzer; bei Spielende ist alles offen', () => {
    let s = nachSetup(spiel(3, { nebel: 'extrem' }));
    s.phase = 'aktion';
    s.aktiv = 0;
    const vorher = verdeckt(s, 0);
    const ecke = s.brett.ecken.find((e) => e.hexes.every((h) => vorher.includes(h)) && !s.gebaeude[e.id] && e.nachbarn.every((n) => !s.gebaeude[n]))!;
    const andere = verdeckt(s, 1);
    setze(s, ecke.id, 0, 'siedlung');
    expect(verdeckt(s, 0).length).toBe(vorher.length - ecke.hexes.length);
    expect(verdeckt(s, 1)).toEqual(andere);
    expect(sichtFuer(s, 0).nebelSchluessel).not.toBe(sichtFuer(s, 1).nebelSchluessel);
    s.phase = 'ende';
    expect(verdeckt(s, 1)).toEqual([]);
  });

  it('extrem: Würfelertrag öffentlich nur als Anzahl, ohne Herkunftsfeld und Rohstoff für andere', () => {
    let s = nachSetup(spiel(3, { nebel: 'extrem' }, 3));
    // Ein Feld an einer Siedlung von Spieler 1 würfeln lassen
    const g1 = Object.entries(s.gebaeude).find(([, g]) => g.spieler === 1)!;
    const hex = s.brett.ecken[Number(g1[0])].hexes.map((h) => s.brett.hexes[h]).find((h) => h.zahl !== null && h.zahl !== 7 && h.id !== s.raeuber)!;
    s.phase = 'wuerfeln';
    naechsterWurf(s, hex.zahl!);
    s = ok(s, { typ: 'WUERFELN', spieler: s.aktiv });
    const wurf = s.log.find((l) => /würfelt/.test(l.text) && l.zug === s.zugNr)!;
    expect(wurf.text).not.toMatch(/Holz|Lehm|Wolle|Getreide|Erz/);
    expect(wurf.text).toMatch(/S1 erhält \d+ Karte/);
    const geheim = s.log.find((l) => l.geheim?.fuer[0] === 1)!;
    expect(sichtFuer(s, 1).log.at(-1)!.text).toMatch(/Dein Ertrag/);
    expect(geheim.geheim!.text).toMatch(/×/);
    // Spieler 0 sieht Spieler 1s Karten nicht und auch nicht, von welchem Feld sie kamen
    const offen0 = anGebaeuden(s, 0);
    for (const b of sichtFuer(s, 0).bewegungen.filter((b) => b.nach === 1)) {
      expect(b.r).toBe(null);
      if (b.hex !== undefined) expect(offen0.has(b.hex)).toBe(true);
    }
    const eigene = sichtFuer(s, 1).bewegungen.filter((b) => b.nach === 1 && b.hex !== undefined);
    expect(eigene.length).toBeGreaterThan(0);
    expect(eigene.every((b) => b.r !== null)).toBe(true);
  });

  it('extrem: der Räuber-Eintrag verrät die Zahl nicht', () => {
    let s = nachSetup(spiel(3, { nebel: 'extrem' }));
    s.phase = 'raeuber';
    s.nachRaeuber = 'aktion';
    const ziel = s.brett.hexes.find((h) => h.zahl !== null && h.id !== s.raeuber)!;
    gib(s, 0, {});
    s = ok(s, { typ: 'RAEUBER_SETZEN', spieler: s.aktiv, hex: ziel.id });
    expect(s.log.find((l) => /Räuber/.test(l.text) && l.zug === s.zugNr)!.text).toMatch(/versetzt den Räuber\.$/);
  });

  it('gilt auch für Seefahrer: Meer bleibt sichtbar, verdeckt wird nur Land', () => {
    const s = spiel(3, { karte: 'neueUfer', nebel: 'mittel' });
    const sicht = sichtFuer(s, 0);
    expect(sicht.brett.hexes.filter((h) => h.gelaende === 'meer').length).toBe(s.brett.hexes.filter((h) => h.gelaende === 'meer').length);
    expect(sicht.brett.hexes.some((h) => h.gelaende === 'gold')).toBe(false);
  });

  it('Zufallsspiele mit Nebel: Sicht nie mit echten Werten verdeckter Felder', () => {
    for (let nr = 0; nr < 12; nr++) {
      let s = spiel(3 + (nr % 4), { nebel: nr % 2 ? 'extrem' : 'mittel', karte: nr % 3 === 0 ? 'neueUfer' : 'klassik' }, 500 + nr);
      const rng = { rngState: nr + 1 };
      for (let schritt = 0; schritt < 3000 && s.phase !== 'ende'; schritt++) {
        const e = anwenden(s, zufallsAktion(s, rng)!);
        if (!e.ok) continue;
        s = e.state;
        if (schritt % 25) continue;
        for (const ich of [null, ...s.spieler.map((p) => p.id)]) {
          const offen = sichtbareFelder(s, ich);
          for (const h of sichtFuer(s, ich).brett.hexes) {
            const echt = s.brett.hexes[h.id];
            if (!istLand(echt) || !offen || offen.has(h.id)) expect(h.gelaende).toBe(echt.gelaende);
            else expect([h.gelaende, h.zahl]).toEqual(['nebel', null]);
          }
        }
      }
    }
  });
});

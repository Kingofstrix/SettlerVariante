import { describe, expect, it } from 'vitest';
import { baueGraph, erzeugeBrett, kuestenKanten, rotRegelOk, type Brett, type Gelaende } from '../src/engine';

function zaehle<T>(l: T[]): Map<T, number> {
  const m = new Map<T, number>();
  for (const x of l) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

function pruefeGraph(b: Brett): void {
  for (const e of b.ecken) {
    expect(e.nachbarn.length).toBeGreaterThanOrEqual(2);
    expect(e.nachbarn.length).toBeLessThanOrEqual(3);
    expect(e.kanten.length).toBe(e.nachbarn.length);
    expect(e.hexes.length).toBeGreaterThanOrEqual(1);
    expect(e.hexes.length).toBeLessThanOrEqual(3);
    for (const n of e.nachbarn) expect(b.ecken[n].nachbarn).toContain(e.id); // symmetrisch
  }
  for (const k of b.kanten) {
    expect(b.ecken[k.a].kanten).toContain(k.id);
    expect(b.ecken[k.b].kanten).toContain(k.id);
  }
  for (const h of b.hexes) {
    expect(new Set(h.ecken).size).toBe(6);
    for (const n of h.nachbarn) expect(b.hexes[n].nachbarn).toContain(h.id);
  }
}

describe('Brettgraph', () => {
  it('kleines Brett: 19 Felder, 54 Ecken, 72 Kanten, 30 Küstenkanten', () => {
    const b = baueGraph(false);
    expect([b.hexes.length, b.ecken.length, b.kanten.length]).toEqual([19, 54, 72]);
    expect(kuestenKanten(b).length).toBe(30);
    pruefeGraph(b);
  });
  it('großes Brett: 30 Felder, 80 Ecken, 109 Kanten, 38 Küstenkanten', () => {
    const b = baueGraph(true);
    expect([b.hexes.length, b.ecken.length, b.kanten.length]).toEqual([30, 80, 109]);
    expect(kuestenKanten(b).length).toBe(38);
    pruefeGraph(b);
  });
});

describe('Brettgenerierung', () => {
  const erwartet = {
    klein: { wald: 4, weide: 4, acker: 4, huegel: 3, gebirge: 3, wueste: 1, zahlen: 18, haefen: 9, alle: 4, wolle: 1 },
    gross: { wald: 6, weide: 6, acker: 6, huegel: 5, gebirge: 5, wueste: 2, zahlen: 28, haefen: 11, alle: 5, wolle: 2 },
  };
  for (const gross of [false, true]) {
    for (const layout of ['zufall', 'anfaenger'] as const) {
      it(`${gross ? 'groß' : 'klein'} / ${layout}: Anzahlen, 6/8-Regel, Häfen`, () => {
        const e = gross ? erwartet.gross : erwartet.klein;
        for (let seed = 1; seed <= (layout === 'zufall' ? 200 : 2); seed++) {
          const b = erzeugeBrett(gross, layout, { rngState: seed });
          const g = zaehle(b.hexes.map((h) => h.gelaende));
          for (const art of ['wald', 'weide', 'acker', 'huegel', 'gebirge', 'wueste'] as Gelaende[]) expect(g.get(art)).toBe(e[art]);
          const zahlen = b.hexes.filter((h) => h.zahl !== null);
          expect(zahlen.length).toBe(e.zahlen);
          for (const h of b.hexes) expect(h.zahl === null).toBe(h.gelaende === 'wueste');
          expect(zahlen.some((h) => h.zahl === 7)).toBe(false);
          expect(rotRegelOk(b)).toBe(true);
          // Häfen
          expect(b.haefen.length).toBe(e.haefen);
          const typen = zaehle(b.haefen.map((h) => h.typ));
          expect(typen.get('alle')).toBe(e.alle);
          expect(typen.get('wolle')).toBe(e.wolle);
          for (const r of ['holz', 'lehm', 'getreide', 'erz'] as const) expect(typen.get(r)).toBe(1);
          const hafenEcken = b.haefen.flatMap((h) => [b.kanten[h.kante].a, b.kanten[h.kante].b]);
          expect(new Set(hafenEcken).size).toBe(e.haefen * 2); // kein Hafen teilt eine Ecke
          expect(b.ecken.filter((x) => x.hafen !== null).length).toBe(e.haefen * 2);
        }
      });
    }
  }
  it('rotRegelOk erkennt benachbarte 6/8', () => {
    const b = erzeugeBrett(false, 'zufall', { rngState: 5 });
    const h = b.hexes.find((x) => x.zahl !== null && b.hexes[x.nachbarn[0]].zahl !== null)!;
    h.zahl = 6;
    b.hexes[h.nachbarn[0]].zahl = 8;
    expect(rotRegelOk(b)).toBe(false);
    b.hexes[h.nachbarn[0]].zahl = 6;
    expect(rotRegelOk(b)).toBe(false);
  });
  it('Anfänger-Layout ist fest (unabhängig vom Seed), Zufall hängt vom Seed ab', () => {
    const a = erzeugeBrett(false, 'anfaenger', { rngState: 1 });
    const b = erzeugeBrett(false, 'anfaenger', { rngState: 999 });
    expect(a.hexes.map((h) => [h.gelaende, h.zahl])).toEqual(b.hexes.map((h) => [h.gelaende, h.zahl]));
    const c = erzeugeBrett(false, 'zufall', { rngState: 1 });
    const d = erzeugeBrett(false, 'zufall', { rngState: 1 });
    const e = erzeugeBrett(false, 'zufall', { rngState: 2 });
    expect(c).toEqual(d);
    expect(c.hexes.map((h) => h.zahl)).not.toEqual(e.hexes.map((h) => h.zahl));
  });
});

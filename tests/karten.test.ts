import { describe, expect, it } from 'vitest';
import {
  KARTEN,
  baueGraph,
  erzeugeBrett,
  feldKoordinaten,
  gelaendeFuer,
  inseln,
  istKarte,
  kuestenKanten,
  neuesSpiel,
  rotRegelOk,
  waehleKarte,
  zaehleStimmen,
  zahlenFuer,
  type Brett,
  type Gelaende,
  type KartenId,
} from '../src/engine';
import { FARBEN } from './hilfe';

const NEUE = KARTEN.filter((k) => k !== 'klassik');
const ROHSTOFF_GELAENDE: Gelaende[] = ['wald', 'weide', 'acker', 'huegel', 'gebirge'];

/** Wasserfelder im Rahmen um die Karte, die vom offenen Meer aus nicht erreichbar sind. */
function binnenseen(koord: [number, number][]): number {
  const land = new Set(koord.map(([q, r]) => `${q},${r}`));
  const qs = koord.map((k) => k[0]);
  const rs = koord.map((k) => k[1]);
  const [q0, q1, r0, r1] = [Math.min(...qs) - 6, Math.max(...qs) + 6, Math.min(...rs) - 2, Math.max(...rs) + 2];
  const offen = new Set<string>([`${q0},${r0}`]);
  const stapel: [number, number][] = [[q0, r0]];
  while (stapel.length) {
    const [q, r] = stapel.pop()!;
    for (const [dq, dr] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
      const [nq, nr] = [q + dq, r + dr];
      const key = `${nq},${nr}`;
      if (nq < q0 || nq > q1 || nr < r0 || nr > r1 || land.has(key) || offen.has(key)) continue;
      offen.add(key);
      stapel.push([nq, nr]);
    }
  }
  return (q1 - q0 + 1) * (r1 - r0 + 1) - land.size - offen.size;
}

function pruefeGraph(b: Brett): void {
  for (const e of b.ecken) {
    expect(e.nachbarn.length).toBeGreaterThanOrEqual(2);
    expect(e.nachbarn.length).toBeLessThanOrEqual(3);
    expect(e.kanten.length).toBe(e.nachbarn.length);
    for (const n of e.nachbarn) expect(b.ecken[n].nachbarn).toContain(e.id);
  }
  for (const h of b.hexes) {
    expect(new Set(h.ecken).size).toBe(6);
    for (const n of h.nachbarn) expect(b.hexes[n].nachbarn).toContain(h.id);
  }
}

describe('Kartenformen', () => {
  const erwartet: Record<Exclude<KartenId, 'klassik'>, { klein: number; gross: number; inseln: number }> = {
    zwillinge: { klein: 26, gross: 38, inseln: 2 },
    spirale: { klein: 33, gross: 39, inseln: 1 },
    fjorde: { klein: 25, gross: 37, inseln: 1 },
  };
  for (const karte of NEUE) {
    for (const gross of [false, true]) {
      it(`${karte} ${gross ? 'groß' : 'klein'}: Feldzahl, Inseln, gültiger Graph, höchstens sieben Zeilen, keine Binnenseen`, () => {
        const koord = feldKoordinaten(karte, gross);
        expect(new Set(koord.map(String)).size).toBe(koord.length); // kein Feld doppelt
        expect(koord.length).toBe(gross ? erwartet[karte].gross : erwartet[karte].klein);
        const rs = koord.map((k) => k[1]);
        expect(Math.max(...rs) - Math.min(...rs)).toBeLessThanOrEqual(6);
        expect(binnenseen(koord)).toBe(0);
        const b = baueGraph(gross, koord);
        pruefeGraph(b);
        expect(inseln(b).length).toBe(erwartet[karte].inseln);
        // Platz für alle Häfen: Küstenkanten ohne gemeinsame Ecke gibt es reichlich
        expect(kuestenKanten(b).length).toBeGreaterThan(40);
      });
    }
  }
  it('Klassik bleibt das bekannte Brett', () => {
    expect(feldKoordinaten('klassik', false).length).toBe(19);
    expect(feldKoordinaten('klassik', true).length).toBe(30);
    expect(erzeugeBrett(false, 'zufall', { rngState: 7 }, 'klassik')).toEqual(erzeugeBrett(false, 'zufall', { rngState: 7 }));
  });
  it('istKarte lässt nur bekannte Karten durch', () => {
    for (const k of KARTEN) expect(istKarte(k)).toBe(true);
    for (const x of ['', 'Klassik', 'atlantis', null, undefined, 3, {}]) expect(istKarte(x)).toBe(false);
  });
});

describe('Belegung freier Karten', () => {
  it('Gelände im Verhältnis des Grundspiels, Zahlen ohne 7, eine Zahl je Ertragsfeld', () => {
    expect(gelaendeFuer(19).sort()).toEqual(
      [...Array(4).fill('wald'), ...Array(4).fill('weide'), ...Array(4).fill('acker'), ...Array(3).fill('huegel'), ...Array(3).fill('gebirge'), 'wueste'].sort(),
    );
    for (let n = 19; n <= 45; n++) {
      const g = gelaendeFuer(n);
      expect(g.length).toBe(n);
      const anzahl = ROHSTOFF_GELAENDE.map((a) => g.filter((x) => x === a).length);
      expect(Math.max(...anzahl) - Math.min(...anzahl)).toBeLessThanOrEqual(3);
      const zahlen = zahlenFuer(n - g.filter((x) => x === 'wueste').length);
      expect(zahlen.length).toBe(g.filter((x) => x !== 'wueste').length);
      expect(zahlen.every((z) => z >= 2 && z <= 12 && z !== 7)).toBe(true);
    }
  });
  for (const karte of NEUE) {
    for (const gross of [false, true]) {
      it(`${karte} ${gross ? 'groß' : 'klein'}: 6/8-Regel, Häfen ohne geteilte Ecken, jede Insel mit allen Rohstoffen`, () => {
        for (let seed = 1; seed <= 100; seed++) {
          const b = erzeugeBrett(gross, 'zufall', { rngState: seed }, karte);
          expect(b.gross).toBe(gross);
          for (const h of b.hexes) expect(h.zahl === null).toBe(h.gelaende === 'wueste');
          expect(b.hexes.some((h) => h.gelaende === 'wueste')).toBe(true); // Startfeld des Räubers
          expect(rotRegelOk(b)).toBe(true);
          expect(b.haefen.length).toBe(gross ? 11 : 9);
          const hafenEcken = b.haefen.flatMap((h) => [b.kanten[h.kante].a, b.kanten[h.kante].b]);
          expect(new Set(hafenEcken).size).toBe(b.haefen.length * 2);
          expect(b.ecken.filter((x) => x.hafen !== null).length).toBe(b.haefen.length * 2);
          // Jeder Hafen liegt an einer Küstenkante
          const kueste = new Set(kuestenKanten(b).map((k) => k.kante));
          for (const h of b.haefen) expect(kueste.has(h.kante)).toBe(true);
          const landmassen = inseln(b);
          for (const insel of landmassen) {
            const arten = insel.map((id) => b.hexes[id].gelaende);
            for (const a of ROHSTOFF_GELAENDE) expect(arten).toContain(a);
            if (landmassen.length > 1) expect(arten.filter((a) => a === 'wueste').length).toBeLessThanOrEqual(1);
          }
        }
      });
    }
  }
  it('Zwillingsinseln: beide Inseln bekommen Häfen', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const b = erzeugeBrett(false, 'zufall', { rngState: seed }, 'zwillinge');
      const jeInsel = inseln(b).map((insel) => {
        const ecken = new Set(insel.flatMap((id) => b.hexes[id].ecken));
        return b.haefen.filter((h) => ecken.has(b.kanten[h.kante].a)).length;
      });
      expect(Math.min(...jeInsel)).toBeGreaterThanOrEqual(2);
    }
  });
  it('gleicher Seed, gleiche Karte: gleiches Brett; die Karte steht in der Konfiguration und im Log', () => {
    const spieler = [0, 1, 2].map((i) => ({ name: `S${i}`, farbe: FARBEN[i] }));
    const a = neuesSpiel({ spieler, seed: 42, config: { karte: 'fjorde' } });
    const b = neuesSpiel({ spieler, seed: 42, config: { karte: 'fjorde' } });
    expect(a.brett).toEqual(b.brett);
    expect(a.config.karte).toBe('fjorde');
    expect(a.brett.hexes.length).toBe(25);
    expect(a.log.some((l) => l.text === 'Karte: Fjordland.')).toBe(true);
    const mitHinweis = neuesSpiel({ spieler, seed: 42, config: { karte: 'klassik' }, kartenHinweis: '2 von 3 Stimmen' });
    expect(mitHinweis.log.some((l) => l.text === 'Karte: Klassik (2 von 3 Stimmen).')).toBe(true);
    // Ohne Abstimmung bleibt das Log des klassischen Spiels wie bisher
    expect(neuesSpiel({ spieler, seed: 42 }).log.some((l) => l.text.startsWith('Karte:'))).toBe(false);
  });
});

describe('Abstimmung', () => {
  it('zählt Stimmen; ohne Stimmen gilt Klassik', () => {
    expect(zaehleStimmen([null, null, undefined])).toEqual({
      stimmen: { klassik: 0, zwillinge: 0, spirale: 0, fjorde: 0 },
      abgegeben: 0,
      vorn: ['klassik'],
    });
    const z = zaehleStimmen(['spirale', 'fjorde', 'spirale', null]);
    expect(z.stimmen.spirale).toBe(2);
    expect(z.abgegeben).toBe(3);
    expect(z.vorn).toEqual(['spirale']);
  });
  it('die meisten Stimmen gewinnen ohne Los', () => {
    const niemals = (): number => {
      throw new Error('Los darf nicht gezogen werden');
    };
    expect(waehleKarte(['fjorde', 'fjorde', 'klassik'], niemals)).toEqual({ karte: 'fjorde', los: false });
    expect(waehleKarte([null, null, null], niemals)).toEqual({ karte: 'klassik', los: false });
    expect(waehleKarte([null, 'zwillinge', null], niemals)).toEqual({ karte: 'zwillinge', los: false });
  });
  it('Gleichstand: das Los wählt nur unter den führenden Karten', () => {
    const stimmen: KartenId[] = ['spirale', 'fjorde', 'spirale', 'fjorde', 'klassik'];
    expect(waehleKarte(stimmen, () => 0)).toEqual({ karte: 'spirale', los: true });
    expect(waehleKarte(stimmen, () => 0.49)).toEqual({ karte: 'spirale', los: true });
    expect(waehleKarte(stimmen, () => 0.5)).toEqual({ karte: 'fjorde', los: true });
    expect(waehleKarte(stimmen, () => 0.999999)).toEqual({ karte: 'fjorde', los: true });
  });
});
